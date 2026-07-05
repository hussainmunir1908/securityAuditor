/**
 * src/routes/ingest.ts
 * --------------------
 * Step 2 placeholder — Repository Ingestion API.
 *
 * This router will handle:
 *   - POST /api/ingest/repository  → Clone a GitHub repo, chunk files, embed with pgvector
 *   - GET  /api/ingest/status/:id  → Check ingestion job status
 *   - GET  /api/ingest/repositories → List all ingested repos for the authenticated user
 *
 * Integration points (to be implemented in Step 2):
 *   - GitHub API client for repo cloning
 *   - File chunking and preprocessing pipeline
 *   - OpenAI / local embedding model for vector generation
 *   - Supabase `pgvector` for storing embeddings in the `code_chunks` table
 *   - Background job queue (e.g. BullMQ) for async processing
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';

const router = Router();

// All ingest routes require authentication
router.use(requireAuth);

/**
 * POST /api/ingest/repository
 * Accepts a GitHub repository URL and kicks off the ingestion pipeline.
 */
router.post('/repository', (_req: Request, res: Response): void => {
  res.status(501).json({
    message: 'Repository ingestion not yet implemented.',
    step: 'Step 2: RAG Ingestion Pipeline',
  });
});

/**
 * GET /api/ingest/status/:jobId
 * Returns the current status of an ingestion job.
 */
router.get('/status/:jobId', (_req: Request, res: Response): void => {
  res.status(501).json({
    message: 'Ingestion status polling not yet implemented.',
    step: 'Step 2: RAG Ingestion Pipeline',
  });
});

/**
 * GET /api/ingest/repositories
 * Lists all repositories that have been ingested by the current user.
 */
router.get('/repositories', (_req: Request, res: Response): void => {
  res.status(501).json({
    message: 'Repository listing not yet implemented.',
    step: 'Step 2: RAG Ingestion Pipeline',
  });
});

export default router;
