/**
 * frontend/utils/supabase/server.ts
 * ----------------------------------
 * Server-side Supabase client for use in Server Components, Route Handlers,
 * and Server Actions. Uses @supabase/ssr for cookie-aware session management.
 *
 * Pattern from SupabasePrompt.txt — uses NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 * (not a service role key) for secure, RLS-enforced queries.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];

export const createClient = async () => {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl!, supabaseKey!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // setAll called from a Server Component — safe to ignore.
          // The middleware handles session refresh.
        }
      },
    },
  });
};
