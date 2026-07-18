'use client';

/**
 * frontend/app/dashboard/page.tsx
 * --------------------------------
 * Single-repo dashboard for RAGSec.
 *
 * Simplified flow:
 *   1. User pastes a GitHub URL
 *   2. System ingests, embeds, and auto-scans
 *   3. Results are displayed
 *   4. User can scan a new repo (clears old data)
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import ScanViewer from '@/components/ScanViewer';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:5000';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActiveRepo {
  id: string;
  repo_name: string;
  github_repo_url: string;
  ingestion_status: 'pending' | 'processing' | 'completed' | 'failed';
  last_scanned_at: string | null;
  created_at: string;
  chunk_count: number;
  findings_count: number;
  pipeline_stage: 'ingesting' | 'scanning' | 'completed' | 'failed';
}

type PipelineStage = 'idle' | 'ingesting' | 'scanning' | 'completed' | 'failed';

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, isLoading, logout } = useAuth();

  const [activeRepo, setActiveRepo] = useState<ActiveRepo | null>(null);
  const [loading, setLoading] = useState(true);
  const [repoUrl, setRepoUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<PipelineStage>('idle');

  // Track if we should poll
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch active repository ─────────────────────────────────────────────────

  const fetchActive = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/ingest/active`, {
        credentials: 'include',
      });
      if (!res.ok) return;
      const data = await res.json() as { repository: ActiveRepo | null };

      if (data.repository) {
        setActiveRepo(data.repository);

        // Use pipeline_stage from the backend directly
        const ps = data.repository.pipeline_stage;
        if (ps === 'ingesting') {
          setStage('ingesting');
        } else if (ps === 'scanning') {
          setStage('scanning');
        } else if (ps === 'completed') {
          setStage('completed');
        } else if (ps === 'failed') {
          setStage('failed');
        }
      } else {
        setActiveRepo(null);
        setStage('idle');
      }
    } catch {
      // Backend may not be running
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void fetchActive();
  }, [user, fetchActive]);

  // ── Poll while ingesting or scanning ────────────────────────────────────────

  useEffect(() => {
    if (stage === 'ingesting' || stage === 'scanning') {
      pollRef.current = setInterval(() => {
        void fetchActive();
      }, 4000);
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [stage, fetchActive]);

  // ── Submit new repo ─────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!repoUrl.trim() || submitting) return;
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`${API}/api/ingest/register`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: repoUrl.trim() }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error ?? 'Failed to register repository.');
        return;
      }

      // Success — start polling
      setStage('ingesting');
      setRepoUrl('');
      await fetchActive();
    } catch (err) {
      setError('Network error. Is the backend running?');
    } finally {
      setSubmitting(false);
    }
  }, [repoUrl, submitting, fetchActive]);

  // ── Scan new repo (clear current) ──────────────────────────────────────────

  const handleScanNew = useCallback(() => {
    setActiveRepo(null);
    setStage('idle');
    setRepoUrl('');
    setError(null);
  }, []);

  // ── Loading / Auth guards ──────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-[var(--color-text-secondary)] text-sm">Loading workspace…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[var(--color-text-secondary)] mb-4">Session expired. Please log in again.</p>
          <Link href="/" className="text-cyan-400 hover:text-cyan-300 transition-colors">← Back to Home</Link>
        </div>
      </div>
    );
  }

  // ── Main layout ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] bg-grid flex flex-col">

      {/* ──────────────── TOP NAV ──────────────────────────────────────── */}
      <nav className="border-b border-[var(--color-border)] px-5 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center text-xs font-bold">
            ⚡
          </div>
          <span className="font-semibold text-white text-sm">
            RAG<span className="text-cyan-400">Sec</span>
          </span>
          <span className="text-[var(--color-text-muted)] text-sm hidden sm:block">/ Dashboard</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 pl-2 border-l border-[var(--color-border)]">
            <img
              src={user.avatarUrl}
              alt={user.login}
              className="w-6 h-6 rounded-full border border-[var(--color-border-hover)]"
            />
            <span className="text-xs text-[var(--color-text-secondary)] hidden sm:block">@{user.login}</span>
          </div>

          <button
            id="dashboard-logout-btn"
            onClick={() => void logout()}
            className="text-xs text-[var(--color-text-muted)] hover:text-red-400 transition-colors px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] hover:border-red-500/30"
          >
            Logout
          </button>
        </div>
      </nav>

      {/* ──────────────── MAIN CONTENT ──────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8">

          {/* ── IDLE: Show repo input ─────────────────────────────────── */}
          {(stage === 'idle' || loading) && !activeRepo && !loading && (
            <div className="animate-fade-in-up">
              <div className="text-center mb-8">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500/10 to-purple-500/10 border border-[var(--color-border)] flex items-center justify-center text-4xl mx-auto mb-5">
                  🔐
                </div>
                <h1 className="text-2xl font-bold text-white mb-2">Scan a Repository</h1>
                <p className="text-sm text-[var(--color-text-secondary)] max-w-md mx-auto">
                  Paste a GitHub repository URL below. The AI engine will ingest the codebase, analyze every file with 4 specialized agents, and surface security vulnerabilities.
                </p>
              </div>

              <div className="glass-card p-6 max-w-xl mx-auto">
                <label className="block text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                  GitHub Repository URL
                </label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void handleSubmit()}
                    placeholder="owner/repo or https://github.com/owner/repo"
                    className="flex-1 bg-white/[0.03] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm text-white placeholder-[var(--color-text-muted)] focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 transition-colors"
                    disabled={submitting}
                  />
                  <button
                    onClick={() => void handleSubmit()}
                    disabled={submitting || !repoUrl.trim()}
                    className="btn-glow px-6 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                  >
                    {submitting ? (
                      <span className="flex items-center gap-2">
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Starting…
                      </span>
                    ) : (
                      '🚀 Scan'
                    )}
                  </button>
                </div>
                {error && (
                  <p className="mt-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
                )}
              </div>
            </div>
          )}

          {/* ── Loading state ─────────────────────────────────────────── */}
          {loading && (
            <div className="flex items-center justify-center min-h-[50vh]">
              <div className="flex flex-col items-center gap-4">
                <div className="w-10 h-10 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-[var(--color-text-secondary)] text-sm">Loading workspace…</p>
              </div>
            </div>
          )}

          {/* ── INGESTING: Show progress ──────────────────────────────── */}
          {stage === 'ingesting' && activeRepo && (
            <div className="animate-fade-in-up">
              <div className="glass-card p-8 text-center max-w-xl mx-auto">
                {/* Pipeline progress bar */}
                <div className="flex items-center justify-center gap-2 mb-6">
                  <PipelineStep label="Ingest" active done={false} />
                  <div className="w-8 h-px bg-[var(--color-border)]" />
                  <PipelineStep label="Scan" active={false} done={false} />
                  <div className="w-8 h-px bg-[var(--color-border)]" />
                  <PipelineStep label="Results" active={false} done={false} />
                </div>

                <div className="text-3xl mb-3 animate-bounce">📦</div>
                <h2 className="text-xl font-bold text-white mb-1">Ingesting Repository</h2>
                <p className="text-sm text-[var(--color-text-secondary)] mb-2 font-mono">{activeRepo.repo_name}</p>
                <p className="text-xs text-[var(--color-text-muted)] mb-4">
                  Fetching files from GitHub, chunking code, and generating embeddings.
                  This may take a few minutes for large repos.
                </p>
                <div className="flex items-center justify-center gap-4 text-xs text-[var(--color-text-muted)]">
                  <span>📄 {activeRepo.chunk_count} chunks indexed</span>
                </div>
                <div className="flex justify-center mt-4 gap-1">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce"
                      style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── SCANNING: Show scan progress ──────────────────────────── */}
          {stage === 'scanning' && activeRepo && (
            <div className="animate-fade-in-up">
              <div className="glass-card p-8 text-center max-w-xl mx-auto">
                <div className="flex items-center justify-center gap-2 mb-6">
                  <PipelineStep label="Ingest" active={false} done />
                  <div className="w-8 h-px bg-emerald-500/40" />
                  <PipelineStep label="Scan" active done={false} />
                  <div className="w-8 h-px bg-[var(--color-border)]" />
                  <PipelineStep label="Results" active={false} done={false} />
                </div>

                <div className="text-3xl mb-3">🔬</div>
                <h2 className="text-xl font-bold text-white mb-1">AI Security Scan Running</h2>
                <p className="text-sm text-[var(--color-text-secondary)] mb-2 font-mono">{activeRepo.repo_name}</p>
                <p className="text-xs text-[var(--color-text-muted)] mb-4">
                  4 AI agents (Mapper → RAG Retriever → Auditor → Remediation) are analyzing each code chunk on your local GPU.
                  This will take several minutes depending on repo size.
                </p>
                <div className="flex items-center justify-center gap-4 text-xs text-[var(--color-text-muted)]">
                  <span>📄 {activeRepo.chunk_count} chunks</span>
                  <span>•</span>
                  <span>🚨 {activeRepo.findings_count} findings so far</span>
                </div>
                <div className="flex justify-center mt-4 gap-1">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce"
                      style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── COMPLETED: Show results ───────────────────────────────── */}
          {stage === 'completed' && activeRepo && (
            <div className="animate-fade-in-up">
              {/* Repo header */}
              <div className="mb-6">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        ✅ scan complete
                      </span>
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {activeRepo.chunk_count} chunks analyzed
                      </span>
                    </div>
                    <h1 className="text-2xl font-bold text-white font-mono">
                      {activeRepo.repo_name}
                    </h1>
                    <a
                      href={activeRepo.github_repo_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-cyan-400/70 hover:text-cyan-400 transition-colors mt-1 inline-flex items-center gap-1"
                    >
                      View on GitHub ↗
                    </a>
                  </div>

                  <button
                    onClick={handleScanNew}
                    className="btn-glow px-5 py-2 rounded-lg text-sm font-semibold text-white"
                  >
                    🔄 Scan New Repository
                  </button>
                </div>
              </div>

              {/* Scan results */}
              <ScanViewer
                repositoryId={activeRepo.id}
                repositoryName={activeRepo.repo_name}
                chunkCount={activeRepo.chunk_count}
              />
            </div>
          )}

          {/* ── FAILED: Show error ────────────────────────────────────── */}
          {stage === 'failed' && activeRepo && (
            <div className="animate-fade-in-up">
              <div className="glass-card p-8 text-center max-w-xl mx-auto">
                <div className="text-3xl mb-3">❌</div>
                <h2 className="text-xl font-bold text-white mb-1">Ingestion Failed</h2>
                <p className="text-sm text-[var(--color-text-secondary)] mb-2 font-mono">{activeRepo.repo_name}</p>
                <p className="text-xs text-[var(--color-text-muted)] mb-6">
                  The ingestion process failed. Common causes: the server restarted mid-job, the GitHub token expired,
                  or the Hugging Face embedding API timed out. Check the backend terminal for details.
                </p>
                <button
                  onClick={handleScanNew}
                  className="btn-glow px-6 py-2.5 rounded-lg text-sm font-semibold text-white"
                >
                  🔄 Try Again
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ─── Pipeline Step Indicator ──────────────────────────────────────────────────

function PipelineStep({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
        done
          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
          : active
            ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400 animate-pulse'
            : 'bg-white/[0.03] border-[var(--color-border)] text-[var(--color-text-muted)]'
      }`}>
        {done ? '✓' : active ? '⋯' : '○'}
      </div>
      <span className={`text-[10px] font-medium ${
        done ? 'text-emerald-400' : active ? 'text-cyan-400' : 'text-[var(--color-text-muted)]'
      }`}>
        {label}
      </span>
    </div>
  );
}
