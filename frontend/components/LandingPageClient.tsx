/**
 * frontend/components/LandingPageClient.tsx
 * ------------------------------------------
 * Client component for the landing page.
 * Uses the useAuth hook to show either the login button or
 * a "Go to Dashboard" button based on auth state.
 */

'use client';

import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:5000';

// ─── Feature Card Data ────────────────────────────────────────────────────────

const features = [
  {
    icon: '🔍',
    title: 'Deep Code Analysis',
    description:
      'Ingests your entire repository and breaks it into semantic chunks, indexed in a pgvector knowledge base for context-aware scanning.',
    accent: 'var(--color-cyan)',
  },
  {
    icon: '🧠',
    title: 'RAG-Powered Detection',
    description:
      'Combines vector similarity search with LLM reasoning to detect subtle vulnerabilities that rule-based scanners miss.',
    accent: 'var(--color-purple)',
  },
  {
    icon: '🛡️',
    title: 'OWASP Top 10 Coverage',
    description:
      'Maps findings to CWE identifiers and OWASP categories, with AI-generated remediation suggestions for each vulnerability.',
    accent: 'var(--color-emerald)',
  },
  {
    icon: '⚡',
    title: 'Real-Time Results',
    description:
      'Scan progress streamed live via WebSockets. Drill into file-level findings with highlighted code snippets and severity scoring.',
    accent: 'var(--color-cyan)',
  },
  {
    icon: '🔐',
    title: 'GitHub Native Auth',
    description:
      'Sign in with GitHub OAuth. We store your access token securely to fetch private repositories directly from the platform.',
    accent: 'var(--color-purple)',
  },
  {
    icon: '📊',
    title: 'Audit Dashboard',
    description:
      'Track vulnerability trends across scans, compare severity distributions, and export reports in JSON or PDF format.',
    accent: 'var(--color-emerald)',
  },
];

// ─── Stats ────────────────────────────────────────────────────────────────────

