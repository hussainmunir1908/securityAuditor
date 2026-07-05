/**
 * src/routes/auth.ts
 * ------------------
 * GitHub OAuth 2.0 authentication routes.
 *
 * Flow:
 *   1. Browser hits GET /api/auth/github
 *      → Redirects to GitHub's OAuth authorization page
 *
 *   2. User grants access on GitHub
 *      → GitHub redirects to GET /api/auth/github/callback?code=XXX&state=YYY
 *
 *   3. Backend exchanges the `code` for an access token via GitHub's token API
 *      → Fetches the authenticated user's profile from GitHub's /user API
 *      → Upserts the profile row in our Supabase `profiles` table
 *      → Issues a signed JWT and sets it as an HttpOnly cookie
 *      → Redirects the browser to the frontend dashboard
 *
 *   4. GET /api/auth/me
 *      → Protected endpoint; returns the decoded user from the JWT cookie
 *
 *   5. POST /api/auth/logout
 *      → Clears the JWT cookie
 */

import { Router, Request, Response } from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env';
import { supabase } from '../config/supabase';
import { requireAuth } from '../middleware/auth';
import type { GitHubUser, JWTPayload } from '../types';

const router = Router();

// ─── In-memory CSRF state store ───────────────────────────────────────────────
// For production, replace this with a Redis store or a signed cookie.
const oauthStateStore = new Map<string, { createdAt: number }>();

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ─── Helper: generate and sign a JWT ─────────────────────────────────────────

function signJWT(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: '7d',
    algorithm: 'HS256',
  });
}

// ─── Helper: set the JWT as an HttpOnly cookie ────────────────────────────────

function setAuthCookie(res: Response, token: string): void {
  res.cookie('access_token', token, {
    httpOnly: true,       // Prevents XSS access via document.cookie
    secure: env.NODE_ENV === 'production', // HTTPS only in production
    sameSite: 'lax',      // Allows the cookie to be sent on top-level navigations
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    path: '/',
  });
}

// ─── Step 1: Redirect to GitHub ───────────────────────────────────────────────

/**
 * GET /api/auth/github
 *
 * Generates a cryptographic random `state` token to prevent CSRF attacks,
 * stores it temporarily, and redirects the user to GitHub's OAuth page.
 */
