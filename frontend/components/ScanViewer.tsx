'use client';

/**
 * frontend/components/ScanViewer.tsx
 * ------------------------------------
 * Displays a "Launch AI Scan" button and renders the full vulnerability report.
 *
 * Features:
 *  - POST /api/scan/start → streams progress
 *  - Findings grouped by severity (critical → high → medium → low)
 *  - Color-coded badges, expandable finding cards, syntax-highlighted snippets
 *  - Metrics summary bar at the top
 */

import React, { useState, useEffect } from 'react';

const API = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:5000';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Finding {
  id: string;
  rule_id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  file_path: string;
  line_number: number | null;
  snippet: string | null;
  description: string;
  remediation: string | null;
  owasp_category: string | null;
  cwe_id: string | null;
  ai_coder_prompt: string | null;
}

interface ScanSummary {
  repositoryName: string;
  chunksProcessed: number;
  totalFindings: number;
  findingsBySeverity: Record<string, number>;
}

interface ScanViewerProps {
  repositoryId: string;
  repositoryName: string;
  chunkCount?: number;
}

// ─── Severity config ──────────────────────────────────────────────────────────

const SEVERITY_ORDER: Finding['severity'][] = ['critical', 'high', 'medium', 'low', 'info'];

const SEVERITY_CONFIG: Record<string, {
  label: string;
  badgeClass: string;
  bgClass: string;
  borderClass: string;
  dotColor: string;
  icon: string;
}> = {
  critical: {
    label: 'Critical',
    badgeClass: 'badge-critical',
    bgClass: 'bg-red-500/5',
    borderClass: 'border-red-500/20',
    dotColor: '#ef4444',
    icon: '🚨',
  },
  high: {
    label: 'High',
    badgeClass: 'badge-high',
    bgClass: 'bg-orange-500/5',
    borderClass: 'border-orange-500/20',
    dotColor: '#f97316',
    icon: '⚠️',
  },
  medium: {
    label: 'Medium',
    badgeClass: 'badge-medium',
    bgClass: 'bg-yellow-500/5',
    borderClass: 'border-yellow-500/20',
    dotColor: '#eab308',
    icon: '🔶',
  },
  low: {
    label: 'Low',
    badgeClass: 'badge-low',
    bgClass: 'bg-green-500/5',
    borderClass: 'border-green-500/20',
    dotColor: '#22c55e',
    icon: '🔵',
  },
  info: {
    label: 'Info',
    badgeClass: 'badge-info',
    bgClass: 'bg-blue-500/5',
    borderClass: 'border-blue-500/20',
    dotColor: '#63b3ed',
    icon: 'ℹ️',
  },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const cfg = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG['info'];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.badgeClass}`}>
      {cfg.label}
    </span>
  );
}

function FindingCard({ finding, index }: { finding: Finding; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = SEVERITY_CONFIG[finding.severity] ?? SEVERITY_CONFIG['info'];

  return (
    <div
      className={`rounded-xl border transition-all ${cfg.bgClass} ${cfg.borderClass} overflow-hidden`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-white/[0.02] transition-colors"
      >
        <div
          className="mt-0.5 w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: cfg.dotColor, boxShadow: `0 0 6px ${cfg.dotColor}` }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <SeverityBadge severity={finding.severity} />
            <span className="text-xs font-mono text-[var(--color-text-muted)] bg-white/5 px-1.5 py-0.5 rounded">
              {finding.rule_id}
            </span>
            {finding.cwe_id && (
              <span className="text-xs text-[var(--color-text-muted)]">{finding.cwe_id}</span>
            )}
          </div>
          <p className="text-sm text-white font-medium truncate">{finding.description}</p>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-[var(--color-text-muted)] font-mono truncate">
              {finding.file_path}
              {finding.line_number != null && `:${finding.line_number}`}
            </span>
            {finding.owasp_category && (
              <span className="text-xs text-cyan-500/70 shrink-0">{finding.owasp_category}</span>
            )}
          </div>
        </div>
        <div className={`shrink-0 text-[var(--color-text-muted)] transition-transform ${expanded ? 'rotate-180' : ''}`}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-white/5">
          {/* Description */}
          <div className="pt-4">
            <h4 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
              Description
            </h4>
            <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
              {finding.description}
            </p>
          </div>

          {/* Code snippet */}
          {finding.snippet && (
            <div>
              <h4 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                Vulnerable Code
                {finding.line_number != null && (
                  <span className="ml-2 normal-case text-cyan-500/70">line {finding.line_number}</span>
                )}
              </h4>
              <div className="relative rounded-lg overflow-hidden border border-white/10">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />
                <div className="flex items-center justify-between px-4 py-2 bg-white/[0.03] border-b border-white/5">
                  <span className="text-xs text-[var(--color-text-muted)] font-mono">
                    {finding.file_path.split('/').pop()}
                  </span>
                  <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-500/60" />
                    <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
                    <div className="w-2 h-2 rounded-full bg-green-500/60" />
                  </div>
                </div>
                <pre
                  className="p-4 text-xs overflow-x-auto text-red-200/90 leading-relaxed"
                  style={{ fontFamily: 'var(--font-mono)', background: 'rgba(239,68,68,0.04)' }}
                >
                  <code>{finding.snippet}</code>
                </pre>
              </div>
            </div>
          )}

          {/* Remediation */}
          {finding.remediation && (
            <div>
              <h4 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1">
                Remediation
              </h4>
              <div className="flex gap-2">
                <div className="w-0.5 bg-emerald-500/40 rounded-full shrink-0" />
                <p className="text-sm text-emerald-300/80 leading-relaxed">{finding.remediation}</p>
              </div>
            </div>
          )}

          {/* AI Coder Prompt */}
          {finding.ai_coder_prompt && (
            <div className="mt-4 pt-4 border-t border-white/5">
              <h4 className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                AI Coder Prompt (Cursor/Copilot)
              </h4>
              <div className="relative group rounded-lg overflow-hidden border border-purple-500/20 bg-purple-500/5">
                <pre
                  className="p-4 text-xs overflow-x-auto text-purple-200/90 whitespace-pre-wrap leading-relaxed"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  <code>{finding.ai_coder_prompt}</code>
                </pre>
                <button
                  onClick={() => void navigator.clipboard.writeText(finding.ai_coder_prompt!)}
                  className="absolute top-2 right-2 p-1.5 rounded-md bg-purple-500/20 text-purple-300 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-purple-500/40"
                  title="Copy prompt"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ScanViewer({ repositoryId, repositoryName, chunkCount = 0 }: ScanViewerProps) {
  const [scanState, setScanState] = useState<'idle' | 'scanning' | 'done' | 'error'>('idle');
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>('all');

  useEffect(() => {
    let isMounted = true;
    const fetchExistingResults = async () => {
      setScanState('scanning');
      try {
        const metricsRes = await fetch(`${API}/api/scan/metrics/${repositoryId}`, {
          credentials: 'include',
        });
        const resultsRes = await fetch(`${API}/api/scan/results/${repositoryId}`, {
          credentials: 'include',
        });

        if (!metricsRes.ok || !resultsRes.ok) {
          if (isMounted) {
            setErrorMsg('Failed to load existing scan results.');
            setScanState('error');
          }
          return;
        }

        const metricsData = await metricsRes.json();
        const resultsData = await resultsRes.json();

        if (isMounted) {
          setSummary({
            repositoryName: metricsData.repositoryName ?? repositoryName,
            chunksProcessed: chunkCount,
            totalFindings: metricsData.totalFindings ?? 0,
            findingsBySeverity: metricsData.findingsBySeverity ?? {},
          });
          setFindings(resultsData.findings ?? []);
          setScanState('done');
        }
      } catch (err) {
        if (isMounted) {
          setErrorMsg('Network error while loading existing results.');
          setScanState('error');
        }
      }
    };
    
    void fetchExistingResults();
    
    return () => {
      isMounted = false;
    };
  }, [repositoryId, repositoryName, chunkCount]);

  const handleScan = async () => {
    setScanState('scanning');
    setFindings([]);
    setSummary(null);
    setErrorMsg(null);
    setActiveFilter('all');

    try {
      const res = await fetch(`${API}/api/scan/start`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repositoryId }),
      });
      const data = (await res.json()) as {
        error?: string;
        totalFindings?: number;
        findingsBySeverity?: Record<string, number>;
        chunksProcessed?: number;
      };

      if (!res.ok) {
        setErrorMsg(data.error ?? 'Scan failed. Try again.');
        setScanState('error');
        return;
      }

      // Fetch the full findings list
      const resultsRes = await fetch(`${API}/api/scan/results/${repositoryId}`, {
        credentials: 'include',
      });
      const resultsData = (await resultsRes.json()) as {
        findings?: Finding[];
        repositoryName?: string;
      };

      setSummary({
        repositoryName,
        chunksProcessed: data.chunksProcessed ?? 0,
        totalFindings: data.totalFindings ?? 0,
        findingsBySeverity: data.findingsBySeverity ?? {},
      });
      setFindings(resultsData.findings ?? []);
      setScanState('done');
    } catch {
      setErrorMsg('Network error. Is the backend running?');
      setScanState('error');
    }
  };

  // ── Group findings by severity ─────────────────────────────────────────────

  const grouped = SEVERITY_ORDER.reduce<Record<string, Finding[]>>((acc, sev) => {
    acc[sev] = findings.filter(f => f.severity === sev);
    return acc;
  }, {});

  const filtered = activeFilter === 'all' ? findings : findings.filter(f => f.severity === activeFilter);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ── Launch Button + Summary ──────────────────────────────────────── */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="text-sm font-semibold text-white mb-0.5">AI Security Scan</h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              Repository: <span className="font-mono text-cyan-400">{repositoryName}</span>
            </p>
          </div>
          <button
            id="launch-scan-btn"
            onClick={() => void handleScan()}
            disabled={scanState === 'scanning'}
            className="btn-glow px-6 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
          >
            {scanState === 'scanning' ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Scanning…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Launch AI Scan
              </>
            )}
          </button>
        </div>

        {/* Scanning progress indicator */}
        {scanState === 'scanning' && (
          <div className="mt-4 pt-4 border-t border-white/5">
            <div className="flex items-center gap-3 text-xs text-[var(--color-text-secondary)]">
              <div className="flex gap-1">
                {[0,1,2].map(i => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
              RAG retrieval → Qwen2.5-Coder analysis in progress…
            </div>
            <div className="mt-2 h-1 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 rounded-full animate-pulse w-3/4" />
            </div>
          </div>
        )}

        {/* Error state */}
        {scanState === 'error' && errorMsg && (
          <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-2 text-sm text-red-400">
            <span>❌</span> {errorMsg}
          </div>
        )}
      </div>

      {/* ── Metrics summary ──────────────────────────────────────────────── */}
      {scanState === 'done' && summary && (
        <div className="animate-fade-in-up">
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">Scan Summary</h3>
              <span className="text-xs text-[var(--color-text-muted)]">
                {summary.chunksProcessed} chunks processed
              </span>
            </div>

            {summary.totalFindings === 0 ? (
              <div className="flex items-center gap-3 text-sm text-emerald-400">
                <span className="text-2xl">🎉</span>
                <div>
                  <p className="font-semibold">No vulnerabilities detected!</p>
                  <p className="text-xs text-emerald-300/60">The RAG engine found no security issues in this codebase.</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {SEVERITY_ORDER.filter(s => s !== 'info').map(sev => {
                  const count = summary.findingsBySeverity[sev] ?? 0;
                  const cfg = SEVERITY_CONFIG[sev];
                  return (
                    <button
                      key={sev}
                      onClick={() => setActiveFilter(activeFilter === sev ? 'all' : sev)}
                      className={`rounded-xl p-3 text-center transition-all border ${
                        activeFilter === sev ? `${cfg.bgClass} ${cfg.borderClass}` : 'bg-white/[0.02] border-transparent hover:bg-white/[0.04]'
                      }`}
                    >
                      <div
                        className="text-2xl font-bold tabular-nums mb-0.5"
                        style={{ color: cfg.dotColor }}
                      >
                        {count}
                      </div>
                      <div className={`text-xs font-semibold ${cfg.badgeClass} inline-block px-2 py-0.5 rounded-full`}>
                        {cfg.label}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Findings List ────────────────────────────────────────────────── */}
      {scanState === 'done' && findings.length > 0 && (
        <div className="animate-fade-in-up space-y-4">
          {/* Filter tabs */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                activeFilter === 'all'
                  ? 'bg-white/10 text-white'
                  : 'text-[var(--color-text-muted)] hover:text-white'
              }`}
            >
              All ({findings.length})
            </button>
            {SEVERITY_ORDER.filter(s => (grouped[s]?.length ?? 0) > 0).map(sev => {
              const cfg = SEVERITY_CONFIG[sev];
              return (
                <button
                  key={sev}
                  onClick={() => setActiveFilter(sev)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    activeFilter === sev
                      ? `${cfg.badgeClass}`
                      : 'text-[var(--color-text-muted)] hover:text-white'
                  }`}
                >
                  {cfg.icon} {cfg.label} ({grouped[sev]?.length ?? 0})
                </button>
              );
            })}
          </div>

          {/* Finding cards */}
          <div className="space-y-3">
            {SEVERITY_ORDER.map(sev => {
              if (activeFilter !== 'all' && activeFilter !== sev) return null;
              const sevFindings = grouped[sev] ?? [];
              if (sevFindings.length === 0) return null;

              const cfg = SEVERITY_CONFIG[sev];
              return (
                <div key={sev}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm">{cfg.icon}</span>
                    <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: cfg.dotColor }}>
                      {cfg.label} Severity
                    </h4>
                    <div className="flex-1 h-px bg-white/5" />
                    <span className="text-xs text-[var(--color-text-muted)]">{sevFindings.length}</span>
                  </div>
                  <div className="space-y-2">
                    {sevFindings.map((finding, idx) => (
                      <FindingCard key={finding.id} finding={finding} index={idx} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
