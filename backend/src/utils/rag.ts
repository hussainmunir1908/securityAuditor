/**
 * src/utils/rag.ts
 * ----------------
 * RAG (Retrieval-Augmented Generation) retrieval utility.
 *
 * Given a 384-dimensional embedding vector from a code chunk, performs a
 * pgvector cosine similarity search against the `security_rules` table and
 * returns the top-K most semantically relevant rules to use as LLM context.
 *
 * The pgvector operator `<=>` computes cosine distance (lower = more similar).
 * We ORDER BY this distance ascending to get the closest rules first.
 */

import { supabaseAdmin } from '../config/supabase';
import { SecurityRule } from '../types';

// Number of security rules to retrieve per chunk.
// 5 rules gives the LLM enough context without overflowing its context window.
const TOP_K = 5;

/**
 * Retrieves the top-K most relevant security rules for a given embedding.
 *
 * Uses Supabase's `rpc()` to call a Postgres function that performs the
 * pgvector similarity search. The raw `<=>` operator isn't available through
 * the Supabase JS client's query builder, so we use a stored function.
 *
 * NOTE: If the `match_security_rules` RPC function hasn't been created yet,
 * see the SQL comment at the bottom of this file.
 *
 * @param embedding  A 384-dimensional float array (from a code_chunk row).
 * @returns          Array of up to TOP_K SecurityRule objects.
 */
export async function retrieveRelevantRules(
  embedding: number[]
): Promise<SecurityRule[]> {
  if (embedding.length !== 384) {
    throw new Error(
      `[rag] Expected a 384-dimensional embedding, got ${embedding.length}.`
    );
  }

  // Call the Postgres RPC function that wraps the pgvector <=> operator.
  // Supabase's JS client cannot use the <=> operator in .select() chains,
  // so we expose it via a simple SQL function (see migration SQL below).
  const { data, error } = await supabaseAdmin.rpc('match_security_rules', {
    query_embedding: embedding,
    match_count: TOP_K,
  });

  if (error) {
    throw new Error(`[rag] pgvector similarity search failed: ${error.message}`);
  }

  // Map the RPC result rows to our SecurityRule interface
  const rules: SecurityRule[] = (data ?? []).map((row: SecurityRule) => ({
    id:             row.id,
    rule_id:        row.rule_id,
    title:          row.title,
    content:        row.content,
    severity:       row.severity,
    owasp_category: row.owasp_category,
    cwe_id:         row.cwe_id,
  }));

  return rules;
}

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * REQUIRED SQL: Run this once in Supabase SQL Editor (as migration 004).
 * This creates the Postgres function used by supabase.rpc() above.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * CREATE OR REPLACE FUNCTION match_security_rules(
 *   query_embedding vector(384),
 *   match_count     int DEFAULT 5
 * )
 * RETURNS TABLE (
 *   id             uuid,
 *   rule_id        text,
 *   title          text,
 *   content        text,
 *   severity       text,
 *   owasp_category text,
 *   cwe_id         text
 * )
 * LANGUAGE sql STABLE
 * AS $$
 *   SELECT
 *     id, rule_id, title, content, severity, owasp_category, cwe_id
 *   FROM public.security_rules
 *   ORDER BY embedding <=> query_embedding
 *   LIMIT match_count;
 * $$;
 */
