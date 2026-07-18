-- ============================================================
-- 004_match_function.sql
-- Run this in your Supabase Dashboard → SQL Editor → New query.
--
-- What this does:
--   Creates the `match_security_rules` Postgres function that the
--   RAG retrieval utility (rag.ts) calls via supabase.rpc().
--
--   The Supabase JS client cannot use pgvector's `<=>` cosine distance
--   operator directly in a query chain, so we expose it as a SQL function.
-- ============================================================

CREATE OR REPLACE FUNCTION match_security_rules(
  query_embedding  vector(384),
  match_count      int DEFAULT 5
)
RETURNS TABLE (
  id             uuid,
  rule_id        text,
  title          text,
  content        text,
  severity       text,
  owasp_category text,
  cwe_id         text
)
LANGUAGE sql STABLE
AS $$
  SELECT
    id,
    rule_id,
    title,
    content,
    severity,
    owasp_category,
    cwe_id
  FROM public.security_rules
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
