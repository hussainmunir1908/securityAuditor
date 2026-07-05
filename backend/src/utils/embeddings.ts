/**
 * src/utils/embeddings.ts
 * -----------------------
 * Helper utility to interact with the OpenAI API for generating embeddings.
 */

import OpenAI from 'openai';
import { env } from '../config/env';

// Initialize the OpenAI client singleton, but only if the key exists
export const openai = env.OPENAI_API_KEY ? new OpenAI({
  apiKey: env.OPENAI_API_KEY,
}) : null;

/**
 * Generates an embedding for a given input string using text-embedding-3-small.
 * If no OpenAI key is provided, returns a mock embedding of 1536 zeros.
 * 
 * @param input The text to embed.
 * @returns An array of 1536 floating-point numbers representing the embedding.
 */
export async function generateEmbedding(input: string): Promise<number[]> {
  // Mock embedding fallback if no key is configured
  if (!openai) {
    console.log('[Mock Embedding] Generating 1536-dimensional zero vector for:', input.substring(0, 30) + '...');
    return new Array(1536).fill(0.0);
  }

  // text-embedding-3-small generates 1536-dimensional embeddings by default
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: input.replace(/\n/g, ' '), // Replace newlines with spaces for better embedding results
  });

  return response.data[0].embedding;
}
