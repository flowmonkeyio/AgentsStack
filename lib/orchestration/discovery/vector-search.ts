/**
 * MongoDB Vector Search
 *
 * Handles vector similarity search using MongoDB Atlas Vector Search.
 *
 * @see /docs/designs/orchestration/discovery/TECH_DESIGN.md
 */

import { getAgentsCollection } from "@/lib/db";
import type { RequestContext } from "@/lib/logging";
import { createLogger } from "@/lib/logging";
import type { VectorSearchResult } from "./types";

const logger = createLogger("discovery");

// =============================================================================
// VECTOR SEARCH INDEX CONFIGURATION
// =============================================================================

/**
 * MongoDB Atlas Vector Search index name.
 * This index should be created in MongoDB Atlas with:
 * - Path: capabilities_embedding
 * - Dimensions: 1024
 * - Similarity: cosine
 */
export const VECTOR_INDEX_NAME = "agent_capabilities_vector";

/**
 * Default number of candidates to consider for better recall.
 * Higher values improve recall but increase latency.
 */
export const DEFAULT_NUM_CANDIDATES_MULTIPLIER = 3;

// =============================================================================
// VECTOR SEARCH FUNCTIONS
// =============================================================================

/**
 * Search for agents using vector similarity.
 * Uses MongoDB Atlas Vector Search on the capabilities_embedding field.
 *
 * @param ctx - Request context for tracing
 * @param queryEmbedding - 1024-dimensional embedding from Voyage AI
 * @param limit - Maximum number of results to return (default 20)
 * @returns Array of agents with vector similarity scores
 */
export async function vectorSearch(
  ctx: RequestContext,
  queryEmbedding: number[],
  limit: number = 20
): Promise<VectorSearchResult[]> {
  const collection = await getAgentsCollection();

  const startTime = Date.now();
  const results = await collection
    .aggregate([
      {
        $vectorSearch: {
          index: VECTOR_INDEX_NAME,
          path: "capabilities_embedding",
          queryVector: queryEmbedding,
          numCandidates: limit * DEFAULT_NUM_CANDIDATES_MULTIPLIER,
          limit: limit,
        },
      },
      {
        $project: {
          _id: 0,
          agent_id: 1,
          name: 1,
          capabilities: 1,
          base_price: "$pricing.base_price",
          stats: {
            avg_score: "$stats.avg_score",
            jobs_completed: "$stats.jobs_completed",
          },
          vector_score: { $meta: "vectorSearchScore" },
        },
      },
    ])
    .toArray();
  const durationMs = Date.now() - startTime;

  logger.info(ctx, `operation=vector_search results=${results.length} limit=${limit} duration_ms=${durationMs}`);

  return results as VectorSearchResult[];
}

/**
 * Search for agents with pre-filtering by price and quality.
 * Uses MongoDB Atlas Vector Search with filter.
 *
 * @param ctx - Request context for tracing
 * @param queryEmbedding - 1024-dimensional embedding from Voyage AI
 * @param maxPrice - Maximum base price filter
 * @param minScore - Minimum average score filter (default 0.80)
 * @param limit - Maximum number of results to return (default 20)
 * @returns Array of filtered agents with vector similarity scores
 */
export async function vectorSearchWithFilter(
  ctx: RequestContext,
  queryEmbedding: number[],
  maxPrice: number,
  minScore: number = 0.8,
  limit: number = 20
): Promise<VectorSearchResult[]> {
  const collection = await getAgentsCollection();

  // Build filter only if constraints are meaningful
  const hasMaxPrice = maxPrice !== Infinity && maxPrice > 0;
  const hasMinScore = minScore > 0;

  // If no filters, use simple vector search
  if (!hasMaxPrice && !hasMinScore) {
    return vectorSearch(ctx, queryEmbedding, limit);
  }

  // Build filter conditions
  const filterConditions: Record<string, unknown>[] = [];

  if (hasMaxPrice) {
    filterConditions.push({ "pricing.base_price": { $lte: maxPrice } });
  }

  if (hasMinScore) {
    filterConditions.push({ "stats.avg_score": { $gte: minScore } });
  }

  const filter =
    filterConditions.length === 1
      ? filterConditions[0]
      : { $and: filterConditions };

  const startTime = Date.now();
  const results = await collection
    .aggregate([
      {
        $vectorSearch: {
          index: VECTOR_INDEX_NAME,
          path: "capabilities_embedding",
          queryVector: queryEmbedding,
          numCandidates: 100, // Higher for filtered searches
          limit: limit,
          filter: filter,
        },
      },
      {
        $project: {
          _id: 0,
          agent_id: 1,
          name: 1,
          capabilities: 1,
          base_price: "$pricing.base_price",
          stats: {
            avg_score: "$stats.avg_score",
            jobs_completed: "$stats.jobs_completed",
          },
          vector_score: { $meta: "vectorSearchScore" },
        },
      },
    ])
    .toArray();
  const durationMs = Date.now() - startTime;

  logger.info(ctx, `operation=vector_search_filtered results=${results.length} max_price=${maxPrice} min_score=${minScore} limit=${limit} duration_ms=${durationMs}`);

  return results as VectorSearchResult[];
}

/**
 * Test if the vector search index exists and is functional.
 * Used for health checks.
 *
 * @param ctx - Request context for tracing
 * @returns true if the index is working, false otherwise
 */
export async function testVectorSearchIndex(ctx: RequestContext): Promise<boolean> {
  const collection = await getAgentsCollection();

  // Create a minimal test embedding (1024 dimensions of zeros)
  const testEmbedding = new Array(1024).fill(0);

  const startTime = Date.now();
  try {
    await collection
      .aggregate([
        {
          $vectorSearch: {
            index: VECTOR_INDEX_NAME,
            path: "capabilities_embedding",
            queryVector: testEmbedding,
            numCandidates: 3,
            limit: 1,
          },
        },
      ])
      .toArray();

    const durationMs = Date.now() - startTime;
    logger.debug(ctx, `operation=test_vector_index status=ok duration_ms=${durationMs}`);
    return true;
  } catch {
    const durationMs = Date.now() - startTime;
    logger.warn(ctx, `operation=test_vector_index status=failed duration_ms=${durationMs}`);
    return false;
  }
}
