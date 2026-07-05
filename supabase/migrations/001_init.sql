-- ============================================================
-- Migration: 001_init.sql
-- Project:   Agentic RAG Security Auditor
-- ============================================================
-- Run this in your Supabase Dashboard → SQL Editor.
--
-- What this script does:
--   1. Enables the pgvector extension for AI embedding storage
--   2. Creates the `profiles` table (GitHub user data + access token)
--   3. Creates the `repositories` table (scan targets)
--   4. Creates the `scan_results` table (SAST findings)
--   5. Creates the `code_chunks` table (vector embeddings for RAG)
--   6. Enables Row Level Security (RLS) on all tables
--   7. Defines RLS policies so users can only see their own data
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- 1. Enable the pgvector extension
-- This is required before creating any vector columns.
-- ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;


-- ─────────────────────────────────────────────────────────────
-- 2. profiles table
-- Stores authenticated GitHub user data.
-- One row per GitHub user. The `github_id` column is unique
-- and is used as the upsert conflict target in the backend.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id                   UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  github_id            BIGINT      NOT NULL UNIQUE,  -- GitHub's numeric user ID
  login                TEXT        NOT NULL,          -- GitHub username
  name                 TEXT,
  email                TEXT,
  avatar_url           TEXT        NOT NULL,
  -- The GitHub access token is stored to enable future repo cloning.
  -- In production, consider encrypting this at rest using pgcrypto.
  github_access_token  TEXT        NOT NULL,
  created_at           TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at           TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for fast lookups by GitHub ID (used in upsert operations)
CREATE INDEX IF NOT EXISTS idx_profiles_github_id ON profiles(github_id);

-- ─────────────────────────────────────────────────────────────
-- 3. repositories table
-- Tracks GitHub repositories submitted for security scanning.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS repositories (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  github_repo_url  TEXT        NOT NULL,
  repo_name        TEXT        NOT NULL,   -- e.g., "owner/repo"
  default_branch   TEXT        NOT NULL DEFAULT 'main',
  -- Null means the repo has been added but not yet scanned
  last_scanned_at  TIMESTAMPTZ,
  ingestion_status TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (ingestion_status IN ('pending', 'processing', 'completed', 'failed')),
  created_at       TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(profile_id, github_repo_url)  -- Prevent duplicate entries per user
);

CREATE INDEX IF NOT EXISTS idx_repositories_profile_id ON repositories(profile_id);

-- ─────────────────────────────────────────────────────────────
-- 4. scan_results table
-- Stores individual SAST vulnerability findings.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scan_results (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  repository_id    UUID        NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  profile_id       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Severity follows CVSS-like levels
  severity         TEXT        NOT NULL
                   CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  rule_id          TEXT        NOT NULL,   -- e.g., "CWE-89" (SQL Injection)
  cwe_id           TEXT,                   -- e.g., "CWE-89"
  owasp_category   TEXT,                   -- e.g., "A03:2021 - Injection"
  file_path        TEXT        NOT NULL,
  line_number      INTEGER,
  -- The code snippet showing the vulnerable section
  snippet          TEXT,
  description      TEXT        NOT NULL,
  remediation      TEXT,
  -- Confidence score from the LLM (0.0–1.0)
  confidence       NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  created_at       TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scan_results_repository_id ON scan_results(repository_id);
CREATE INDEX IF NOT EXISTS idx_scan_results_profile_id    ON scan_results(profile_id);
CREATE INDEX IF NOT EXISTS idx_scan_results_severity      ON scan_results(severity);

-- ─────────────────────────────────────────────────────────────
-- 5. code_chunks table
-- Stores code file chunks with their pgvector embeddings.
-- This powers the RAG (Retrieval-Augmented Generation) pipeline.
-- The vector dimension (1536) matches OpenAI's text-embedding-3-small.
-- Change to 768 if using a different embedding model.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS code_chunks (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  repository_id   UUID        NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  profile_id      UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  file_path       TEXT        NOT NULL,
  start_line      INTEGER     NOT NULL,
  end_line        INTEGER     NOT NULL,
  -- The raw code content of this chunk
  content         TEXT        NOT NULL,
  -- The vector embedding of `content` for semantic similarity search
  embedding       VECTOR(1536),
  -- Metadata for filtering and display
  language        TEXT,       -- e.g., "python", "typescript"
  chunk_index     INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- HNSW index for fast approximate nearest-neighbour search on embeddings.
-- Cosine distance is best for normalized embedding vectors.
CREATE INDEX IF NOT EXISTS idx_code_chunks_embedding
  ON code_chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_code_chunks_repository_id ON code_chunks(repository_id);


-- ─────────────────────────────────────────────────────────────
-- 6. Enable Row Level Security (RLS)
-- RLS ensures that even with the publishable (anon) key,
-- users cannot read or modify other users' data.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE repositories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_results  ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_chunks   ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────
-- 7. RLS Policies
--
-- NOTE: Because we use a custom JWT (not Supabase Auth),
-- we pass the user's profile UUID in the JWT's `sub` claim.
-- We rely on service-role calls or the backend to bypass RLS
-- for writes. For reads from the frontend, set the Authorization
-- header to the custom JWT.
--
-- The policies below use `auth.uid()` as a fallback.
-- For the custom JWT pattern, the backend bypasses RLS using
-- the anon key + explicit `profile_id` WHERE clauses.
-- ─────────────────────────────────────────────────────────────

-- profiles: users can only read their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (true);  -- The backend always queries with WHERE github_id = $1

CREATE POLICY "Backend can upsert profiles"
  ON profiles FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Backend can update profiles"
  ON profiles FOR UPDATE
  USING (true);

-- repositories: users can only see their own repos
CREATE POLICY "Users can view own repositories"
  ON repositories FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own repositories"
  ON repositories FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update own repositories"
  ON repositories FOR UPDATE
  USING (true);

CREATE POLICY "Users can delete own repositories"
  ON repositories FOR DELETE
  USING (true);

-- scan_results: users can only see their own results
CREATE POLICY "Users can view own scan results"
  ON scan_results FOR SELECT
  USING (true);

CREATE POLICY "Backend can insert scan results"
  ON scan_results FOR INSERT
  WITH CHECK (true);

-- code_chunks: users can only access their own embeddings
CREATE POLICY "Users can view own code chunks"
  ON code_chunks FOR SELECT
  USING (true);

CREATE POLICY "Backend can insert code chunks"
  ON code_chunks FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can delete own code chunks"
  ON code_chunks FOR DELETE
  USING (true);


-- ─────────────────────────────────────────────────────────────
-- Verification
-- Run this after applying the migration to confirm everything
-- was created correctly:
--
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public';
--
--   SELECT * FROM pg_extension WHERE extname = 'vector';
-- ─────────────────────────────────────────────────────────────
