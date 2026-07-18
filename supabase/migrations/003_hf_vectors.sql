-- ============================================================
-- 003_hf_vectors.sql
-- Run this in your Supabase Dashboard → SQL Editor.
--
-- What this script does:
--   1. Resizes code_chunks.embedding: vector(1536) → vector(384)
--      to match sentence-transformers/all-MiniLM-L6-v2 output.
--   2. Drops and re-creates the security_rules table (originally
--      created in 002 with vector(1536)) with vector(384).
--   3. Rebuilds all HNSW indexes for the new dimension.
--
-- NOTE: This deletes any previously seeded security_rules rows and
-- all stored code_chunk embeddings. Re-run `npm run seed:rules`
-- after applying this migration.
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. Resize code_chunks.embedding from 1536 → 384
-- pgvector does not support ALTER COLUMN TYPE for vector columns,
-- so we drop the old column and add a fresh one.
-- ─────────────────────────────────────────────────────────────

-- Drop the old HNSW index before altering the column (required)
DROP INDEX IF EXISTS idx_code_chunks_embedding;

-- Swap the column dimension
ALTER TABLE public.code_chunks DROP COLUMN IF EXISTS embedding;
ALTER TABLE public.code_chunks ADD COLUMN embedding vector(384);

-- Rebuild HNSW index for 384-dim cosine similarity search
CREATE INDEX idx_code_chunks_embedding
  ON public.code_chunks
  USING hnsw (embedding vector_cosine_ops);


-- ─────────────────────────────────────────────────────────────
-- 2. Drop and re-create security_rules with vector(384)
-- (The table was created in 002_security_rules.sql with vector(1536).
--  We drop it entirely for a clean slate, then recreate it correctly.)
-- ─────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS idx_security_rules_embedding;
DROP TABLE IF EXISTS public.security_rules;

CREATE TABLE public.security_rules (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_id        TEXT        NOT NULL UNIQUE,   -- e.g. 'OWASP-A01-2021'
  title          TEXT        NOT NULL,
  content        TEXT        NOT NULL,
  severity       TEXT        NOT NULL,          -- 'critical' | 'high' | 'medium' | 'low'
  owasp_category TEXT,
  cwe_id         TEXT,
  embedding      vector(384),                   -- sentence-transformers/all-MiniLM-L6-v2
  created_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Row Level Security: only authenticated users can read security rules
ALTER TABLE public.security_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read security rules"
  ON public.security_rules
  FOR SELECT
  TO authenticated
  USING (true);

-- Rebuild HNSW index for 384-dim cosine similarity search
CREATE INDEX idx_security_rules_embedding
  ON public.security_rules
  USING hnsw (embedding vector_cosine_ops);
