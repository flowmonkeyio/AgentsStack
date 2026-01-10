/**
 * Discovery Service Implementation
 *
 * Main DiscoveryService that orchestrates the discovery pipeline:
 * 1. Embed query using Voyage AI
 * 2. Vector search using MongoDB Atlas
 * 3. Rerank results using Voyage AI
 *
 * @see /docs/designs/orchestration/discovery/TECH_DESIGN.md
 */

import type { VoyageAIClient } from "voyageai";
import type { RequestContext } from "@/lib/logging";
import { createLogger } from "@/lib/logging";
import type { LLMOperation } from "@/types";
import type {
  DiscoveryService,
  DiscoveryRequest,
  DiscoveryResult,
  EmbeddingResult,
  HealthCheckResult,
} from "./types";
import type { DiscoveryEventEmitter } from "./events";
import { noOpEmitter } from "./events";
import { embedQuery, embedCapabilities as embedCapabilitiesFn, getVoyageClient } from "./embeddings";
import { vectorSearchWithFilter } from "./vector-search";
import { rerankCandidates } from "./rerank";
import { healthCheck as performHealthCheck, quickHealthCheck } from "./health";
import { sleep } from "./utils";

const logger = createLogger("discovery");

// =============================================================================
// DISCOVERY SERVICE IMPLEMENTATION
// =============================================================================

/**
 * DiscoveryService implementation.
 * Handles the complete discovery pipeline with cost tracking.
 */
export class DiscoveryServiceImpl implements DiscoveryService {
  private voyageClient: VoyageAIClient;

  constructor(voyageClient?: VoyageAIClient) {
    this.voyageClient = voyageClient ?? getVoyageClient();
  }

  /**
   * Discover agents for a task.
   * Returns ranked candidates with costs for billing.
   */
  async discoverAgents(ctx: RequestContext, request: DiscoveryRequest): Promise<DiscoveryResult> {
    const startTime = Date.now();
    const operations: LLMOperation[] = [];

    logger.info(ctx, `operation=discover_agents query_length=${request.task_description.length} max_price=${request.max_price ?? "none"} limit=${request.limit ?? 10}`);

    // Step 1: Embed the query
    const embedResult = await embedQuery(ctx, request.task_description, this.voyageClient);
    operations.push(embedResult.operation);

    // Step 2: Vector search with filters
    const vectorResults = await vectorSearchWithFilter(
      ctx,
      embedResult.embedding,
      request.max_price ?? Infinity,
      request.min_quality ?? 0.8,
      (request.limit ?? 10) * 2 // Fetch more for reranking
    );

    // If no results, return early
    if (vectorResults.length === 0) {
      const totalCost = operations.reduce((sum, op) => sum + op.total_cost, 0);
      const searchTime = Date.now() - startTime;
      logger.debug(ctx, `operation=discover_complete candidates=0 total_cost=${totalCost.toFixed(6)} duration_ms=${searchTime}`);
      return {
        candidates: [],
        llm_operations: operations,
        total_cost: totalCost,
        search_time_ms: searchTime,
      };
    }

    // Step 3: Rerank
    const rerankResponse = await rerankCandidates(
      ctx,
      request.task_description,
      vectorResults,
      request.limit ?? 10,
      this.voyageClient
    );
    operations.push(rerankResponse.operation);

    const totalCost = operations.reduce((sum, op) => sum + op.total_cost, 0);
    const searchTime = Date.now() - startTime;
    logger.debug(ctx, `operation=discover_complete candidates=${rerankResponse.results.length} total_cost=${totalCost.toFixed(6)} duration_ms=${searchTime}`);

    return {
      candidates: rerankResponse.results,
      llm_operations: operations,
      total_cost: totalCost,
      search_time_ms: searchTime,
    };
  }

  /**
   * Embed agent capabilities (for registration).
   * Returns embedding vector and operation for cost tracking.
   */
  async embedCapabilities(ctx: RequestContext, capabilities: string): Promise<EmbeddingResult> {
    return embedCapabilitiesFn(ctx, capabilities, this.voyageClient);
  }

