-- ============================================================
-- 002_security_rules.sql
-- Run this in your Supabase Dashboard → SQL Editor.
--
-- What this script does:
--   1. Creates the `security_rules` table for the knowledge base.
--   2. Enables Row Level Security (RLS).
--   3. Adds an HNSW index on the embedding column for fast similarity search.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.security_rules (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_id        TEXT        NOT NULL UNIQUE, -- e.g., 'OWASP-A01-2021'
  title          TEXT        NOT NULL,
  content        TEXT        NOT NULL,
  severity       TEXT        NOT NULL, -- 'critical', 'high', 'medium', 'low'
  owasp_category TEXT,
  cwe_id         TEXT,
  embedding      vector(1536), -- Assuming text-embedding-3-small
  created_at     TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE public.security_rules ENABLE ROW LEVEL SECURITY;

-- Create policy for reading security rules (public read access for authenticated users)
CREATE POLICY "Authenticated users can read security rules"
  ON public.security_rules
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow backend (or setup scripts) to insert rules
CREATE POLICY "Backend can insert security rules"
  ON public.security_rules
  FOR INSERT
  WITH CHECK (true);

-- Index for fast vector similarity search using HNSW
-- Note: Requires pgvector extension (which was enabled in 001_init.sql)
CREATE INDEX IF NOT EXISTS idx_security_rules_embedding 
ON public.security_rules 
USING hnsw (embedding vector_cosine_ops);
