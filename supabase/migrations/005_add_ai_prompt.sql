-- ============================================================
-- 005_add_ai_prompt.sql
-- ============================================================

ALTER TABLE public.scan_results ADD COLUMN IF NOT EXISTS ai_coder_prompt TEXT;