  /**
   * Quick health check for Voyage AI and MongoDB vector search.
   */
  async healthCheck(ctx: RequestContext): Promise<{ voyage: boolean; mongo_vector: boolean }> {
    return quickHealthCheck(ctx, this.voyageClient);
  }

  /**
   * Detailed health check with latency and error information.
   */
  async detailedHealthCheck(ctx: RequestContext): Promise<HealthCheckResult> {
    return performHealthCheck(ctx, this.voyageClient);
  }
}

// =============================================================================
// DISCOVERY WITH EVENTS
// =============================================================================

/**
 * Discover agents with event emission for SSE streaming.
 * Emits events at each stage of the discovery pipeline.
 *
 * @param ctx - Request context for tracing
 * @param request - Discovery request parameters
 * @param emitter - Event emitter for SSE streaming
 * @param job_id - Job ID for event correlation
 * @param voyageClient - Optional Voyage AI client
 * @returns DiscoveryResult with candidates and cost tracking
 */
export async function discoverAgentsWithEvents(
  ctx: RequestContext,
  request: DiscoveryRequest,
  emitter: DiscoveryEventEmitter = noOpEmitter,
  job_id?: string,
  voyageClient?: VoyageAIClient
): Promise<DiscoveryResult> {
  const client = voyageClient ?? getVoyageClient();
  const startTime = Date.now();
  const operations: LLMOperation[] = [];

  logger.info(ctx, `operation=discover_agents_with_events query_length=${request.task_description.length} job_id=${job_id ?? "none"}`);

  // Event: Discovery started
  if (job_id) {
    emitter.emit({
      type: "discovery:started",
      job_id,
      task: request.task_description,
      timestamp: new Date(),
    });
  }

  try {
    // Step 1: Embed the query
    const embedResult = await embedQuery(ctx, request.task_description, client);
    operations.push(embedResult.operation);

    // Event: Embedding complete
    if (job_id) {
      emitter.emit({
        type: "discovery:embedding_complete",
        job_id,
        tokens: embedResult.operation.native_tokens_prompt ?? 0,
        cost: embedResult.operation.total_cost,
        timestamp: new Date(),
      });
    }

    // Step 2: Vector search
    const vectorSearchStart = Date.now();
    const vectorResults = await vectorSearchWithFilter(
      ctx,
      embedResult.embedding,
      request.max_price ?? Infinity,
      request.min_quality ?? 0.8,
      (request.limit ?? 10) * 2 // Fetch more for reranking
    );
    const vectorSearchTime = Date.now() - vectorSearchStart;

    // Event: Vector search complete
    if (job_id) {
      emitter.emit({
        type: "discovery:vector_search_complete",
        job_id,
        candidates_count: vectorResults.length,
        search_time_ms: vectorSearchTime,
        timestamp: new Date(),
      });
    }

    // If no results, emit complete and return
    if (vectorResults.length === 0) {
      const totalCost = operations.reduce((sum, op) => sum + op.total_cost, 0);
      const totalTime = Date.now() - startTime;

      if (job_id) {
        emitter.emit({
          type: "discovery:complete",
          job_id,
          candidates_count: 0,
          total_cost: totalCost,
          total_time_ms: totalTime,
          timestamp: new Date(),
        });
      }

      logger.debug(ctx, `operation=discover_with_events_complete candidates=0 total_cost=${totalCost.toFixed(6)} duration_ms=${totalTime}`);

      return {
        candidates: [],
        llm_operations: operations,
        total_cost: totalCost,
        search_time_ms: totalTime,
      };
    }

    // Step 3: Rerank
    const rerankResponse = await rerankCandidates(
      ctx,
      request.task_description,
      vectorResults,
      request.limit ?? 10,
      client
    );
    operations.push(rerankResponse.operation);

    // Event: Rerank complete
    if (job_id) {
      emitter.emit({
        type: "discovery:rerank_complete",
        job_id,
        top_candidates: rerankResponse.results.slice(0, 3).map((r) => r.name),
        timestamp: new Date(),
      });
    }

    const totalCost = operations.reduce((sum, op) => sum + op.total_cost, 0);
    const totalTime = Date.now() - startTime;

    // Event: Discovery complete
    if (job_id) {
      emitter.emit({
        type: "discovery:complete",
        job_id,
        candidates_count: rerankResponse.results.length,
        total_cost: totalCost,
        total_time_ms: totalTime,
        timestamp: new Date(),
      });
    }

    logger.debug(ctx, `operation=discover_with_events_complete candidates=${rerankResponse.results.length} total_cost=${totalCost.toFixed(6)} duration_ms=${totalTime}`);

    return {
      candidates: rerankResponse.results,
      llm_operations: operations,
      total_cost: totalCost,
      search_time_ms: totalTime,
    };
  } catch (error) {
    // Event: Error
    if (job_id) {
      emitter.emit({
        type: "discovery:error",
        job_id,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date(),
      });
    }
    logger.error(ctx, `operation=discover_with_events_error error="${error instanceof Error ? error.message : "Unknown error"}"`);
    throw error;
  }
}

