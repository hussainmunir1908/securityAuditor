/**
 * src/utils/analyzer.ts
 * ----------------------
 * LLM-backed SAST analysis engine helpers.
 *
 * IMPORTANT: The model (qwen-security, 1.5B Q4_K_M) is a COMPLETION-only model.
 * It uses the ChatML template (<|im_start|>system/user/assistant<|im_end|>).
 * We MUST use /api/generate with raw ChatML, NOT /api/chat.
 * 
 * The model is small (1.5B), so prompts must be concise and direct.
 */

import { SecurityRule, ScanFinding } from '../types';

export const OLLAMA_URL = process.env['OLLAMA_URL'] || 'http://127.0.0.1:11434';
export const OLLAMA_MODEL = process.env['OLLAMA_MODEL'] || 'qwen-security:latest';

export const MAX_NEW_TOKENS = 2048;

/**
 * Builds a raw ChatML prompt string for a completion-only model.
 * Format: <|im_start|>system\n{sys}<|im_end|>\n<|im_start|>user\n{usr}<|im_end|>\n<|im_start|>assistant\n
 */
function buildChatMLPrompt(systemPrompt: string, userPrompt: string): string {
  return (
    `<|im_start|>system\n${systemPrompt}<|im_end|>\n` +
    `<|im_start|>user\n${userPrompt}<|im_end|>\n` +
    `<|im_start|>assistant\n`
  );
}

/**
 * Sends a completion request to a local Ollama instance using /api/generate.
 * Uses raw ChatML format since this is a completion-only model.
 */
