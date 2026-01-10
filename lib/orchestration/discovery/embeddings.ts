/**
 * Voyage AI Embedding Functions
 *
 * Handles query and document embedding using Voyage AI voyage-3 model.
 *
 * @see /docs/designs/orchestration/discovery/TECH_DESIGN.md
 */

import { VoyageAIClient } from "voyageai";
import type { RequestContext } from "@/lib/logging";
import { createLogger } from "@/lib/logging";
import type { EmbeddingResult, VoyageInputType } from "./types";
import { generateOperationId, calculateVoyageEmbedCost } from "./utils";

const logger = createLogger("discovery");

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
 * @param ctx - Request context for tracing
 * @param query - The search query to embed
 * @param client - Optional Voyage AI client (uses singleton if not provided)
 * @returns EmbeddingResult with 1024-dimensional vector and operation details
 */
export async function embedQuery(
  ctx: RequestContext,
  query: string,
  client?: VoyageAIClient
): Promise<EmbeddingResult> {
  return embedText(ctx, query, "query", client);
}

/**
 * Embed agent capabilities for storage.
 * Uses inputType="document" which is optimized for stored content.
 *
 * @param ctx - Request context for tracing
 * @param capabilities - The agent capabilities text to embed
 * @param client - Optional Voyage AI client (uses singleton if not provided)
 * @returns EmbeddingResult with 1024-dimensional vector and operation details
 */
export async function embedCapabilities(
  ctx: RequestContext,
  capabilities: string,
  client?: VoyageAIClient
): Promise<EmbeddingResult> {
  return embedText(ctx, capabilities, "document", client);
}

/**
 * Internal function to embed text with specified input type.
 *
 * @param ctx - Request context for tracing
 * @param text - The text to embed
 * @param inputType - "query" for search queries, "document" for stored content
 * @param client - Optional Voyage AI client
 * @returns EmbeddingResult with embedding vector and operation details
 */
async function embedText(
  ctx: RequestContext,
  text: string,
  inputType: VoyageInputType,
  client?: VoyageAIClient
): Promise<EmbeddingResult> {
  const voyageClient = client ?? getVoyageClient();

  const startTime = Date.now();
  const result = await voyageClient.embed({
    input: [text],
    model: "voyage-3",
    inputType: inputType,
  });

  // Extract the embedding from the first (and only) result
  if (!result.data || result.data.length === 0) {
    throw new Error("Voyage AI returned no embeddings");
  }
  const firstResult = result.data[0];
  if (!firstResult.embedding) {
    throw new Error("Voyage AI returned no embedding vector");
  }
  const embedding = firstResult.embedding;
  const totalTokens = result.usage?.totalTokens ?? 0;
  const durationMs = Date.now() - startTime;

  logger.info(ctx, `operation=embed_${inputType} model=voyage-3 tokens=${totalTokens} duration_ms=${durationMs}`);

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
 * @param ctx - Request context for tracing
 * @param texts - Array of texts to embed
 * @param inputType - "query" for search queries, "document" for stored content
 * @param client - Optional Voyage AI client
 * @returns Array of embeddings with a single combined operation
 */
export async function embedBatch(
  ctx: RequestContext,
  texts: string[],
  inputType: VoyageInputType,
  client?: VoyageAIClient
): Promise<{ embeddings: number[][]; operation: EmbeddingResult["operation"] }> {
  const voyageClient = client ?? getVoyageClient();

  const startTime = Date.now();
  const result = await voyageClient.embed({
    input: texts,
    model: "voyage-3",
    inputType: inputType,
  });

  if (!result.data || result.data.length === 0) {
    throw new Error("Voyage AI returned no embeddings");
  }
  const embeddings = result.data.map((item) => {
    if (!item.embedding) {
      throw new Error("Voyage AI returned missing embedding in batch");
    }
    return item.embedding;
  });
  const totalTokens = result.usage?.totalTokens ?? 0;
  const durationMs = Date.now() - startTime;

  logger.info(ctx, `operation=embed_batch model=voyage-3 batch_size=${texts.length} tokens=${totalTokens} duration_ms=${durationMs}`);

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
