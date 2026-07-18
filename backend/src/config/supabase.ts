/**
 * src/config/supabase.ts
 * ----------------------
 * Initialises a single Supabase client for the backend.
 *
 * We use the PUBLISHABLE (anon) key here because we rely on Row Level Security
 * (RLS) policies for data isolation. If you later need to bypass RLS (e.g. for
 * admin operations), create a second client using a SERVICE_ROLE_KEY stored
 * securely and never exposed to the frontend.
 *
 * Integration point: all routes import `supabase` from here to query the DB.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * Singleton Supabase client instance.
 * Used by route handlers to read/write the Postgres database.
 */
export const supabase: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      // We manage our own JWT sessions — we do not use Supabase Auth.
      // Disabling auto token refresh keeps things clean.
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

/**
 * Admin Supabase client instance.
 * Bypasses RLS. Used for internal operations like RAG querying that need to
 * bypass user-specific RLS policies.
 */
export const supabaseAdmin: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
