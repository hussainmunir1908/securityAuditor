/**
 * frontend/proxy.ts
 * ------------------
 * Next.js route proxy — runs on every request before rendering.
 * Renamed from middleware.ts per Next.js 16 convention.
 *
 * Responsibilities:
 *   1. Refreshes Supabase sessions via the SSR middleware client
 *   2. Protects the /dashboard route — redirects unauthenticated users to /
 *
 * Integration point: The auth state here is based on the `access_token` cookie
 * set by the backend. We check for this cookie to determine if the user is
 * authenticated without hitting the backend API on every request.
 */

import { NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/utils/supabase/middleware';

// Routes that require authentication
const PROTECTED_ROUTES = ['/dashboard'];

export async function proxy(request: NextRequest): Promise<NextResponse> {
  // Refresh Supabase session cookies
  const { supabaseResponse } = updateSession(request);

  const { pathname } = request.nextUrl;

  // Check if the user has a backend JWT cookie (set by Express on login)
  const hasAuthCookie = request.cookies.has('access_token');

  // Redirect unauthenticated users away from protected routes
  if (PROTECTED_ROUTES.some((route) => pathname.startsWith(route))) {
    if (!hasAuthCookie) {
      const redirectUrl = new URL('/', request.url);
      redirectUrl.searchParams.set('message', 'Please log in to access the dashboard.');
      return NextResponse.redirect(redirectUrl);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Apply middleware to all routes except static files and Next.js internals
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
