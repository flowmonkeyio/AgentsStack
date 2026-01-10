/**
 * Health Check Implementation
 *
 * Health checks for Voyage AI and MongoDB vector search.
 *
 * @see /docs/designs/orchestration/discovery/TECH_DESIGN.md
 */

import type { VoyageAIClient } from "voyageai";
import type { RequestContext } from "@/lib/logging";
import { createLogger } from "@/lib/logging";
import type { HealthCheckResult } from "./types";
import { getVoyageClient } from "./embeddings";
import { testVectorSearchIndex } from "./vector-search";

const logger = createLogger("discovery");

// =============================================================================
// HEALTH CHECK FUNCTIONS
// =============================================================================

/**
 * Performs detailed health check on Voyage AI and MongoDB vector search.
 * Includes latency measurements and error details.
 *
 * @param ctx - Request context for tracing
 * @param voyageClient - Optional Voyage AI client (uses singleton if not provided)
 * @returns HealthCheckResult with status and details
 */
export async function healthCheck(
  ctx: RequestContext,
  voyageClient?: VoyageAIClient
): Promise<HealthCheckResult> {
  const client = voyageClient ?? getVoyageClient();

  const result: HealthCheckResult = {
    voyage: false,
    mongo_vector: false,
    details: {},
  };

  // Check Voyage AI
  const voyageStart = Date.now();
  try {
    await client.embed({
      input: ["health check"],
      model: "voyage-3",
    });
    result.voyage = true;
    result.details!.voyage_latency_ms = Date.now() - voyageStart;
  } catch (error) {
    result.voyage = false;
    result.details!.voyage_error =
      error instanceof Error ? error.message : "Unknown error";
  }

  // Check MongoDB Vector Search
  const mongoStart = Date.now();
  try {
    const indexWorking = await testVectorSearchIndex(ctx);
    result.mongo_vector = indexWorking;
    result.details!.mongo_latency_ms = Date.now() - mongoStart;

    if (!indexWorking) {
      result.details!.mongo_error =
        "Vector search index test failed - index may not exist or be configured incorrectly";
    }
  } catch (error) {
    result.mongo_vector = false;
    result.details!.mongo_error =
      error instanceof Error ? error.message : "Unknown error";
  }

  logger.info(ctx, `operation=health_check voyage=${result.voyage} mongo_vector=${result.mongo_vector}`);

  return result;
}

/**
 * Simplified health check that returns just boolean status.
 * Use for quick liveness checks.
 *
 * @param ctx - Request context for tracing
 * @param voyageClient - Optional Voyage AI client (uses singleton if not provided)
 * @returns Object with voyage and mongo_vector boolean status
 */
export async function quickHealthCheck(
  ctx: RequestContext,
  voyageClient?: VoyageAIClient
): Promise<{ voyage: boolean; mongo_vector: boolean }> {
  const result = await healthCheck(ctx, voyageClient);
  return {
    voyage: result.voyage,
    mongo_vector: result.mongo_vector,
  };
}
