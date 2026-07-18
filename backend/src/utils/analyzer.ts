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

export const AUDITOR_SYSTEM = `You are a security code auditor. Find security vulnerabilities in code. Format your response exactly using the specified VULNERABILITY template block. Do not use JSON.`;

export function buildAuditorPrompt(
  chunkContent: string,
  filePath: string,
  startLine: number,
  rules: SecurityRule[],
  metadata: { language: string, frameworks: string[] }
): string {
  // Limit code length to avoid overwhelming a 1.5B model
  const snippet = chunkContent.substring(0, 1200);
  
  // Include actual pattern-matching guidance from rule contents
  const ruleHints = rules.length > 0
    ? `\nSecurity rules to check:\n${rules.map(r => `- ${r.rule_id}: ${r.title}\n  ${r.content.substring(0, 200)}`).join('\n')}`
    : '';

  return (
    `Find security vulnerabilities in this ${metadata.language} code.\n` +
    `File: ${filePath} (line ${startLine})` +
    ruleHints + `\n\n` +
    `Code:\n${snippet}\n\n` +
    `If you find vulnerabilities, output one block per vulnerability formatted EXACTLY like this:\n` +
    `VULNERABILITY: <Rule ID or CWE Token> <Short Title>\n` +
    `SEVERITY: <CRITICAL | HIGH | MEDIUM | LOW>\n` +
    `CVSS: <0.0 to 10.0>\n` +
    `ATTACK: <detailed description of the exploit>\n` +
    `FIX:\n` +
    `<code fix instructions>\n\n` +
    `If multiple vulnerabilities exist, output multiple blocks separated by a blank line.\n` +
    `If no vulnerabilities found, output exactly: NONE`
  );
}

const VALID_SEVERITIES = new Set(['critical', 'high', 'medium', 'low']);

export function parseVulnerabilityBlocks(raw: string): ScanFinding[] {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'NONE' || trimmed === '[]') {
    return [];
  }

  // Split by double blank lines (or multiple) to isolate blocks
  const blocks = trimmed.split(/\n\s*\n+/);
  const findings: ScanFinding[] = [];

  for (const block of blocks) {
    // The regex approach to extract fields from the template
    const vulnMatch = block.match(/VULNERABILITY:\s*([^\n]+)/i);
    const sevMatch = block.match(/SEVERITY:\s*([^\n]+)/i);
    const cvssMatch = block.match(/CVSS:\s*([^\n]+)/i);
    
    // We want ATTACK as everything from ATTACK: to FIX:
    const attackMatch = block.match(/ATTACK:\s*([\s\S]*?)(?:\nFIX:|$)/i);
    // FIX is everything after FIX:
    const fixMatch = block.match(/FIX:\s*([\s\S]*)$/i);

    if (!vulnMatch || !attackMatch || !fixMatch) {
      console.warn(`[parseVulnerabilityBlocks] Malformed block skipped. Block starts with: ${block.substring(0, 50)}...`);
      continue;
    }

    const vulnLine = vulnMatch[1].trim();
    // Try to extract CWE token or rule ID (e.g., "CWE-89 SQL Injection" -> "CWE-89")
    const rule_id = vulnLine.split(/\s+/)[0]; 

    let rawSeverity = sevMatch ? sevMatch[1].toLowerCase().trim() : 'medium';
    if (!VALID_SEVERITIES.has(rawSeverity)) {
      console.warn(`[parseVulnerabilityBlocks] Unrecognized severity "${rawSeverity}", defaulting to medium`);
      rawSeverity = 'medium';
    }

    let confidence: number | null = null;
    if (cvssMatch) {
      const cvssVal = parseFloat(cvssMatch[1].trim());
      if (!isNaN(cvssVal) && cvssVal >= 0 && cvssVal <= 10) {
        confidence = cvssVal / 10;
      }
    }

    findings.push({
      rule_id,
      severity: rawSeverity as ScanFinding['severity'],
      description: attackMatch[1].trim(),
      remediation: fixMatch[1].trim(),
      line_number: null, // Not provided by the model natively
      snippet: null,     // Not provided by the model natively
      cwe_id: /^CWE-\d+/i.test(rule_id) ? rule_id.toUpperCase() : null,
      confidence,
    });
  }

  return findings;
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
