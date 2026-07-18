/**
 * src/utils/langgraph.ts
 * ----------------------
 * Multi-Agent LangGraph orchestration workflow for SAST scanning.
 *
 * Sequence: START → mapperNode → retrieveNode → auditorNode → remediationNode → END
 *
 * Uses ollamaGenerate() with raw ChatML since qwen-security is a completion-only model.
 */

import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { retrieveRelevantRules } from './rag';
import {
  ollamaGenerate, MAX_NEW_TOKENS,
  MAPPER_SYSTEM, buildMapperPrompt, extractJsonObject,
  AUDITOR_SYSTEM, buildAuditorPrompt, parseVulnerabilityBlocks,
  REMEDIATION_SYSTEM, buildRemediationPrompt
} from './analyzer';
import { CodeChunk, SecurityRule, ScanFinding } from '../types';

// ─── Graph State Definition ───────────────────────────────────────────────────

export const ScanState = Annotation.Root({
  chunk: Annotation<CodeChunk>({
    reducer: (_prev, next) => next,
    default: () => ({} as CodeChunk),
  }),
  repositoryMetadata: Annotation<{ language: string, frameworks: string[], isSensitive: boolean }>({
    reducer: (_prev, next) => next,
    default: () => ({ language: 'unknown', frameworks: [], isSensitive: false }),
  }),
  ragContext: Annotation<SecurityRule[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  vulnerabilities: Annotation<ScanFinding[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  finalReport: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
});

type ScanStateType = typeof ScanState.State;

// ─── Nodes ────────────────────────────────────────────────────────────────────

/**
 * 1. Mapper Agent
 */
async function mapperNode(state: ScanStateType): Promise<Partial<ScanStateType>> {
  const { chunk } = state;
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`[mapper] 📄 ${chunk.file_path} (lines ${chunk.start_line}-${chunk.end_line})`);

  try {
    const raw = await ollamaGenerate(MAPPER_SYSTEM, buildMapperPrompt(chunk.content, chunk.file_path), 200);
    const obj = extractJsonObject(raw);

    const metadata = {
      language:    typeof obj?.['language'] === 'string' ? obj['language'] : chunk.language ?? 'unknown',
      frameworks:  Array.isArray(obj?.['frameworks']) ? obj['frameworks'].map(String) : [],
      isSensitive: typeof obj?.['isSensitive'] === 'boolean' ? obj['isSensitive'] : false,
    };

    console.log(`[mapper] ✅ lang=${metadata.language}, frameworks=[${metadata.frameworks.join(',')}], sensitive=${metadata.isSensitive}`);
    return { repositoryMetadata: metadata };
  } catch (err) {
    console.error(`[mapper] ❌ Failed:`, err);
    return {
      repositoryMetadata: {
        language: chunk.language ?? 'unknown',
        frameworks: [],
        isSensitive: false,
      }
    };
  }
}

/**
 * 2. RAG Retriever Node
 */
async function retrieveNode(state: ScanStateType): Promise<Partial<ScanStateType>> {
  const { chunk } = state;
  console.log(`[rag] 🔍 Fetching rules for: ${chunk.file_path}`);

  let embedding: number[] = chunk.embedding;
  if (typeof embedding === 'string') {
    try { embedding = JSON.parse(embedding as unknown as string); }
    catch { console.warn(`[rag] ⚠️ Could not parse embedding`); return { ragContext: [] }; }
  }

  if (!Array.isArray(embedding) || embedding.length !== 384) {
    console.warn(`[rag] ⚠️ Bad embedding length=${Array.isArray(embedding) ? embedding.length : 'N/A'}`);
    return { ragContext: [] };
  }

  const isZeroVector = embedding.slice(0, 10).every(v => v === 0);
  if (isZeroVector) {
    console.warn(`[rag] ⚠️ Zero-vector embedding — embeddings not seeded or HF key missing`);
  }

  try {
    const rules = await retrieveRelevantRules(embedding);
    console.log(`[rag] ✅ ${rules.length} rules: [${rules.map(r => r.rule_id).join(', ')}]`);
    return { ragContext: rules };
  } catch (err) {
    console.error(`[rag] ❌ Retrieval failed:`, err);
    return { ragContext: [] };
  }
}

/**
 * 3. Auditor Agent Node
 * Always runs regardless of RAG results.
 */
async function auditorNode(state: ScanStateType): Promise<Partial<ScanStateType>> {
  const { chunk, ragContext, repositoryMetadata } = state;

  console.log(`[auditor] 🛡️ Auditing ${chunk.file_path} (${ragContext.length} rules, lang=${repositoryMetadata.language})`);

  const prompt = buildAuditorPrompt(
    chunk.content, chunk.file_path, chunk.start_line, ragContext, repositoryMetadata
  );

  try {
    const raw = await ollamaGenerate(AUDITOR_SYSTEM, prompt, MAX_NEW_TOKENS);

    if (!raw || (raw.trim().length <= 2 && raw.trim() !== '[]')) {
      console.warn(`[auditor] ⚠️ Model returned empty/trivial response for ${chunk.file_path}`);
      return { vulnerabilities: [] };
    }

    const findings = parseVulnerabilityBlocks(raw);

    console.log(`[auditor] ${findings.length > 0 ? '🚨' : '✅'} ${findings.length} findings for ${chunk.file_path}`);
    for (const f of findings) {
      console.log(`   → [${f.severity.toUpperCase()}] ${f.rule_id}: ${f.description.substring(0, 100)}`);
    }

    return { vulnerabilities: findings };
  } catch (err) {
    console.error(`[auditor] ❌ Failed:`, err);
    return { vulnerabilities: [] };
  }
}

/**
 * 4. Remediation Agent Node
 */
async function remediationNode(state: ScanStateType): Promise<Partial<ScanStateType>> {
  const { chunk, vulnerabilities } = state;

  if (vulnerabilities.length === 0) {
    return {};
  }

  console.log(`[remediation] 🔧 Generating fix prompt for ${vulnerabilities.length} finding(s) in ${chunk.file_path}`);

  const prompt = buildRemediationPrompt(chunk.content, chunk.file_path, vulnerabilities);
  try {
    const raw = await ollamaGenerate(REMEDIATION_SYSTEM, prompt, 512);
    const obj = extractJsonObject(raw);
    const aiPrompt = typeof obj?.['aiCoderPrompt'] === 'string' ? obj['aiCoderPrompt'] : null;
    console.log(`[remediation] ${aiPrompt ? '✅ Prompt generated' : '⚠️ Could not extract prompt'}`);
    return { finalReport: aiPrompt };
  } catch (err) {
    console.error(`[remediation] ❌ Failed:`, err);
    return {};
  }
}

// ─── Graph Compilation ────────────────────────────────────────────────────────

function buildScanGraph() {
  const workflow = new StateGraph(ScanState);

  const withNodes = workflow
    .addNode('mapperNode', mapperNode)
    .addNode('retrieveNode', retrieveNode)
    .addNode('auditorNode', auditorNode)
    .addNode('remediationNode', remediationNode);

  withNodes.addEdge(START, 'mapperNode');
  withNodes.addEdge('mapperNode', 'retrieveNode');
  withNodes.addEdge('retrieveNode', 'auditorNode');
  withNodes.addEdge('auditorNode', 'remediationNode');
  withNodes.addEdge('remediationNode', END);

  return withNodes.compile();
}

export const scanWorkflow = buildScanGraph();

export async function runScanForChunk(chunk: CodeChunk): Promise<{ findings: ScanFinding[], aiPrompt: string | null }> {
  const result = await scanWorkflow.invoke({ chunk });
  return {
    findings: result.vulnerabilities ?? [],
    aiPrompt: result.finalReport ?? null,
  };
}
