/**
 * frontend/utils/supabase/client.ts
 * -----------------------------------
 * Browser-side Supabase client for use in Client Components.
 * Pattern from SupabasePrompt.txt.
 */

import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];

export const createClient = () =>
  createBrowserClient(supabaseUrl!, supabaseKey!);
