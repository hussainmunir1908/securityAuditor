/**
 * src/routes/scan.ts
 * ------------------
 * SAST Scanning API — Step 3 implementation.
 *
 * POST /api/scan/start        → Runs the full RAG + LLM scan on a repository
 * GET  /api/scan/results/:id  → Returns all findings for a given repository
 * GET  /api/scan/history      → Lists all repos the user has scanned
 * GET  /api/scan/metrics/:id  → Aggregate vulnerability counts by severity / OWASP
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabase } from '../config/supabase';
import { runScanForChunk } from '../utils/langgraph';
import { CodeChunk, ScanFinding } from '../types';

const router = Router();
router.use(requireAuth);

// ─── POST /api/scan/start ────────────────────────────────────────────────────

/**
 * Triggers a full SAST scan on a previously ingested repository.
 *
 * Flow:
 *   1. Validate the repository exists and belongs to this user.
 *   2. Confirm ingestion is complete (status === 'completed').
 *   3. Fetch all code_chunks for the repository.
 *   4. Run the LangGraph workflow (RAG → LLM) for each chunk.
 *   5. Bulk-insert all findings into scan_results.
 *   6. Update the repository's last_scanned_at timestamp.
 *   7. Return a summary.
 */
router.post('/start', async (req: Request, res: Response): Promise<void> => {
  try {
    const { repositoryId } = req.body;
    const profileId = req.user?.id;

    if (!repositoryId) {
      res.status(400).json({ error: 'Missing required field: repositoryId.' });
      return;
    }

    // ── 1. Validate repository ownership ─────────────────────────────────────
    const { data: repo, error: repoError } = await supabase
      .from('repositories')
      .select('id, repo_name, ingestion_status, profile_id')
      .eq('id', repositoryId)
      .eq('profile_id', profileId)          // Enforce ownership via RLS + explicit filter
      .single();

    if (repoError || !repo) {
      res.status(404).json({
        error: 'Repository not found or does not belong to this account.',
      });
      return;
    }

    if (repo.ingestion_status !== 'completed') {
      res.status(409).json({
        error: `Repository ingestion is not complete. Current status: "${repo.ingestion_status}". ` +
               `Please wait until ingestion finishes before scanning.`,
        status: repo.ingestion_status,
      });
      return;
    }

    // ── 2. Fetch all code chunks (including their pre-computed embeddings) ────
    const { data: chunks, error: chunksError } = await supabase
      .from('code_chunks')
      .select('*')
      .eq('repository_id', repositoryId);

    if (chunksError) {
      res.status(500).json({ error: `Failed to fetch code chunks: ${chunksError.message}` });
      return;
    }

    if (!chunks || chunks.length === 0) {
      res.status(422).json({
        error: 'No code chunks found for this repository. Re-ingest the repository first.',
      });
      return;
    }

    console.log(
      `[scan] Starting scan for repo "${repo.repo_name}" ` +
      `(${chunks.length} chunks, profile: ${profileId})`
    );

    // ── 3. Delete previous scan results for this repo (allow re-scanning) ────
    await supabase
      .from('scan_results')
      .delete()
      .eq('repository_id', repositoryId);

    // ── 4. Run LangGraph workflow for each chunk ──────────────────────────────
    const allFindings: Array<ScanFinding & { file_path: string; start_line: number; ai_prompt: string | null }> = [];

    for (const chunk of chunks as CodeChunk[]) {
      try {
        const result = await runScanForChunk(chunk);
        const findings = result.findings;

        // Tag each finding with the source chunk's file location and generated AI Prompt
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
            `[scan] ${chunk.file_path}:${chunk.start_line} → ` +
            `${findings.length} finding(s) with AI Prompt: ${result.aiPrompt ? 'Yes' : 'No'}`
          );
        }
      } catch (chunkErr) {
        // One chunk failing should never abort the entire scan
        console.error(
          `[scan] Failed to process chunk ${chunk.id} (${chunk.file_path}):`,
          chunkErr
        );
      }
    }

    // ── 5. Bulk insert findings into scan_results ─────────────────────────────
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
        // The newly generated Remediation Agent payload
        ai_coder_prompt: f.ai_prompt,
      }));

      const { error: insertError } = await supabase
        .from('scan_results')
        .insert(rows);

      if (insertError) {
        console.error('[scan] Failed to insert scan results:', insertError.message);
        res.status(500).json({ error: `Scan completed but failed to save results: ${insertError.message}` });
        return;
      }
    }

    // ── 6. Update last_scanned_at timestamp on the repository ─────────────────
    await supabase
      .from('repositories')
      .update({ last_scanned_at: new Date().toISOString() })
      .eq('id', repositoryId);

    // ── 7. Return summary ─────────────────────────────────────────────────────
    const bySeverity = allFindings.reduce<Record<string, number>>((acc, f) => {
      acc[f.severity] = (acc[f.severity] ?? 0) + 1;
      return acc;
    }, {});

    console.log(
      `[scan] Scan complete for "${repo.repo_name}". ` +
      `Total findings: ${allFindings.length}.`
    );

    res.status(200).json({
      message:          'Scan completed successfully.',
      repositoryId,
      repositoryName:   repo.repo_name,
      chunksProcessed:  chunks.length,
      totalFindings:    allFindings.length,
      findingsBySeverity: bySeverity,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[scan] Unexpected error in POST /scan/start:', message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
});