// =============================================================================
// DISCOVERY WITH RETRY
// =============================================================================

/**
 * Voyage AI error type check.
 * The VoyageAI SDK throws errors with statusCode property.
 */
interface VoyageError extends Error {
  statusCode?: number;
}

function isVoyageError(error: unknown): error is VoyageError {
  return error instanceof Error && "statusCode" in error;
}

/**
 * Discover agents with retry logic for transient failures.
 * Implements exponential backoff for rate limiting and server errors.
 *
 * @param ctx - Request context for tracing
 * @param request - Discovery request parameters
 * @param maxRetries - Maximum number of retry attempts (default 3)
 * @param voyageClient - Optional Voyage AI client
 * @returns DiscoveryResult with candidates and cost tracking
 */
export async function discoverAgentsWithRetry(
  ctx: RequestContext,
  request: DiscoveryRequest,
  maxRetries: number = 3,
  voyageClient?: VoyageAIClient
): Promise<DiscoveryResult> {
  const service = new DiscoveryServiceImpl(voyageClient);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await service.discoverAgents(ctx, request);
    } catch (err) {
      if (isVoyageError(err)) {
        if (err.statusCode === 429) {
          // Rate limited - exponential backoff
          const delay = Math.pow(2, attempt) * 1000;
          logger.warn(ctx, `operation=discover_retry status=rate_limited attempt=${attempt} delay_ms=${delay}`);
          await sleep(delay);
          continue;
        }
        if (err.statusCode !== undefined && err.statusCode >= 500) {
          // Server error - retry
          logger.warn(ctx, `operation=discover_retry status=server_error attempt=${attempt} max_retries=${maxRetries}`);
          await sleep(1000 * attempt);
          continue;
        }
      }
      throw err; // Don't retry client errors
    }
  }

  logger.error(ctx, `operation=discover_retry status=failed max_retries=${maxRetries}`);
  throw new Error(`Discovery failed after ${maxRetries} attempts`);
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let discoveryServiceInstance: DiscoveryServiceImpl | null = null;

/**
 * Get the singleton DiscoveryService instance.
 */
export function getDiscoveryService(): DiscoveryServiceImpl {
  if (!discoveryServiceInstance) {
    discoveryServiceInstance = new DiscoveryServiceImpl();
  }
  return discoveryServiceInstance;
}

/**
 * Create a new DiscoveryService instance.
 * Useful for testing or when a fresh instance is needed.
 */
export function createDiscoveryService(
  voyageClient?: VoyageAIClient
): DiscoveryServiceImpl {
  return new DiscoveryServiceImpl(voyageClient);
}
