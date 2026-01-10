/**
 * Voyage AI Embedding Functions
 *
 * Handles query and document embedding using Voyage AI voyage-3 model.
 *
 * @see /docs/designs/orchestration/discovery/TECH_DESIGN.md
 */

import { VoyageAIClient } from "voyageai";
import type { EmbeddingResult, VoyageInputType } from "./types";
import { generateOperationId, calculateVoyageEmbedCost } from "./utils";

// =============================================================================
// VOYAGE AI CLIENT
// =============================================================================

/**
 * Create a Voyage AI client with default configuration.
 * Reads API key from VOYAGE_API_KEY environment variable.
 */
export function createVoyageClient(): VoyageAIClient {
  const apiKey = process.env.VOYAGE_API_KEY;

  if (!apiKey) {
    throw new Error("VOYAGE_API_KEY environment variable is not defined");
  }

  return new VoyageAIClient({
    apiKey,
  });
}

// Singleton client instance
let voyageClientInstance: VoyageAIClient | null = null;

/**
 * Get the singleton Voyage AI client instance.
 */
export function getVoyageClient(): VoyageAIClient {
  if (!voyageClientInstance) {
    voyageClientInstance = createVoyageClient();
  }
  return voyageClientInstance;
}

// =============================================================================
// EMBEDDING FUNCTIONS
// =============================================================================

/**
 * Embed a query for search.
 * Uses inputType="query" which is optimized for retrieval.
 *
 * @param query - The search query to embed
 * @param client - Optional Voyage AI client (uses singleton if not provided)
 * @returns EmbeddingResult with 1024-dimensional vector and operation details
 */
export async function embedQuery(
  query: string,
  client?: VoyageAIClient
): Promise<EmbeddingResult> {
  return embedText(query, "query", client);
}

/**
 * Embed agent capabilities for storage.
 * Uses inputType="document" which is optimized for stored content.
 *
 * @param capabilities - The agent capabilities text to embed
 * @param client - Optional Voyage AI client (uses singleton if not provided)
 * @returns EmbeddingResult with 1024-dimensional vector and operation details
 */
export async function embedCapabilities(
  capabilities: string,
  client?: VoyageAIClient
): Promise<EmbeddingResult> {
  return embedText(capabilities, "document", client);
}

/**
 * Internal function to embed text with specified input type.
 *
 * @param text - The text to embed
 * @param inputType - "query" for search queries, "document" for stored content
 * @param client - Optional Voyage AI client
 * @returns EmbeddingResult with embedding vector and operation details
 */
async function embedText(
  text: string,
  inputType: VoyageInputType,
  client?: VoyageAIClient
): Promise<EmbeddingResult> {
  const voyageClient = client ?? getVoyageClient();

  const result = await voyageClient.embed({
    input: [text],
    model: "voyage-3",
    inputType: inputType,
  });

  // Extract the embedding from the first (and only) result
  const embedding = result.data[0].embedding;
  const totalTokens = result.usage?.totalTokens ?? 0;

  return {
    embedding,
    operation: {
      operation_id: generateOperationId(),
      timestamp: new Date(),
      operation_type: "discovery_embed",
      model: "voyage-3",
      native_tokens_prompt: totalTokens,
      total_cost: calculateVoyageEmbedCost(totalTokens),
      metadata: {
        input_type: inputType,
        text_length: text.length,
        embedding_dimensions: 1024,
      },
    },
  };
}

/**
 * Batch embed multiple texts.
 * Useful for embedding multiple agent capabilities at once.
 *
 * @param texts - Array of texts to embed
 * @param inputType - "query" for search queries, "document" for stored content
 * @param client - Optional Voyage AI client
 * @returns Array of embeddings with a single combined operation
 */
export async function embedBatch(
  texts: string[],
  inputType: VoyageInputType,
  client?: VoyageAIClient
): Promise<{ embeddings: number[][]; operation: EmbeddingResult["operation"] }> {
  const voyageClient = client ?? getVoyageClient();

  const result = await voyageClient.embed({
    input: texts,
    model: "voyage-3",
    inputType: inputType,
  });

  const embeddings = result.data.map((item) => item.embedding);
  const totalTokens = result.usage?.totalTokens ?? 0;

  return {
    embeddings,
    operation: {
      operation_id: generateOperationId(),
      timestamp: new Date(),
      operation_type: "discovery_embed",
      model: "voyage-3",
      native_tokens_prompt: totalTokens,
      total_cost: calculateVoyageEmbedCost(totalTokens),
      metadata: {
        input_type: inputType,
        batch_size: texts.length,
        total_text_length: texts.reduce((sum, t) => sum + t.length, 0),
        embedding_dimensions: 1024,
      },
    },
  };
}
