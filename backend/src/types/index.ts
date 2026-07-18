/**
 * src/types/index.ts
 * ------------------
 * Shared TypeScript interfaces and types used across the backend.
 * These are the canonical data shapes for users, JWT payloads, and DB records.
 */

// ─── GitHub OAuth ─────────────────────────────────────────────────────────────

/** Raw user object returned by the GitHub /user API endpoint */
export interface GitHubUser {
  id: number;
  login: string;       // GitHub username (e.g., "octocat")
  name: string | null; // Display name (may be null if not set)
  email: string | null;
  avatar_url: string;
  html_url: string;    // Link to GitHub profile
  bio: string | null;
  company: string | null;
  location: string | null;
}

// ─── JWT ──────────────────────────────────────────────────────────────────────

/**
 * The payload encoded inside our signed JWT.
 * Kept minimal to avoid bloating the cookie size.
 */
export interface JWTPayload {
  sub: string;          // Our internal Supabase profile UUID
  githubId: number;     // GitHub numeric user ID
  login: string;        // GitHub username
  avatarUrl: string;
  iat?: number;         // Issued at (added by jsonwebtoken automatically)
  exp?: number;         // Expires at (added by jsonwebtoken automatically)
}

// ─── Authenticated User ───────────────────────────────────────────────────────

/**
 * The decoded, verified user object attached to req.user by the auth middleware.
 * Downstream route handlers can rely on this being fully populated.
 */
export interface AuthenticatedUser {
  id: string;           // Supabase profile UUID
  githubId: number;
  login: string;
  avatarUrl: string;
}

// ─── Supabase DB Records ──────────────────────────────────────────────────────

/** Shape of a row in the `profiles` table */
export interface Profile {
  id: string;                   // UUID, PK
  github_id: number;            // GitHub numeric ID (unique)
  login: string;                // GitHub username
  name: string | null;
  email: string | null;
  avatar_url: string;
  github_access_token: string;  // Stored securely; used for cloning private repos
  created_at: string;
  updated_at: string;
}

/** Shape of a row in the `repositories` table */
export interface Repository {
  id: string;
  profile_id: string;           // FK → profiles.id
  github_repo_url: string;
  repo_name: string;
  default_branch: string;
  last_scanned_at: string | null;
  created_at: string;
}

/** Shape of a row in the `scan_results` table */
export interface ScanResult {
  id: string;
  repository_id: string;        // FK → repositories.id
  profile_id: string;           // FK → profiles.id (for RLS convenience)
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  rule_id: string;              // e.g., "sql-injection", "xss"
  file_path: string;
  line_number: number | null;
  snippet: string | null;       // Code snippet context
  description: string;
  remediation: string | null;
  created_at: string;
}

/** Shape of a row in the `code_chunks` table */
export interface CodeChunk {
  id: string;
  repository_id: string;
  profile_id: string;
  file_path: string;
  start_line: number;
  end_line: number;
  content: string;
  language: string | null;
  chunk_index: number;
  embedding: number[];          // 384-dimensional vector
  created_at: string;
}

/** Shape of a row in the `security_rules` table */
export interface SecurityRule {
  id: string;
  rule_id: string;
  title: string;
  content: string;
  severity: string;
  owasp_category: string | null;
  cwe_id: string | null;
  // embedding is omitted here — we don't need to deserialise it client-side
}

/**
 * A single vulnerability finding produced by the LLM analyzer.
 * This is the parsed JSON output from Qwen before it is persisted
 * into the `scan_results` table.
 */
export interface ScanFinding {
  rule_id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  remediation: string;
  line_number: number | null;
  snippet: string | null;
  cwe_id?: string | null;
  confidence?: number | null;
}

// ─── Express Request Augmentation ─────────────────────────────────────────────

/**
 * Augment the Express Request type so that `req.user` is typed correctly
 * after being populated by the JWT auth middleware.
 */
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
