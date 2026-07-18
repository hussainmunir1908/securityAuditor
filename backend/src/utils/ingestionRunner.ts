/**
 * src/utils/ingestionRunner.ts
 * ----------------------------
 * Shared background ingestion logic + auto-scan trigger.
 *
 * Flow:
 *   1. Fetch the repo tree from GitHub
 *   2. Chunk and embed each file
 *   3. Mark ingestion as 'completed'
 *   4. AUTO-TRIGGER the full SAST scan pipeline
 *   5. Update last_scanned_at
 */

import { Octokit } from '@octokit/rest';
import { supabase } from '../config/supabase';
import { structurallyChunkFile } from './chunker';
import { generateEmbeddingWithTimeout } from './embeddings';
import { runScanForChunk } from './langgraph';
import { CodeChunk, ScanFinding } from '../types';

const IGNORED_EXTENSIONS = [
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp', 'avif',
  'pdf', 'zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar',
  'mp4', 'mp3', 'wav', 'ogg', 'flac', 'avi', 'mov',
  'woff', 'woff2', 'ttf', 'eot', 'otf',
  'lock',       // ← catches *.lock files (yarn.lock etc.)
  'map',        // ← source maps — never security-relevant
  'min',        // ← minified files
];

// Files to skip by exact name — these are always noise for SAST
const IGNORED_FILE_NAMES = new Set([
  'package-lock.json',    // npm lock file — thousands of lines of dep metadata
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'pnpm-lock.yml',
  'bun.lockb',
  'Gemfile.lock',
  'poetry.lock',
  'Pipfile.lock',
  'Cargo.lock',
  'composer.lock',
  'Podfile.lock',
  'Package.resolved',
  '.yarn.lock',
  'go.sum',               // Go module checksums — not source code
  'Makefile.lock',
  'shrinkwrap.json',
]);

const IGNORED_DIRECTORIES = [
  'node_modules', 'dist', 'build', '.git', '.next', '.nuxt',
  '__pycache__', '.gradle', 'vendor', '.venv', 'venv',
  'coverage', '.nyc_output', '.turbo', '.cache',
];

// Raised cap to process larger repos
const MAX_FILES = 500;

function getLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript',
    py: 'python', java: 'java',
    c: 'c', cpp: 'cpp', cc: 'cpp', h: 'c', hpp: 'cpp',
    cs: 'csharp', go: 'go', rb: 'ruby', php: 'php',
    sql: 'sql', json: 'json', md: 'markdown',
    kt: 'kotlin', swift: 'swift', rs: 'rust',
    yml: 'yaml', yaml: 'yaml', xml: 'xml',
    sh: 'bash', bash: 'bash',
    ejs: 'javascript', pug: 'javascript', jade: 'javascript',
    html: 'html', htm: 'html',
  };
  return map[ext] ?? 'unknown';
}

/**
 * Runs the full ingestion pipeline for a repository,
 * then automatically runs the SAST scan pipeline.
 */
