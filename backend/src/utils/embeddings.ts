/**
 * src/utils/embeddings.ts
 * -----------------------
 * Generates text embeddings using the Hugging Face Inference API.
 * Model: sentence-transformers/all-MiniLM-L6-v2 → 384-dimensional vectors.
 *
 * Integration point for Step 3: The same HfInference client will later be
 * used to call Qwen/Qwen2.5-Coder-7B-Instruct for SAST analysis.
 */

import { HfInference } from '@huggingface/inference';

// The embedding model we use. Its output dimension MUST match the
// vector(384) column size in code_chunks and security_rules tables.
const EMBEDDING_MODEL = 'sentence-transformers/all-MiniLM-L6-v2';
const EMBEDDING_DIM = 384;

// Lazily-initialized HF client singleton.
// We do NOT initialize at module load time because TypeScript import hoisting
// means this module is evaluated before dotenv.config() runs in the caller.
let _hf: HfInference | null = null;
function getHfClient(): HfInference {
  if (!_hf) {
    _hf = new HfInference(process.env['HUGGING_FACE_API_KEY']);
  }
  return _hf;
}

/**
 * Generates a 384-dimensional embedding for the given text string.
 *
 * The featureExtraction API returns either a flat number[] or a nested
 * number[][] depending on the model version. We normalise both shapes.
 *
 * If the Hugging Face API call fails (network error, rate limit, etc.)
 * the error is re-thrown so callers can decide how to handle it.
 *
 * @param input  The raw text to embed (newlines are collapsed to spaces).
 * @returns      A number[] of length 384.
 */
export async function generateEmbedding(input: string): Promise<number[]> {
  // Collapse newlines — sentence-transformers handles them, but this
  // produces cleaner inputs and is consistent with prior behaviour.
  const cleanedInput = input.replace(/\n/g, ' ').trim();

  // If no API key and we are in development, fall back to a zero vector
  // so the rest of the ingestion pipeline can be tested without a key.
  if (!process.env['HUGGING_FACE_API_KEY']) {
    console.warn(
      `[Mock Embedding] HUGGING_FACE_API_KEY not set. ` +
      `Returning ${EMBEDDING_DIM}-dimensional zero vector for: "${cleanedInput.substring(0, 40)}…"`
    );
    return new Array(EMBEDDING_DIM).fill(0.0);
  }

  try {
    const output = await getHfClient().featureExtraction({
      model: EMBEDDING_MODEL,
      inputs: cleanedInput,
    });

    // Normalise output shape:
    //   • Some model versions return number[]   → use directly
    //   • Others return number[][] (one row per token before mean-pooling)
    //     → take the first (and only) row which is the sentence embedding
    if (Array.isArray(output) && Array.isArray(output[0])) {
      // Shape is number[][] — the sentence embedding is the first element
      const embedding = (output as number[][])[0];
      if (embedding.length !== EMBEDDING_DIM) {
        throw new Error(
          `Unexpected embedding dimension: got ${embedding.length}, expected ${EMBEDDING_DIM}. ` +
          `Ensure the model is ${EMBEDDING_MODEL}.`
        );
      }
      return embedding;
    }

    // Shape is already a flat number[]
    const embedding = output as number[];
    if (embedding.length !== EMBEDDING_DIM) {
      throw new Error(
        `Unexpected embedding dimension: got ${embedding.length}, expected ${EMBEDDING_DIM}.`
      );
    }
    return embedding;

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[embeddings] HuggingFace featureExtraction failed: ${message}`);
  }
}

/**
 * Same as generateEmbedding but with a hard 30-second timeout.
 *
 * On the free Hugging Face tier, cold-start model loading can cause requests
 * to hang for minutes. If the call doesn't resolve in 30s we return a zero
 * vector and log a warning — this lets ingestion continue instead of freezing
 * the server and causing ts-node-dev to restart and corrupt the job status.
 *
 * @param input  The raw text to embed.
 * @returns      A number[] of length 384 (zero vector on timeout).
 */
export async function generateEmbeddingWithTimeout(input: string): Promise<number[]> {
  const TIMEOUT_MS = 30_000;

  const timeoutPromise = new Promise<number[]>((resolve) => {
    setTimeout(() => {
      console.warn(
        `[embeddings] HF API timed out after ${TIMEOUT_MS / 1000}s for input: ` +
        `"${input.substring(0, 40)}…". Using zero vector to continue ingestion.`
      );
      resolve(new Array(EMBEDDING_DIM).fill(0.0));
    }, TIMEOUT_MS);
  });

  return Promise.race([generateEmbedding(input), timeoutPromise]);
}
