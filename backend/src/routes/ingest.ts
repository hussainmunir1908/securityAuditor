/**
 * src/routes/ingest.ts
 * --------------------
 * Repository Ingestion API.
 * Handles cloning GitHub repositories and parsing them for the RAG knowledge base.
 */

import { Router, Request, Response } from 'express';
import { Octokit } from '@octokit/rest';
import { requireAuth } from '../middleware/auth';
import { supabase } from '../config/supabase';
import { structurallyChunkFile } from '../utils/chunker';
import { generateEmbedding } from '../utils/embeddings';

const router = Router();
router.use(requireAuth);

// Helper to determine file language from extension
function getLanguageFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    'ts': 'typescript', 'tsx': 'typescript',
    'js': 'javascript', 'jsx': 'javascript',
    'py': 'python',
    'java': 'java',
    'c': 'c', 'cpp': 'cpp', 'cc': 'cpp', 'h': 'c', 'hpp': 'cpp',
    'cs': 'csharp',
    'go': 'go',
    'rb': 'ruby',
    'php': 'php',
    'sql': 'sql',
    'json': 'json',
    'md': 'markdown'
  };
  return map[ext] || 'unknown';
}

// Extensions we want to ignore (binaries, lockfiles, media)
const IGNORED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'pdf', 'zip', 'tar', 'gz', 'mp4', 'mp3', 'wav', 'lock'];
const IGNORED_DIRECTORIES = ['node_modules', 'dist', 'build', '.git', '.next'];

/**
 * POST /api/ingest/github
 * Accepts a repositoryId, fetches it from GitHub, chunks files, and generates embeddings.
 */
router.post('/github', async (req: Request, res: Response): Promise<void> => {
  try {
    const { repositoryId } = req.body;
    const userId = req.user?.id; // from requireAuth

    if (!repositoryId || !userId) {
      res.status(400).json({ error: 'Missing repositoryId or unauthenticated user.' });
      return;
    }

    // 1. Fetch Repo and Profile info
    const { data: repo, error: repoError } = await supabase
      .from('repositories')
      .select('*')
      .eq('id', repositoryId)
      .single();

    if (repoError || !repo) {
      res.status(404).json({ error: 'Repository not found.' });
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('github_access_token')
      .eq('id', userId)
      .single();

    if (profileError || !profile?.github_access_token) {
      res.status(403).json({ error: 'GitHub access token not found for user.' });
      return;
    }

    // 2. Set status to processing
    await supabase.from('repositories').update({ ingestion_status: 'processing' }).eq('id', repositoryId);

    // Return early to the client so they don't wait for the long ingestion process
    res.status(202).json({ message: 'Ingestion started.', repositoryId });

    // 3. Kick off async ingestion
    (async () => {
      try {
        const octokit = new Octokit({ auth: profile.github_access_token });
        
        // repo.repo_name should be formatted as "owner/repo"
        const [owner, repoName] = repo.repo_name.split('/');
        if (!owner || !repoName) {
          throw new Error('Invalid repository name format. Expected "owner/repo".');
        }

        // Fetch repository tree recursively
        const { data: commit } = await octokit.repos.getCommit({
          owner,
          repo: repoName,
          ref: 'HEAD'
        });
        const treeSha = commit.commit.tree.sha;

        const { data: tree } = await octokit.git.getTree({
          owner,
          repo: repoName,
          tree_sha: treeSha,
          recursive: 'true'
        });

        const filesToProcess = tree.tree.filter(item => {
          if (item.type !== 'blob') return false;
          if (!item.path) return false;
          
          const pathSegments = item.path.split('/');
          const filename = pathSegments[pathSegments.length - 1];
          const ext = filename.split('.').pop()?.toLowerCase() || '';

          // Filter out ignored extensions and directories
          if (IGNORED_EXTENSIONS.includes(ext)) return false;
          if (pathSegments.some(segment => IGNORED_DIRECTORIES.includes(segment))) return false;

          return true;
        });

        // 4. Process each file
        for (const fileNode of filesToProcess) {
          try {
             // Fetch file content
             const { data: blob } = await octokit.git.getBlob({
               owner,
               repo: repoName,
               file_sha: fileNode.sha!
             });

             const content = Buffer.from(blob.content, 'base64').toString('utf8');
             const language = getLanguageFromFilename(fileNode.path!);

             // 5. Chunk the file
             const chunks = structurallyChunkFile(content, language);

             // 6. Generate embeddings and store
             for (let i = 0; i < chunks.length; i++) {
               const chunk = chunks[i];
               const embedding = await generateEmbedding(chunk.content);

               await supabase.from('code_chunks').insert({
                 repository_id: repositoryId,
                 file_path: fileNode.path,
                 start_line: chunk.startLine,
                 end_line: chunk.endLine,
                 content: chunk.content,
                 language: language,
                 chunk_index: i,
                 embedding: embedding
               });
             }
          } catch (fileErr) {
            console.error(`Error processing file ${fileNode.path}:`, fileErr);
            // Continue processing other files
          }
        }

        // 7. Mark as completed
        await supabase.from('repositories').update({ ingestion_status: 'completed' }).eq('id', repositoryId);
        console.log(`✅ Ingestion completed for repository ${repo.repo_name}`);

      } catch (ingestErr) {
        console.error('Ingestion process failed:', ingestErr);
        await supabase.from('repositories').update({ ingestion_status: 'failed' }).eq('id', repositoryId);
      }
    })();

  } catch (error) {
    console.error('Error in /api/ingest/github handler:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
});

/**
 * GET /api/ingest/status/:jobId
 * Returns the current status of an ingestion job (the repository).
 */
router.get('/status/:repositoryId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { repositoryId } = req.params;
    const { data, error } = await supabase
      .from('repositories')
      .select('ingestion_status')
      .eq('id', repositoryId)
      .single();

    if (error || !data) {
      res.status(404).json({ error: 'Repository not found.' });
      return;
    }

    res.json({ status: data.ingestion_status });
  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * GET /api/ingest/repositories
 * Lists all repositories that have been ingested by the current user.
 */
router.get('/repositories', async (req: Request, res: Response): Promise<void> => {
   try {
    const userId = req.user?.id;
    if (!userId) {
       res.status(401).json({ error: 'Unauthenticated.' });
       return;
    }

    const { data, error } = await supabase
      .from('repositories')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      res.status(500).json({ error: 'Database error fetching repositories.' });
      return;
    }

    res.json({ repositories: data });
  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
