/**
 * Discovery Module Utility Functions
 *
 * Utilities for operation ID generation and Voyage AI cost calculations.
 *
 * @see /docs/designs/orchestration/discovery/TECH_DESIGN.md
 */

import { randomUUID } from "crypto";

// =============================================================================
// OPERATION ID GENERATION
// =============================================================================

/**
 * Generates a unique operation ID for cost tracking.
 * Format: op_{uuid} - matches pattern used across all orchestration modules.
 *
 * @returns Unique operation ID string
 */
export function generateOperationId(): string {
  return `op_${randomUUID()}`;
}

// =============================================================================
// SLEEP UTILITY
// =============================================================================

/**
 * Sleep utility for retry backoff.
 *
 * @param ms - Milliseconds to sleep
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// VOYAGE AI PRICING
// =============================================================================

/**
 * Voyage AI pricing (as of January 2025)
 * Reference: https://docs.voyageai.com/pricing/
 */
export const VOYAGE_PRICING = {
  // Embedding models
  "voyage-3": {
    per_million_tokens: 0.06, // $0.06 per 1M tokens
    dimensions: 1024,
  },
  "voyage-3-lite": {
    per_million_tokens: 0.02, // $0.02 per 1M tokens
    dimensions: 512,
  },
  // Reranking models
  "rerank-2": {
    per_million_tokens: 0.05, // $0.05 per 1M tokens
  },
  "rerank-2-lite": {
    per_million_tokens: 0.02, // $0.02 per 1M tokens
  },
} as const;

export type VoyageEmbedModel = "voyage-3" | "voyage-3-lite";
export type VoyageRerankModel = "rerank-2" | "rerank-2-lite";

// =============================================================================
// COST CALCULATION
// =============================================================================

/**
 * Calculate cost for Voyage AI embedding operation.
 *
 * @param tokens - Number of tokens processed
 * @param model - Voyage embedding model used
 * @returns Cost in USD
 */
export function calculateVoyageEmbedCost(
  tokens: number,
  model: VoyageEmbedModel = "voyage-3"
): number {
  const pricing = VOYAGE_PRICING[model];
  return (tokens / 1_000_000) * pricing.per_million_tokens;
}

/**
 * Calculate cost for Voyage AI reranking operation.
 *
 * @param tokens - Number of tokens processed
 * @param model - Voyage reranking model used
 * @returns Cost in USD
 */
export function calculateVoyageRerankCost(
  tokens: number,
  model: VoyageRerankModel = "rerank-2"
): number {
  const pricing = VOYAGE_PRICING[model];
  return (tokens / 1_000_000) * pricing.per_million_tokens;
}

/**
 * Estimate tokens for reranking (query + each document).
 * Conservative estimate: ~4 chars per token.
 *
 * @param query - Search query string
 * @param documents - Array of document strings to rerank
 * @returns Estimated token count
 */
export function estimateRerankTokens(query: string, documents: string[]): number {
  const queryTokens = Math.ceil(query.length / 4);
  const docTokens = documents.reduce((sum, doc) => sum + Math.ceil(doc.length / 4), 0);
  return queryTokens + docTokens;
}
