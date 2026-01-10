/**
 * Voyage AI Reranking
 *
 * Handles reranking of vector search results using Voyage AI rerank-2 model.
 * Improves ranking accuracy by using cross-encoder to understand query-document relationship.
 *
 * @see /docs/designs/orchestration/discovery/TECH_DESIGN.md
 */

import type { VoyageAIClient } from "voyageai";
import type { VectorSearchResult, RerankResult, RerankResponse } from "./types";
import {
  generateOperationId,
  calculateVoyageRerankCost,
  estimateRerankTokens,
} from "./utils";
import { getVoyageClient } from "./embeddings";

// =============================================================================
// RERANKING FUNCTIONS
// =============================================================================

/**
 * Rerank vector search candidates using Voyage AI rerank-2 model.
 * Provides more accurate relevance scoring than vector similarity alone.
 *
 * @param query - The original search query
 * @param candidates - Vector search results to rerank
 * @param topK - Number of top results to return (default 10)
 * @param client - Optional Voyage AI client (uses singleton if not provided)
 * @returns RerankResponse with reranked results and operation details
 */
export async function rerankCandidates(
  query: string,
  candidates: VectorSearchResult[],
  topK: number = 10,
  client?: VoyageAIClient
): Promise<RerankResponse> {
  const voyageClient = client ?? getVoyageClient();

  // Prepare documents for reranking (use capabilities text)
  const documents = candidates.map((c) => c.capabilities);

  const result = await voyageClient.rerank({
    query: query,
    documents: documents,
    model: "rerank-2",
    topK: Math.min(topK, candidates.length),
    returnDocuments: false, // We already have the documents
  });

  // Map rerank results back to candidates with relevance scores
  const results: RerankResult[] = result.data.map((r) => {
    const candidate = candidates[r.index];
    return {
      agent_id: candidate.agent_id,
      name: candidate.name,
      capabilities: candidate.capabilities,
      base_price: candidate.base_price,
      stats: candidate.stats,
      relevance_score: r.relevanceScore,
    };
  });

  // Calculate estimated tokens for cost tracking
  const estimatedTokens = estimateRerankTokens(query, documents);

  return {
    results,
    operation: {
      operation_id: generateOperationId(),
      timestamp: new Date(),
      operation_type: "discovery_rerank",
      model: "rerank-2",
      native_tokens_prompt: estimatedTokens,
      total_cost: calculateVoyageRerankCost(estimatedTokens),
      metadata: {
        candidates_count: candidates.length,
        top_k: topK,
        results_count: results.length,
      },
    },
  };
}

/**
 * Simple rerank without full operation tracking.
 * Returns just the reranked results for simpler use cases.
 *
 * @param query - The original search query
 * @param candidates - Vector search results to rerank
 * @param topK - Number of top results to return
 * @param client - Optional Voyage AI client
 * @returns Array of reranked results
 */
export async function simpleRerank(
  query: string,
  candidates: VectorSearchResult[],
  topK: number = 10,
  client?: VoyageAIClient
): Promise<RerankResult[]> {
  const response = await rerankCandidates(query, candidates, topK, client);
  return response.results;
}