// ─── GET /api/scan/results/:repositoryId ─────────────────────────────────────

/**
 * Returns all vulnerability findings for a repository, ordered by severity.
 */
router.get('/results/:repositoryId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { repositoryId } = req.params;
    const profileId = req.user?.id;

    // Verify ownership first
    const { data: repo, error: repoError } = await supabase
      .from('repositories')
      .select('id, repo_name')
      .eq('id', repositoryId)
      .eq('profile_id', profileId)
      .single();

    if (repoError || !repo) {
      res.status(404).json({ error: 'Repository not found.' });
      return;
    }

    const { data: results, error } = await supabase
      .from('scan_results')
      .select('*')
      .eq('repository_id', repositoryId)
      .order('severity', { ascending: true })  // critical < high < low in text order — fine for grouping
      .order('file_path',  { ascending: true });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({
      repositoryId,
      repositoryName: repo.repo_name,
      totalFindings:  results?.length ?? 0,
      findings:       results ?? [],
    });

  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ─── GET /api/scan/history ────────────────────────────────────────────────────

/**
 * Lists all repositories the user has scanned (those with last_scanned_at set).
 */
router.get('/history', async (req: Request, res: Response): Promise<void> => {
  try {
    const profileId = req.user?.id;

    const { data, error } = await supabase
      .from('repositories')
      .select('id, repo_name, github_repo_url, ingestion_status, last_scanned_at, created_at')
      .eq('profile_id', profileId)
      .not('last_scanned_at', 'is', null)
      .order('last_scanned_at', { ascending: false });

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.json({ scans: data ?? [] });

  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ─── GET /api/scan/metrics/:repositoryId ─────────────────────────────────────

/**
 * Returns aggregate vulnerability counts grouped by severity and OWASP category.
 * Useful for dashboard charts.
 */
router.get('/metrics/:repositoryId', async (req: Request, res: Response): Promise<void> => {
  try {
    const { repositoryId } = req.params;
    const profileId = req.user?.id;

    // Ownership check
    const { data: repo, error: repoError } = await supabase
      .from('repositories')
      .select('id, repo_name')
      .eq('id', repositoryId)
      .eq('profile_id', profileId)
      .single();

    if (repoError || !repo) {
      res.status(404).json({ error: 'Repository not found.' });
      return;
    }

    const { data: results, error } = await supabase
      .from('scan_results')
      .select('severity, rule_id, owasp_category, file_path')
      .eq('repository_id', repositoryId);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const rows = results ?? [];

    // Aggregate by severity
    const bySeverity: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const row of rows) {
      bySeverity[row.severity] = (bySeverity[row.severity] ?? 0) + 1;
    }

    // Aggregate by OWASP category
    const byOwasp: Record<string, number> = {};
    for (const row of rows) {
      const cat = row.owasp_category ?? 'Uncategorized';
      byOwasp[cat] = (byOwasp[cat] ?? 0) + 1;
    }

    // Aggregate by affected file
    const byFile: Record<string, number> = {};
    for (const row of rows) {
      byFile[row.file_path] = (byFile[row.file_path] ?? 0) + 1;
    }

    res.json({
      repositoryId,
      repositoryName:     repo.repo_name,
      totalFindings:      rows.length,
      findingsBySeverity: bySeverity,
      findingsByOwasp:    byOwasp,
      findingsByFile:     byFile,
    });

  } catch (err) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
