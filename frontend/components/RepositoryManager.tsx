'use client';

/**
 * frontend/components/RepositoryManager.tsx
 * ------------------------------------------
 * Handles two ingestion methods:
 *   1. GitHub URL submission → POST /api/ingest/register
 *   2. Zip file drag-and-drop → POST /api/ingest/upload
 *
 * After submission, polls /api/ingest/status/:id every 3 seconds until
 * status reaches 'completed' or 'failed', then notifies the parent.
 */

import React, { useCallback, useRef, useState } from 'react';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:5000';
const POLL_INTERVAL_MS = 3000;

type IngestionStatus = 'idle' | 'submitting' | 'processing' | 'completed' | 'failed';

interface IngestionState {
  repositoryId: string | null;
  status: IngestionStatus;
  repoName: string;
  errorMessage: string | null;
}

interface RepositoryManagerProps {
  /** Called when ingestion successfully completes — passes the new repositoryId */
  onIngestionComplete: (repositoryId: string, repoName: string) => void;
}

export default function RepositoryManager({ onIngestionComplete }: RepositoryManagerProps) {
  const [githubUrl, setGithubUrl] = useState('');
  const [ingestion, setIngestion] = useState<IngestionState>({
    repositoryId: null,
    status: 'idle',
    repoName: '',
    errorMessage: null,
  });
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Polling ────────────────────────────────────────────────────────────────

  const startPolling = useCallback((repositoryId: string, repoName: string) => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API}/api/ingest/status/${repositoryId}`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Status check failed');
        const data = (await res.json()) as { status: string };

        if (data.status === 'completed') {
          clearInterval(pollRef.current!);
          setIngestion(prev => ({ ...prev, status: 'completed' }));
          onIngestionComplete(repositoryId, repoName);
        } else if (data.status === 'failed') {
          clearInterval(pollRef.current!);
          setIngestion(prev => ({
            ...prev,
            status: 'failed',
            errorMessage: 'Ingestion failed. Check the repository name and try again.',
          }));
        }
      } catch {
        // Network glitch — keep polling
      }
    }, POLL_INTERVAL_MS);
  }, [onIngestionComplete]);

  // ── GitHub Submit ──────────────────────────────────────────────────────────

  const handleGithubSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!githubUrl.trim()) return;

    setIngestion({ repositoryId: null, status: 'submitting', repoName: githubUrl.trim(), errorMessage: null });

    try {
      const res = await fetch(`${API}/api/ingest/register`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: githubUrl.trim() }),
      });
      const data = (await res.json()) as {
        repositoryId?: string;
        error?: string;
        ingestionStatus?: string;
      };

      if (!res.ok || !data.repositoryId) {
        setIngestion(prev => ({
          ...prev,
          status: 'failed',
          errorMessage: data.error ?? 'Failed to register repository.',
        }));
        return;
      }

      // If already completed (re-submission of existing repo)
      if (data.ingestionStatus === 'completed') {
        setIngestion(prev => ({ ...prev, status: 'completed', repositoryId: data.repositoryId! }));
        onIngestionComplete(data.repositoryId!, githubUrl.trim());
        return;
      }

      setIngestion(prev => ({ ...prev, status: 'processing', repositoryId: data.repositoryId! }));
      startPolling(data.repositoryId!, githubUrl.trim());
    } catch {
      setIngestion(prev => ({
        ...prev,
        status: 'failed',
        errorMessage: 'Network error. Is the backend running?',
      }));
    }
  };

  // ── Zip Upload ─────────────────────────────────────────────────────────────

  const handleZipUpload = async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      setIngestion(prev => ({ ...prev, errorMessage: 'Only .zip files are supported.' }));
      return;
    }

    const repoName = file.name.replace('.zip', '');
    setIngestion({ repositoryId: null, status: 'submitting', repoName, errorMessage: null });

    const formData = new FormData();
    formData.append('file', file);
    formData.append('repositoryName', repoName);

    try {
      const res = await fetch(`${API}/api/ingest/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = (await res.json()) as { repositoryId?: string; error?: string };

      if (!res.ok || !data.repositoryId) {
        setIngestion(prev => ({
          ...prev,
          status: 'failed',
          errorMessage: data.error ?? 'Upload failed.',
        }));
        return;
      }

      setIngestion(prev => ({ ...prev, status: 'processing', repositoryId: data.repositoryId! }));
      startPolling(data.repositoryId!, repoName);
    } catch {
      setIngestion(prev => ({
        ...prev,
        status: 'failed',
        errorMessage: 'Network error. Is the backend running?',
      }));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleZipUpload(file);
  };

  const handleReset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setIngestion({ repositoryId: null, status: 'idle', repoName: '', errorMessage: null });
    setGithubUrl('');
  };

  // ── Status UI helpers ──────────────────────────────────────────────────────

  const isActive = ingestion.status === 'submitting' || ingestion.status === 'processing';

  return (
    <div className="space-y-5">

      {/* ── Status Banner ─────────────────────────────────────────────────── */}
      {ingestion.status !== 'idle' && (
        <div
          className={`rounded-xl border px-4 py-3 flex items-center gap-3 text-sm transition-all ${
            ingestion.status === 'completed'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : ingestion.status === 'failed'
              ? 'bg-red-500/10 border-red-500/30 text-red-400'
              : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300'
          }`}
        >
          {ingestion.status === 'submitting' && (
            <div className="w-4 h-4 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin shrink-0" />
          )}
          {ingestion.status === 'processing' && (
            <div className="relative w-4 h-4 shrink-0">
              <div className="absolute inset-0 rounded-full border-2 border-cyan-400/30" />
              <div className="absolute inset-0 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
            </div>
          )}
          {ingestion.status === 'completed' && <span className="shrink-0 text-base">✅</span>}
          {ingestion.status === 'failed' && <span className="shrink-0 text-base">❌</span>}

          <span className="flex-1">
            {ingestion.status === 'submitting' && 'Registering repository…'}
            {ingestion.status === 'processing' && (
              <>Ingesting <span className="font-mono text-xs bg-white/10 px-1.5 py-0.5 rounded">{ingestion.repoName}</span> — chunking and embedding code…</>
            )}
            {ingestion.status === 'completed' && (
              <>Repository <span className="font-mono text-xs bg-white/10 px-1.5 py-0.5 rounded">{ingestion.repoName}</span> is ready to scan.</>
            )}
            {ingestion.status === 'failed' && (ingestion.errorMessage ?? 'Ingestion failed.')}
          </span>

          {!isActive && (
            <button onClick={handleReset} className="shrink-0 text-xs opacity-60 hover:opacity-100 transition-opacity">
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* ── GitHub URL Input ───────────────────────────────────────────────── */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-sm">
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current text-white" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">GitHub Repository</h3>
            <p className="text-xs text-[var(--color-text-muted)]">Enter owner/repo or paste the full GitHub URL</p>
          </div>
        </div>

        <form onSubmit={(e) => { void handleGithubSubmit(e); }} className="flex gap-2">
          <input
            id="github-url-input"
            type="text"
            value={githubUrl}
            onChange={e => setGithubUrl(e.target.value)}
            placeholder="e.g. torvalds/linux or https://github.com/owner/repo"
            disabled={isActive}
            className="flex-1 bg-white/5 border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm text-white placeholder-[var(--color-text-muted)] focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 disabled:opacity-40 transition-colors font-mono"
          />
          <button
            id="github-submit-btn"
            type="submit"
            disabled={isActive || !githubUrl.trim()}
            className="btn-glow px-5 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-30 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
          >
            {isActive ? 'Working…' : 'Ingest'}
          </button>
        </form>
      </div>

      {/* ── Zip Drag & Drop ────────────────────────────────────────────────── */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center text-sm">📦</div>
          <div>
            <h3 className="text-sm font-semibold text-white">Upload ZIP Archive</h3>
            <p className="text-xs text-[var(--color-text-muted)]">Drag & drop a .zip of your codebase, max 50 MB</p>
          </div>
        </div>

        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => !isActive && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-cyan-400 bg-cyan-500/10 scale-[1.01]'
              : isActive
              ? 'border-[var(--color-border)] opacity-40 cursor-not-allowed'
              : 'border-[var(--color-border)] hover:border-cyan-500/40 hover:bg-white/[0.02]'
          }`}
        >
          <div className={`text-3xl mb-2 transition-transform ${isDragging ? 'scale-125' : ''}`}>
            {isDragging ? '📂' : '📁'}
          </div>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {isDragging ? 'Release to upload' : 'Drop your .zip here, or click to browse'}
          </p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            Supports any language — node_modules excluded automatically
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) void handleZipUpload(file);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