const stats = [
  { value: '10K+', label: 'Vulnerabilities Detected' },
  { value: '99.2%', label: 'Scan Accuracy' },
  { value: '< 3min', label: 'Avg Scan Time' },
  { value: 'OWASP', label: 'Top 10 Mapped' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function LandingPageClient() {
  const { user, isLoading } = useAuth();

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] bg-grid relative overflow-hidden">

      {/* ── Decorative Glow Orbs ──────────────────────────────────── */}
      <div
        className="glow-orb"
        style={{
          width: '600px',
          height: '600px',
          background: 'radial-gradient(circle, rgba(34,211,238,0.12) 0%, transparent 70%)',
          top: '-150px',
          left: '-150px',
        }}
      />
      <div
        className="glow-orb"
        style={{
          width: '500px',
          height: '500px',
          background: 'radial-gradient(circle, rgba(168,85,247,0.12) 0%, transparent 70%)',
          top: '30%',
          right: '-100px',
          animationDelay: '3s',
        }}
      />
      <div
        className="glow-orb"
        style={{
          width: '400px',
          height: '400px',
          background: 'radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)',
          bottom: '10%',
          left: '30%',
          animationDelay: '5s',
        }}
      />

      {/* ── Navigation ───────────────────────────────────────────── */}
      <nav className="relative z-10 flex items-center justify-between px-6 md:px-12 py-5 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center text-sm font-bold shadow-lg shadow-cyan-500/20">
            ⚡
          </div>
          <span className="font-semibold text-lg tracking-tight text-white">
            RAG<span className="text-cyan-400">Sec</span>
          </span>
        </div>

        <div className="flex items-center gap-4">
          {!isLoading && user && (
            <div className="flex items-center gap-3">
              <img
                src={user.avatarUrl}
                alt={user.login}
                className="w-8 h-8 rounded-full border border-[var(--color-border-hover)]"
              />
              <span className="text-sm text-[var(--color-text-secondary)] hidden sm:block">
                @{user.login}
              </span>
              <Link
                href="/dashboard"
                className="btn-glow px-4 py-2 rounded-lg text-sm font-medium text-white"
              >
                Dashboard →
              </Link>
            </div>
          )}
          {!isLoading && !user && (
            <a
              id="nav-github-login"
              href={`${API_URL}/api/auth/github`}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:border-[var(--color-border-hover)] hover:text-white transition-all duration-200"
            >
              <GitHubIcon className="w-4 h-4" />
              Sign in
            </a>
          )}
        </div>
      </nav>

      {/* ── Hero Section ─────────────────────────────────────────── */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pt-24 pb-20 max-w-5xl mx-auto">

        {/* Badge */}
        <div className="animate-fade-in-up animate-delay-100 inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 text-xs font-medium mb-8 tracking-wide uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          Powered by Retrieval-Augmented Generation
        </div>

        {/* Headline */}
        <h1 className="animate-fade-in-up animate-delay-200 text-5xl md:text-7xl font-black leading-none tracking-tight mb-6">
          <span className="gradient-text">Agentic RAG</span>
          <br />
          <span className="text-white">Security Auditor</span>
        </h1>

        {/* Subheading */}
        <p className="animate-fade-in-up animate-delay-300 text-lg md:text-xl text-[var(--color-text-secondary)] max-w-2xl mb-10 leading-relaxed">
          AI-native Static Application Security Testing. Connect your GitHub repository
          and let our RAG pipeline detect vulnerabilities, map them to OWASP Top 10,
          and generate actionable remediation guidance.
        </p>

        {/* CTA Buttons */}
        <div className="animate-fade-in-up animate-delay-400 flex flex-col sm:flex-row gap-4 items-center">
          {isLoading ? (
            <div className="w-56 h-14 rounded-xl bg-slate-800/60 animate-pulse" />
          ) : user ? (
            <Link
              id="hero-dashboard-btn"
              href="/dashboard"
              className="btn-glow flex items-center gap-3 px-8 py-4 rounded-xl text-base font-semibold text-white shadow-xl"
            >
              <span>⚡</span>
              Go to Dashboard
            </Link>
          ) : (
            <a
              id="hero-github-login-btn"
              href={`${API_URL}/api/auth/github`}
              className="btn-glow flex items-center gap-3 px-8 py-4 rounded-xl text-base font-semibold text-white shadow-xl shadow-cyan-500/20"
            >
              <GitHubIcon className="w-5 h-5" />
              Login with GitHub
            </a>
          )}

          <a
            href="#features"
            className="flex items-center gap-2 px-6 py-4 rounded-xl border border-[var(--color-border)] text-[var(--color-text-secondary)] text-base font-medium hover:border-[var(--color-border-hover)] hover:text-white transition-all duration-200"
          >
            Explore Features
            <span className="text-xs">↓</span>
          </a>
        </div>

        {/* Stats Row */}
        <div className="animate-fade-in-up animate-delay-500 grid grid-cols-2 md:grid-cols-4 gap-6 mt-20 w-full">
          {stats.map((stat) => (
            <div key={stat.label} className="glass-card px-4 py-5 text-center">
              <div className="text-2xl font-black gradient-text mb-1">{stat.value}</div>
              <div className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features Grid ────────────────────────────────────────── */}
      <section id="features" className="relative z-10 px-6 md:px-12 pb-24 max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Built for Modern Security Teams
          </h2>
          <p className="text-[var(--color-text-secondary)] max-w-xl mx-auto">
            Every feature is designed to integrate into your CI/CD workflow and
            surface actionable insights, not alert fatigue.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <div
              key={feature.title}
              className="glass-card p-6 group"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              {/* Icon with glow */}
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-4 transition-transform duration-300 group-hover:scale-110"
                style={{
                  background: `linear-gradient(135deg, ${feature.accent}20, ${feature.accent}08)`,
                  border: `1px solid ${feature.accent}30`,
                  boxShadow: `0 0 20px ${feature.accent}15`,
                }}
              >
                {feature.icon}
              </div>

              <h3
                className="text-base font-semibold mb-2 transition-colors duration-200"
                style={{ color: feature.accent }}
              >
                {feature.title}
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA Footer Banner ─────────────────────────────────────── */}
      <section className="relative z-10 px-6 pb-24 max-w-4xl mx-auto">
        <div
          className="glass-card p-10 text-center"
          style={{
            background: 'linear-gradient(135deg, rgba(34,211,238,0.08) 0%, rgba(168,85,247,0.08) 100%)',
            borderColor: 'rgba(34,211,238,0.2)',
          }}
        >
          <h2 className="text-3xl font-bold text-white mb-3">
            Ready to Audit Your Codebase?
          </h2>
          <p className="text-[var(--color-text-secondary)] mb-8 max-w-lg mx-auto">
            Connect your GitHub account and run your first scan in under 5 minutes.
            No agent installation. No configuration. Just results.
          </p>
          {!isLoading && !user && (
            <a
              id="footer-github-login-btn"
              href={`${API_URL}/api/auth/github`}
              className="btn-glow inline-flex items-center gap-3 px-8 py-4 rounded-xl text-base font-semibold text-white"
            >
              <GitHubIcon className="w-5 h-5" />
              Get Started — It&apos;s Free
            </a>
          )}
          {!isLoading && user && (
            <Link
              href="/dashboard"
              className="btn-glow inline-flex items-center gap-3 px-8 py-4 rounded-xl text-base font-semibold text-white"
            >
              Open Dashboard →
            </Link>
          )}
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-[var(--color-border)] px-6 md:px-12 py-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <span className="text-cyan-400 font-semibold">RAGSec</span>
            <span>·</span>
            <span>Agentic RAG Security Auditor</span>
          </div>
          <div className="text-xs text-[var(--color-text-muted)]">
            Built with Next.js · Express · Supabase · pgvector
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── GitHub SVG Icon ──────────────────────────────────────────────────────────
function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}
