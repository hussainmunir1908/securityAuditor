/**
 * frontend/app/dashboard/page.tsx
 * ---------------------------------
 * Protected dashboard page — the main workspace for authenticated users.
 *
 * Shows a welcome panel with the user's GitHub profile, quick-action cards
 * for the Step 2/3 features (ingestion, scanning), and recent scan stubs.
 *
 * The /dashboard route is protected at the middleware level (middleware.ts).
 * This component also uses useAuth for client-side user data.
 */

'use client';

import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';

export default function DashboardPage() {
  const { user, isLoading, logout } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-[var(--color-text-secondary)] text-sm">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[var(--color-text-secondary)] mb-4">You are not logged in.</p>
          <Link href="/" className="text-cyan-400 hover:text-cyan-300 transition-colors">
            ← Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] bg-grid">

      {/* ── Top Navigation ─────────────────────────────────────── */}
      <nav className="border-b border-[var(--color-border)] px-6 md:px-10 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center text-sm font-bold">
            ⚡
          </div>
          <span className="font-semibold text-white">
            RAG<span className="text-cyan-400">Sec</span>
          </span>
          <span className="text-[var(--color-text-muted)] text-sm">/</span>
          <span className="text-[var(--color-text-secondary)] text-sm">Dashboard</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <img
              src={user.avatarUrl}
              alt={user.login}
              className="w-7 h-7 rounded-full border border-[var(--color-border-hover)]"
            />
            <span className="text-sm text-[var(--color-text-secondary)] hidden sm:block">
              @{user.login}
            </span>
          </div>
          <button
            id="dashboard-logout-btn"
            onClick={() => void logout()}
            className="text-xs text-[var(--color-text-muted)] hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg border border-[var(--color-border)] hover:border-red-500/30"
          >
            Logout
          </button>
        </div>
      </nav>

      {/* ── Main Content ───────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-6 md:px-10 py-10">

        {/* Welcome Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">
            Welcome back,{' '}
            <span className="gradient-text">{user.login}</span> 👋
          </h1>
          <p className="text-[var(--color-text-secondary)]">
            Your security workspace is ready. Connect a repository to begin your first scan.
          </p>
        </div>

        {/* Quick Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {/* Ingest Repository */}
          <div className="glass-card p-6 flex flex-col">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center text-xl mb-4"
              style={{ background: 'rgba(34,211,238,0.1)', border: '1px solid rgba(34,211,238,0.2)' }}
            >
              📦
            </div>
            <h3 className="text-cyan-400 font-semibold text-sm mb-2">Ingest Repository</h3>
            <p className="text-[var(--color-text-secondary)] text-xs flex-1 mb-4">
              Connect a GitHub repository to index its codebase into the vector knowledge base.
            </p>
            <button
              id="btn-ingest-repo"
              disabled
              className="text-xs px-4 py-2 rounded-lg border border-cyan-500/20 text-cyan-400/50 cursor-not-allowed"
            >
              Coming in Step 2 →
            </button>
          </div>

          {/* Run Scan */}
          <div className="glass-card p-6 flex flex-col">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center text-xl mb-4"
              style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)' }}
            >
              🔬
            </div>
            <h3 className="text-purple-400 font-semibold text-sm mb-2">Run SAST Scan</h3>
            <p className="text-[var(--color-text-secondary)] text-xs flex-1 mb-4">
              Launch an AI-powered security scan on an ingested repository using the RAG pipeline.
            </p>
            <button
              id="btn-run-scan"
              disabled
              className="text-xs px-4 py-2 rounded-lg border border-purple-500/20 text-purple-400/50 cursor-not-allowed"
            >
              Coming in Step 3 →
            </button>
          </div>

          {/* View Reports */}
          <div className="glass-card p-6 flex flex-col">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center text-xl mb-4"
              style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}
            >
              📊
            </div>
            <h3 className="text-emerald-400 font-semibold text-sm mb-2">Audit Reports</h3>
            <p className="text-[var(--color-text-secondary)] text-xs flex-1 mb-4">
              View historical scan results, filter by severity, and export findings as JSON or PDF.
            </p>
            <button
              id="btn-view-reports"
              disabled
              className="text-xs px-4 py-2 rounded-lg border border-emerald-500/20 text-emerald-400/50 cursor-not-allowed"
            >
              Coming in Step 3 →
            </button>
          </div>
        </div>

        {/* API Status Panel */}
        <div className="glass-card p-6">
          <h2 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-4">
            System Status
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Auth API', status: 'operational', color: 'var(--color-emerald)' },
              { label: 'Ingest Pipeline', status: 'pending (Step 2)', color: 'var(--color-cyan)' },
              { label: 'SAST Engine', status: 'pending (Step 3)', color: 'var(--color-purple)' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: item.color, boxShadow: `0 0 6px ${item.color}` }}
                />
                <div>
                  <div className="text-xs font-medium text-white">{item.label}</div>
                  <div className="text-xs" style={{ color: item.color }}>{item.status}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