export async function runIngestion(
  repositoryId:  string,
  profileId:     string,
  repoName:      string,
  githubToken:   string
): Promise<void> {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`[ingestion] ▶ Starting: ${repoName} (repo: ${repositoryId})`);
  console.log(`${'═'.repeat(70)}`);

  try {
    const octokit = new Octokit({ auth: githubToken });
    const [owner, repo] = repoName.split('/');

    if (!owner || !repo) {
      throw new Error(`Invalid repo name format: "${repoName}". Expected "owner/repo".`);
    }

    // ── Step 1: Get repository tree ─────────────────────────────────────────
    let treeSha: string;
    try {
      const { data: repoInfo } = await octokit.repos.get({ owner, repo });
      const defaultBranch = repoInfo.default_branch;
      const { data: branchData } = await octokit.repos.getBranch({ owner, repo, branch: defaultBranch });
      treeSha = branchData.commit.commit.tree.sha;
    } catch (treeErr) {
      // Fallback: try HEAD commit directly
      const { data: commit } = await octokit.repos.getCommit({ owner, repo, ref: 'HEAD' });
      treeSha = commit.commit.tree.sha;
    }

    const { data: tree } = await octokit.git.getTree({
      owner, repo,
      tree_sha: treeSha,
      recursive: 'true',
    });

    const filesToProcess = tree.tree.filter(item => {
      if (item.type !== 'blob' || !item.path || !item.sha) return false;
      const segs    = item.path.split('/');
      const fname   = segs[segs.length - 1];                          // e.g. "package-lock.json"
      const ext     = fname.split('.').pop()?.toLowerCase() ?? '';    // e.g. "json"

      // Skip by exact file name first (catches package-lock.json etc.)
      if (IGNORED_FILE_NAMES.has(fname)) return false;

      // Skip by extension
      if (IGNORED_EXTENSIONS.includes(ext)) return false;

      // Skip files inside ignored directories
      if (segs.some(s => IGNORED_DIRECTORIES.includes(s))) return false;

      // Skip oversized blobs (> 200KB) — generated/bundled files
      if (item.size && item.size > 200_000) return false;

      return true;
    }).slice(0, MAX_FILES);    // hard cap — never process more than MAX_FILES

    console.log(`[ingestion] ${repoName}: ${filesToProcess.length} files to process (cap: ${MAX_FILES})`);

    if (filesToProcess.length === 0) {
      console.warn(`[ingestion] No processable files found in ${repoName}. Marking completed.`);
      await supabase
        .from('repositories')
        .update({ ingestion_status: 'completed' })
        .eq('id', repositoryId);
      return;
    }

    // ── Step 2: Clear old chunks for this repo ──────────────────────────────
    await supabase.from('code_chunks').delete().eq('repository_id', repositoryId);

    // ── Step 3: Process files ───────────────────────────────────────────────
    let filesProcessed = 0;
    let totalChunks = 0;

    for (const fileNode of filesToProcess) {
      try {
        const { data: blob } = await octokit.git.getBlob({
          owner, repo, file_sha: fileNode.sha!,
        });

        // GitHub returns base64-encoded content with newlines — strip them
        const content = Buffer.from(blob.content.replace(/\n/g, ''), 'base64').toString('utf8');

        // Skip non-UTF8 / binary files that slipped through the extension filter
        if (content.includes('\u0000')) continue;

        const language = getLanguage(fileNode.path!);
        const chunks = structurallyChunkFile(content, language);

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const embedding = await generateEmbeddingWithTimeout(chunk.content);

          const { error: insertErr } = await supabase.from('code_chunks').insert({
            repository_id: repositoryId,
            profile_id:    profileId,
            file_path:     fileNode.path,
            start_line:    chunk.startLine,
            end_line:      chunk.endLine,
            content:       chunk.content,
            language,
            chunk_index:   i,
            embedding,
          });

          if (insertErr) {
            console.error(`[ingestion] Insert failed for ${fileNode.path}[${i}]: ${insertErr.message}`);
          } else {
            totalChunks++;
          }
        }

        filesProcessed++;
        if (filesProcessed % 10 === 0) {
          console.log(`[ingestion] ${repoName}: ${filesProcessed}/${filesToProcess.length} files done (${totalChunks} chunks)`);
        }

      } catch (fileErr) {
        // One bad file never aborts the job
        console.error(`[ingestion] Skipping ${fileNode.path}:`, fileErr);
      }
    }

    // ── Step 4: Mark ingestion completed ─────────────────────────────────────
    await supabase
      .from('repositories')
      .update({ ingestion_status: 'completed' })
      .eq('id', repositoryId);

    console.log(`\n${'─'.repeat(70)}`);
    console.log(`[ingestion] ✅ Ingestion complete: ${repoName} (${filesProcessed}/${filesToProcess.length} files, ${totalChunks} chunks)`);
    console.log(`[ingestion] 🚀 Auto-starting SAST scan...`);
    console.log(`${'─'.repeat(70)}\n`);

    // ── Step 5: AUTO-TRIGGER SCAN ────────────────────────────────────────────
    await runAutoScan(repositoryId, profileId, repoName);

  } catch (err) {
    console.error(`[ingestion] ❌ Fatal error for ${repoName}:`, err);

    const { error: updateErr } = await supabase
      .from('repositories')
      .update({ ingestion_status: 'failed' })
      .eq('id', repositoryId);

    if (updateErr) {
      console.error(`[ingestion] CRITICAL: Could not set failed status: ${updateErr.message}`);
    }
  }
}

