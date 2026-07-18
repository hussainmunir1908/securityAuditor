/**
 * src/routes/ingest.ts
 * --------------------
 * Repository Ingestion API — Single-repo-at-a-time design.
 *
 * Routes:
 *   POST /api/ingest/register          ← Submit a GitHub URL (clears old data, creates repo, starts ingestion + auto-scan)
 *   GET  /api/ingest/active            ← Returns the single active repo and its status
 *   GET  /api/ingest/status/:repoId    ← Poll ingestion/scan progress
 *   GET  /api/ingest/repositories      ← List all repos for current user (kept for backward compat)
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabase } from '../config/supabase';
import { launchIngestion } from '../utils/ingestionRunner';

const router = Router();
router.use(requireAuth);

// ─── POST /api/ingest/register ────────────────────────────────────────────────

/**
 * Primary entry point from the frontend.
 * 
 * SINGLE-REPO DESIGN:
 *   1. Deletes ALL existing scan_results, code_chunks, and repositories for this user.
 *   2. Creates a fresh repository record.
 *   3. Kicks off ingestion (which auto-triggers scanning when done).
 *
 * Body:   { repoUrl: "owner/repo" | "https://github.com/owner/repo" }
 * Returns: { repositoryId, message }
 */
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { repoUrl } = req.body as { repoUrl?: string };
    const profileId = req.user?.id;

    if (!repoUrl || !profileId) {
      res.status(400).json({ error: 'Missing required field: repoUrl.' });
      return;
    }

    // Normalise: strip https://github.com/ prefix if the user pasted a full URL
    const normalised = repoUrl
      .replace(/^https?:\/\/github\.com\//i, '')
      .replace(/\.git$/, '')
      .trim();

    const parts = normalised.split('/');
    if (parts.length < 2 || !parts[0] || !parts[1]) {
      res.status(400).json({
        error: 'Invalid repoUrl. Expected format: owner/repo or https://github.com/owner/repo',
      });
      return;
    }
    const repoName = `${parts[0]}/${parts[1]}`;

    // ── SINGLE-REPO: Clear ALL old data for this user ─────────────────────────
    console.log(`[ingest/register] 🧹 Clearing old data for profile ${profileId}...`);

    // Delete in order: scan_results → code_chunks → repositories (FK dependencies)
    const { data: existingRepos } = await supabase
      .from('repositories')
      .select('id')
      .eq('profile_id', profileId);

    if (existingRepos && existingRepos.length > 0) {
      const repoIds = existingRepos.map(r => r.id);
      for (const rid of repoIds) {
        await supabase.from('scan_results').delete().eq('repository_id', rid);
        await supabase.from('code_chunks').delete().eq('repository_id', rid);
      }
      await supabase.from('repositories').delete().eq('profile_id', profileId);
      console.log(`[ingest/register] 🧹 Cleared ${repoIds.length} old repo(s) and their data.`);
    }

    // ── Create new repository record ──────────────────────────────────────────
    const { data: newRepo, error: createError } = await supabase
      .from('repositories')
      .insert({
        profile_id:       profileId,
        repo_name:        repoName,
        github_repo_url:  `https://github.com/${repoName}`,
        default_branch:   'main',
        ingestion_status: 'processing',
      })
      .select('id')
      .single();

    if (createError || !newRepo) {
      console.error('[ingest/register] DB insert failed:', createError?.message);
      res.status(500).json({ error: 'Failed to create repository record.', detail: createError?.message });
      return;
    }

    // ── Fetch GitHub token ────────────────────────────────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('github_access_token')
      .eq('id', profileId)
      .single();

    if (!profile?.github_access_token) {
      await supabase.from('repositories').update({ ingestion_status: 'failed' }).eq('id', newRepo.id);
      res.status(403).json({ error: 'GitHub access token not found. Please log out and log back in.' });
      return;
    }

    // ── Respond immediately, then start ingestion in the background ───────────
    console.log(`[ingest/register] 🚀 Starting ingestion + auto-scan for "${repoName}"`);

    res.status(202).json({
      message: 'Repository registered. Ingestion and scanning started.',
      repositoryId: newRepo.id,
    });

    // launchIngestion now auto-triggers scan after ingestion completes
    launchIngestion(newRepo.id, profileId!, repoName, profile.github_access_token);

  } catch (error) {
    console.error('[ingest/register] Unexpected error:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ─── GET /api/ingest/active ──────────────────────────────────────────────────

/**
 * Returns the single active repository for this user (if any),
 * along with chunk count and scan result count for progress tracking.
 */
router.get('/active', async (req: Request, res: Response): Promise<void> => {
  try {
    const profileId = req.user?.id;
    if (!profileId) {
      res.status(401).json({ error: 'Unauthenticated.' });
      return;
    }

    const { data: repo, error } = await supabase
      .from('repositories')
      .select('*')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    if (!repo) {
      res.json({ repository: null });
      return;
    }

    // Get chunk count for progress display
    const { count: chunkCount } = await supabase
      .from('code_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('repository_id', repo.id);

    // Get scan results count
    const { count: findingsCount } = await supabase
      .from('scan_results')
      .select('id', { count: 'exact', head: true })
      .eq('repository_id', repo.id);

    // Determine pipeline stage for the frontend:
    // - 'ingesting': ingestion_status === 'processing'
    // - 'scanning':  ingestion is done but last_scanned_at not yet set
    // - 'completed': ingestion done and last_scanned_at is set
    // - 'failed':    ingestion_status === 'failed'
    let pipelineStage: 'ingesting' | 'scanning' | 'completed' | 'failed';
    if (repo.ingestion_status === 'processing') {
      pipelineStage = 'ingesting';
    } else if (repo.ingestion_status === 'failed') {
      pipelineStage = 'failed';
    } else if (repo.last_scanned_at) {
      pipelineStage = 'completed';
    } else {
      // ingestion completed, scan not yet finished
      pipelineStage = 'scanning';
    }

    res.json({
      repository: {
        ...repo,
        chunk_count: chunkCount ?? 0,
        findings_count: findingsCount ?? 0,
        pipeline_stage: pipelineStage,
      },
    });
  } catch {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ─── GET /api/ingest/status/:repositoryId ─────────────────────────────────────

router.get('/status/:repositoryId', async (req: Request, res: Response): Promise<void> => {
  try {
    const repositoryId = req.params['repositoryId'] as string;
    const { data, error } = await supabase
      .from('repositories')
      .select('ingestion_status, repo_name, last_scanned_at')
      .eq('id', repositoryId)
      .single();

    if (error || !data) {
      res.status(404).json({ error: 'Repository not found.' });
      return;
    }

    // Also get progress info
    const { count: chunkCount } = await supabase
      .from('code_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('repository_id', repositoryId);

    const { count: findingsCount } = await supabase
      .from('scan_results')
      .select('id', { count: 'exact', head: true })
      .eq('repository_id', repositoryId);

    res.json({
      status: data.ingestion_status,
      repoName: data.repo_name,
      lastScannedAt: data.last_scanned_at,
      chunkCount: chunkCount ?? 0,
      findingsCount: findingsCount ?? 0,
    });
  } catch {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ─── GET /api/ingest/repositories ─────────────────────────────────────────────

router.get('/repositories', async (req: Request, res: Response): Promise<void> => {
  try {
    const profileId = req.user?.id;
    if (!profileId) {
      res.status(401).json({ error: 'Unauthenticated.' });
      return;
    }

    const { data, error } = await supabase
      .from('repositories')
      .select('*')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: 'Database error.' });
      return;
    }

    res.json({ repositories: data ?? [] });
  } catch {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
