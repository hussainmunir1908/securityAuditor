/**
 * src/routes/upload.ts
 * --------------------
 * Zip File Upload Ingestion API.
 * Receives a ZIP file containing a codebase, extracts it in-memory, chunks, and embeds it.
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';
import { requireAuth } from '../middleware/auth';
import { supabase } from '../config/supabase';
import { structurallyChunkFile } from '../utils/chunker';
import { generateEmbedding } from '../utils/embeddings';

const router = Router();
router.use(requireAuth);

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  }
});

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
const IGNORED_DIRECTORIES = ['node_modules', 'dist', 'build', '.git', '.next', '__MACOSX'];

/**
 * POST /api/upload
 * Expects a multipart/form-data request with a 'file' field containing the .zip
 * and a 'repositoryName' field.
 */
router.post('/', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    const file = req.file;
    const { repositoryName } = req.body;
    const profileId = req.user?.id; // profiles.id from JWT

    if (!file) {
      res.status(400).json({ error: 'No file uploaded.' });
      return;
    }
    
    if (!file.originalname.endsWith('.zip')) {
      res.status(400).json({ error: 'Only .zip files are supported.' });
      return;
    }

    if (!repositoryName) {
      res.status(400).json({ error: 'Missing repositoryName.' });
      return;
    }

    // 1. Create a repository entry in Supabase
    const { data: repoData, error: repoError } = await supabase
      .from('repositories')
      .insert({
         profile_id: profileId,           // FK → profiles.id
         repo_name: repositoryName,
         github_repo_url: 'local-upload', // required NOT NULL in schema
         default_branch: 'main',          // required NOT NULL in schema
         ingestion_status: 'processing'
      })
      .select('id')
      .single();

    if (repoError || !repoData) {
      console.error('Error creating repository entry:', repoError);
      res.status(500).json({ error: 'Failed to create repository entry.' });
      return;
    }

    const repositoryId = repoData.id;

    // Return early to the client
    res.status(202).json({ message: 'Upload received, ingestion started.', repositoryId });

    // 2. Async processing of the ZIP file
    (async () => {
      try {
        const zip = new AdmZip(file.buffer);
        const zipEntries = zip.getEntries();

        for (const zipEntry of zipEntries) {
          if (zipEntry.isDirectory) continue;

          const pathSegments = zipEntry.entryName.split('/');
          const filename = pathSegments[pathSegments.length - 1];
          const ext = filename.split('.').pop()?.toLowerCase() || '';

          // Filter ignored extensions and directories
          if (IGNORED_EXTENSIONS.includes(ext)) continue;
          if (pathSegments.some(segment => IGNORED_DIRECTORIES.includes(segment))) continue;

          try {
             const content = zipEntry.getData().toString('utf8');
             // Quick check to avoid processing binary files that weren't caught by extension filter
             // If the file has a lot of null bytes, it's likely binary.
             if (content.indexOf('\0') !== -1) continue;

             const language = getLanguageFromFilename(filename);
             const chunks = structurallyChunkFile(content, language);

             for (let i = 0; i < chunks.length; i++) {
               const chunk = chunks[i];
               const embedding = await generateEmbedding(chunk.content);

               await supabase.from('code_chunks').insert({
                 repository_id: repositoryId,
                 profile_id: profileId,    // required NOT NULL FK in real schema
                 file_path: zipEntry.entryName,
                 start_line: chunk.startLine,
                 end_line: chunk.endLine,
                 content: chunk.content,
                 language: language,
                 chunk_index: i,
                 embedding: embedding
               });
             }
          } catch (fileErr) {
             console.error(`Error processing zipped file ${zipEntry.entryName}:`, fileErr);
          }
        }

        // Mark as completed
        await supabase.from('repositories').update({ ingestion_status: 'completed' }).eq('id', repositoryId);
        console.log(`✅ Upload ingestion completed for ${repositoryName}`);

      } catch (err) {
        console.error('Error during ZIP processing:', err);
        await supabase.from('repositories').update({ ingestion_status: 'failed' }).eq('id', repositoryId);
      }
    })();

  } catch (error) {
    console.error('Error in /api/upload handler:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
});

export default router;