router.get('/github', (_req: Request, res: Response): void => {
  const state = crypto.randomBytes(16).toString('hex');

  // Store state with a timestamp for expiry checking
  oauthStateStore.set(state, { createdAt: Date.now() });

  const params = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: env.GITHUB_CALLBACK_URL,
    scope: 'read:user user:email repo', // repo scope allows reading repo metadata
    state,
    allow_signup: 'true',
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

// ─── Step 2: Handle GitHub Callback ──────────────────────────────────────────

/**
 * GET /api/auth/github/callback
 *
 * GitHub redirects here after the user approves (or denies) the OAuth request.
 * Handles:
 *   - CSRF state validation
 *   - Temporary code → access token exchange
 *   - GitHub user profile fetch
 *   - Supabase upsert (create or update profile)
 *   - JWT issuance + cookie set
 *   - Redirect to frontend
 */
router.get('/github/callback', async (req: Request, res: Response): Promise<void> => {
  const { code, state, error: githubError } = req.query as Record<string, string>;

  // Handle user denial or GitHub errors
  if (githubError) {
    console.error('[auth] GitHub OAuth error:', githubError);
    res.redirect(`${env.FRONTEND_URL}/?error=oauth_denied`);
    return;
  }

  if (!code || !state) {
    res.status(400).json({ error: 'Missing code or state parameter from GitHub.' });
    return;
  }

  // ── CSRF State Validation ─────────────────────────────────────────────────
  const storedState = oauthStateStore.get(state);
  if (!storedState) {
    res.status(400).json({ error: 'Invalid OAuth state. Possible CSRF attack.' });
    return;
  }

  // Clean up the used state immediately (one-time use)
  oauthStateStore.delete(state);

  // Check state TTL
  if (Date.now() - storedState.createdAt > OAUTH_STATE_TTL_MS) {
    res.status(400).json({ error: 'OAuth state has expired. Please try again.' });
    return;
  }

  try {
    // ── Exchange code for access token ──────────────────────────────────────
    const tokenResponse = await axios.post<{
      access_token: string;
      token_type: string;
      scope: string;
    }>(
      'https://github.com/login/oauth/access_token',
      {
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: env.GITHUB_CALLBACK_URL,
      },
      {
        headers: { Accept: 'application/json' },
      }
    );

    const { access_token: githubAccessToken } = tokenResponse.data;

    if (!githubAccessToken) {
      console.error('[auth] GitHub did not return an access token:', tokenResponse.data);
      res.redirect(`${env.FRONTEND_URL}/?error=token_exchange_failed`);
      return;
    }

    // ── Fetch GitHub user profile ───────────────────────────────────────────
    const userResponse = await axios.get<GitHubUser>(
      'https://api.github.com/user',
      {
        headers: {
          Authorization: `Bearer ${githubAccessToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    const githubUser = userResponse.data;

    // If email is private, fetch it from the emails endpoint
    let primaryEmail: string | null = githubUser.email;
    if (!primaryEmail) {
      const emailsResponse = await axios.get<Array<{ email: string; primary: boolean; verified: boolean }>>(
        'https://api.github.com/user/emails',
        {
          headers: {
            Authorization: `Bearer ${githubAccessToken}`,
            Accept: 'application/vnd.github+json',
          },
        }
      );
      const primaryEmailObj = emailsResponse.data.find((e) => e.primary && e.verified);
      primaryEmail = primaryEmailObj?.email ?? null;
    }

    // ── Upsert the user profile into Supabase ───────────────────────────────
    // `upsert` with onConflict: 'github_id' means:
    //   - If no row exists with this github_id → INSERT
    //   - If a row already exists → UPDATE the fields (refreshes the access token)
    const { data: profileData, error: supabaseError } = await supabase
      .from('profiles')
      .upsert(
        {
          github_id: githubUser.id,
          login: githubUser.login,
          name: githubUser.name,
          email: primaryEmail,
          avatar_url: githubUser.avatar_url,
          github_access_token: githubAccessToken,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'github_id', // The unique constraint column
        }
      )
      .select('id, github_id, login, avatar_url')
      .single();

    if (supabaseError || !profileData) {
      console.error('[auth] Supabase upsert error:', supabaseError);
      res.redirect(`${env.FRONTEND_URL}/?error=database_error`);
      return;
    }

    // ── Issue JWT ───────────────────────────────────────────────────────────
    const jwtPayload: Omit<JWTPayload, 'iat' | 'exp'> = {
      sub: profileData.id as string,
      githubId: profileData.github_id as number,
      login: profileData.login as string,
      avatarUrl: profileData.avatar_url as string,
    };

    const token = signJWT(jwtPayload);

    // ── Set cookie and redirect to frontend dashboard ───────────────────────
    setAuthCookie(res, token);

    console.log(`[auth] User "${githubUser.login}" authenticated successfully.`);
    res.redirect(`${env.FRONTEND_URL}/dashboard`);
  } catch (err) {
    console.error('[auth] Unexpected error during OAuth callback:', err);
    res.redirect(`${env.FRONTEND_URL}/?error=server_error`);
  }
});

// ─── Step 3: /me — Return current user from JWT ───────────────────────────────

/**
 * GET /api/auth/me
 *
 * Protected endpoint. Returns the currently authenticated user's profile.
 * The frontend's AuthContext polls this on mount to determine login state.
 */
router.get('/me', requireAuth, (req: Request, res: Response): void => {
  // req.user is populated by requireAuth middleware
  res.json({
    user: req.user,
  });
});

// ─── Step 4: Logout ───────────────────────────────────────────────────────────

/**
 * POST /api/auth/logout
 *
 * Clears the HttpOnly JWT cookie, effectively logging the user out.
 * Since JWTs are stateless, we cannot truly invalidate the token server-side
 * without a blocklist — clearing the cookie is sufficient for most use cases.
 */
router.post('/logout', (_req: Request, res: Response): void => {
  res.clearCookie('access_token', { path: '/' });
  res.json({ message: 'Logged out successfully.' });
});

export default router;