/**
 * Runs the full multi-agent SAST scan on all code_chunks for a repository.
 * Called automatically after ingestion completes.
 */
async function runAutoScan(
  repositoryId: string,
  profileId: string,
  repoName: string
): Promise<void> {
  try {
    // Clear any previous scan results
    await supabase.from('scan_results').delete().eq('repository_id', repositoryId);

    // Fetch all code chunks
    const { data: chunks, error: chunksError } = await supabase
      .from('code_chunks')
      .select('*')
      .eq('repository_id', repositoryId);

    if (chunksError || !chunks || chunks.length === 0) {
      console.error(`[auto-scan] No chunks to scan for ${repoName}.`);
      return;
    }

    console.log(`[auto-scan] 🔬 Scanning ${chunks.length} chunks for "${repoName}"...`);

    const allFindings: Array<ScanFinding & { file_path: string; start_line: number; ai_prompt: string | null }> = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i] as CodeChunk;
      try {
        const result = await runScanForChunk(chunk);
        const findings = result.findings;

        for (const f of findings) {
          allFindings.push({
            ...f,
            file_path:  chunk.file_path,
            start_line: chunk.start_line,
            ai_prompt:  result.aiPrompt,
          });
        }

        if (findings.length > 0) {
          console.log(
            `[auto-scan] ${chunk.file_path}:${chunk.start_line} → ` +
            `${findings.length} finding(s)`
          );
        }

        // Progress log every 10 chunks
        if ((i + 1) % 10 === 0 || i === chunks.length - 1) {
          console.log(`[auto-scan] Progress: ${i + 1}/${chunks.length} chunks scanned, ${allFindings.length} findings so far`);
        }
      } catch (chunkErr) {
        console.error(`[auto-scan] Failed to process chunk ${chunk.id} (${chunk.file_path}):`, chunkErr);
      }
    }

    // Bulk insert findings
    if (allFindings.length > 0) {
      const rows = allFindings.map(f => ({
        repository_id: repositoryId,
        profile_id:    profileId,
        severity:      f.severity,
        rule_id:       f.rule_id,
        file_path:     f.file_path,
        line_number:   f.line_number ?? null,
        snippet:       f.snippet ?? null,
        description:   f.description,
        remediation:   f.remediation,
        ai_coder_prompt: f.ai_prompt,
        cwe_id:        f.cwe_id ?? null,
        confidence:    f.confidence ?? null,
      }));

      // Insert in batches of 50 to avoid request size limits
      for (let j = 0; j < rows.length; j += 50) {
        const batch = rows.slice(j, j + 50);
        const { error: insertError } = await supabase
          .from('scan_results')
          .insert(batch);

        if (insertError) {
          console.error(`[auto-scan] Failed to insert batch ${j}:`, insertError.message);
        }
      }
    }

    // Update last_scanned_at
    await supabase
      .from('repositories')
      .update({ last_scanned_at: new Date().toISOString() })
      .eq('id', repositoryId);

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`[auto-scan] ✅ Scan complete for "${repoName}". Total findings: ${allFindings.length}`);
    console.log(`${'═'.repeat(70)}\n`);

  } catch (err) {
    console.error(`[auto-scan] ❌ Fatal error during scan of ${repoName}:`, err);
  }
}

/**
 * Launches runIngestion in the background after the current event loop tick.
 * Use this inside route handlers AFTER res.json() has been called.
 */
export function launchIngestion(
  repositoryId:  string,
  profileId:     string,
  repoName:      string,
  githubToken:   string
): void {
  setImmediate(() => {
    void runIngestion(repositoryId, profileId, repoName, githubToken);
  });
}