export async function ollamaGenerate(systemPrompt: string, userPrompt: string, maxTokens?: number): Promise<string> {
  const prompt = buildChatMLPrompt(systemPrompt, userPrompt);
  
  const payload = {
    model: OLLAMA_MODEL,
    prompt,
    stream: false,
    raw: true,
    options: {
      temperature: 0.1,
      num_predict: maxTokens ?? MAX_NEW_TOKENS,
      stop: ['<|im_end|>', '<|im_start|>'],
    }
  };

  console.log(`[ollama] → generate (model: ${OLLAMA_MODEL}, max_tokens: ${maxTokens ?? MAX_NEW_TOKENS}, prompt_len: ${prompt.length})`);

  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[ollama] ❌ API error (${response.status}): ${errText}`);
    throw new Error(`Ollama API error (${response.status}): ${errText}`);
  }

  const data = await response.json() as { response?: string, total_duration?: number };
  const content = (data?.response ?? '').trim();

  const durationMs = data?.total_duration ? Math.round((data.total_duration as number) / 1_000_000) : 0;
  const preview = content.substring(0, 400).replace(/\n/g, '\\n');
  console.log(`[ollama] ✅ ${content.length} chars, ${durationMs}ms. Preview: ${preview}...`);

  return content;
}

// ─── JSON Extraction Utility ──────────────────────────────────────────────────

export function extractJsonArray(raw: string): unknown[] {
  // Strip markdown fences
  const cleaned = raw.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1').trim();
  const start = cleaned.indexOf('[');
  const end   = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    if (cleaned.length > 2) {
      console.warn(`[extractJsonArray] No JSON array found. Raw (300): ${cleaned.substring(0, 300)}`);
    }
    return [];
  }
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn(`[extractJsonArray] Parse failed: ${e}. Raw (300): ${cleaned.substring(0, 300)}`);
    return [];
  }
}

export function extractJsonObject(raw: string): Record<string, unknown> | null {
  const cleaned = raw.replace(/```(?:json)?\s*([\s\S]*?)```/gi, '$1').trim();
  const start = cleaned.indexOf('{');
  const end   = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

// ─── Mapper Agent ─────────────────────────────────────────────────────────────

export const MAPPER_SYSTEM = `You analyze code. Respond with ONLY a JSON object, no explanation.`;

export function buildMapperPrompt(chunkContent: string, filePath: string): string {
  // Keep it very short for a 1.5B model
  const snippet = chunkContent.substring(0, 800);
  return (
    `Analyze this code file and return JSON.\n` +
    `File: ${filePath}\n` +
    `Code:\n${snippet}\n\n` +
    `Return ONLY this JSON (no other text):\n` +
    `{"language":"<lang>","frameworks":["<fw>"],"isSensitive":<true|false>}`
  );
}

// ─── Auditor Agent ────────────────────────────────────────────────────────────

export const AUDITOR_SYSTEM = `You are a security code auditor. Find security vulnerabilities in code. Return ONLY a JSON array.`;

export function buildAuditorPrompt(
  chunkContent: string,
  filePath: string,
  startLine: number,
  rules: SecurityRule[],
  metadata: { language: string, frameworks: string[] }
): string {
  // Limit code length to avoid overwhelming a 1.5B model
  const snippet = chunkContent.substring(0, 1200);
  
  // Only include the most relevant rule titles (not full content) to save tokens
  const ruleHints = rules.length > 0
    ? `\nSecurity rules to check: ${rules.map(r => r.rule_id + ':' + r.title).join('; ')}`
    : '';

  return (
    `Find security vulnerabilities in this ${metadata.language} code.\n` +
    `File: ${filePath} (line ${startLine})` +
    ruleHints + `\n\n` +
    `Code:\n${snippet}\n\n` +
    `Return a JSON array of vulnerabilities found. Each item must have:\n` +
    `- rule_id: string (e.g. "CWE-89", "OWASP-A03")\n` +
    `- severity: "critical"|"high"|"medium"|"low"\n` +
    `- description: string\n` +
    `- remediation: string\n` +
    `- line_number: number or null\n` +
    `- snippet: string or null\n\n` +
    `If no vulnerabilities found, return []\n` +
    `JSON array:`
  );
}

const VALID_SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);

export function validateFinding(obj: Record<string, unknown>): ScanFinding | null {
  const rule_id     = typeof obj['rule_id'] === 'string' ? obj['rule_id'].trim() : null;
  const severity    = typeof obj['severity'] === 'string' ? obj['severity'].toLowerCase().trim() : null;
  const description = typeof obj['description'] === 'string' ? obj['description'].trim() : null;
  const remediation = typeof obj['remediation'] === 'string' ? obj['remediation'].trim() : null;

  if (!rule_id || !severity || !description || !remediation || !VALID_SEVERITIES.has(severity)) {
    if (Object.keys(obj).length > 0) {
      console.warn(`[validateFinding] Rejected: rule_id=${rule_id}, sev=${severity}, desc=${!!description}, rem=${!!remediation}`);
    }
    return null;
  }

  return {
    rule_id,
    severity: severity as ScanFinding['severity'],
    description,
    remediation,
    line_number: typeof obj['line_number'] === 'number' ? Math.round(obj['line_number']) : null,
    snippet: typeof obj['snippet'] === 'string' ? obj['snippet'].substring(0, 500) : null,
  };
}

// ─── Remediation Agent ────────────────────────────────────────────────────────

export const REMEDIATION_SYSTEM = `You are a security expert. Generate fix instructions for developers. Respond with ONLY a JSON object.`;

export function buildRemediationPrompt(chunkContent: string, filePath: string, findings: ScanFinding[]): string {
  const findingsList = findings.map(f =>
    `- [${f.severity.toUpperCase()}] ${f.rule_id}: ${f.description}`
  ).join('\n');

  const snippet = chunkContent.substring(0, 600);

  return (
    `File: ${filePath}\n` +
    `Vulnerabilities found:\n${findingsList}\n\n` +
    `Code snippet:\n${snippet}\n\n` +
    `Generate a developer prompt to fix these issues.\n` +
    `Return ONLY this JSON (no other text):\n` +
    `{"aiCoderPrompt":"<detailed fix instructions>"}`
  );
}
