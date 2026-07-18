/**
 * src/config/env.ts
 * -----------------
 * Typed environment variable loader. Validates that all required vars are present
 * at startup and fails fast with a clear error message if any are missing.
 *
 * Usage: import { env } from './config/env';
 */

import dotenv from 'dotenv';
import path from 'path';

// Load .env from the monorepo root (two levels up from backend/src/config/)
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

interface Env {
  // Server
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';

  // Supabase — anon/publishable key is safe on backend for DB access
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;

  // GitHub OAuth Application credentials
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;

  // The URL GitHub will redirect to after user authorizes (must match GitHub App settings)
  GITHUB_CALLBACK_URL: string;

  // Secret key for signing JWTs — must be long and random
  JWT_SECRET: string;

  // The frontend URL — used for post-auth redirects
  FRONTEND_URL: string;

  // Hugging Face API Key — used for embeddings (all-MiniLM-L6-v2) and
  // will be used in Step 3 for Qwen2.5-Coder-7B-Instruct SAST analysis.
  // Optional: falls back to mock zero-vectors when absent.
  HUGGING_FACE_API_KEY?: string;
}

/**
 * Reads an environment variable, throwing if it is missing or empty.
 */
function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `[env] Missing required environment variable: "${key}". ` +
      `Please check your .env file in the project root.`
    );
  }
  return value;
}

/**
 * The fully-typed, validated environment configuration object.
 * Import this instead of accessing process.env directly in the rest of the app.
 */
export const env: Env = {
  PORT: parseInt(process.env['PORT'] ?? '5000', 10),
  NODE_ENV: (process.env['NODE_ENV'] as Env['NODE_ENV']) ?? 'development',

  SUPABASE_URL: requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
  SUPABASE_PUBLISHABLE_KEY: requireEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
  SUPABASE_SERVICE_ROLE_KEY: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),

  GITHUB_CLIENT_ID: requireEnv('GITHUB_CLIENT_ID'),
  GITHUB_CLIENT_SECRET: requireEnv('GITHUB_CLIENT_SECRET'),

  // Default callback URL for local development; override via .env in production
  GITHUB_CALLBACK_URL:
    process.env['GITHUB_CALLBACK_URL'] ??
    'http://localhost:5000/api/auth/github/callback',

  JWT_SECRET: requireEnv('JWT_SECRET'),

  FRONTEND_URL: process.env['FRONTEND_URL'] ?? 'http://localhost:3000',

  HUGGING_FACE_API_KEY: process.env['HUGGING_FACE_API_KEY'],
};
