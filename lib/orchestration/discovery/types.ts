/**
 * Discovery Module Type Definitions
 *
 * Types for agent discovery: Voyage AI embeddings, MongoDB vector search, and reranking.
 *
 * @see /docs/designs/orchestration/discovery/TECH_DESIGN.md
 */

import type { LLMOperation } from "@/types";

// =============================================================================
// REQUEST/RESPONSE TYPES
// =============================================================================

/**
 * Request parameters for agent discovery.
 */
export interface DiscoveryRequest {
  /** What the task needs - used to find semantically similar agent capabilities */
  task_description: string;
  /** Budget constraint - filters agents by base_price */
  max_price?: number;
  /** Quality threshold (default 0.80) - filters agents by stats.avg_score */
  min_quality?: number;
  /** How many candidates to return (default 10) */
  limit?: number;
}

/**
 * Result of vector search (before reranking).
 */
export interface VectorSearchResult {
  agent_id: string;
  name: string;
  capabilities: string;
  base_price: number;
  stats: {
    avg_score: number;
    jobs_completed: number;
  };
  /** Cosine similarity score from MongoDB vector search (0-1) */
  vector_score: number;
}

/**
 * Result after reranking with Voyage AI.
 */
export interface RerankResult {
  agent_id: string;
  name: string;
  capabilities: string;
  base_price: number;
  stats: {
    avg_score: number;
    jobs_completed: number;
  };
  /** Relevance score from Voyage AI reranker (0-1) */
  relevance_score: number;
}

/**
 * Response from reranking operation.
 */
export interface RerankResponse {
  results: RerankResult[];
  /** Full operation for cost tracking */
  operation: LLMOperation;
}

/**
 * Complete result of agent discovery.
 */
export interface DiscoveryResult {
  /** Ranked agent candidates with relevance scores */
  candidates: RerankResult[];
  /** All operations for cost tracking */
  llm_operations: LLMOperation[];
  /** Sum of all operation costs */
  total_cost: number;
  /** Total discovery time in milliseconds */
  search_time_ms: number;
}

// =============================================================================
// EMBEDDING TYPES
// =============================================================================

/**
 * Result of embedding a query or document.
 */
export interface EmbeddingResult {
  /** 1024-dimensional vector from Voyage AI voyage-3 model */
  embedding: number[];
  /** Full operation for cost tracking */
  operation: LLMOperation;
}

/**
 * Input type for Voyage AI embeddings.
 * - "query": Use for search queries (optimized for retrieval)
 * - "document": Use for stored content (agent capabilities)
 */
export type VoyageInputType = "query" | "document";

// =============================================================================
// DISCOVERY SERVICE INTERFACE
// =============================================================================

/**
 * Main discovery service interface.
 * Used by the Planning Agent to find suitable agents for tasks.
 */
export interface DiscoveryService {
  /**
   * Discover agents for a task.
   * Returns ranked candidates with costs for billing.
   */
  discoverAgents(request: DiscoveryRequest): Promise<DiscoveryResult>;

  /**
   * Embed agent capabilities (for registration).
   * Returns embedding vector and operation for cost tracking.
   */
  embedCapabilities(capabilities: string): Promise<EmbeddingResult>;

  /**
   * Health check for Voyage AI and MongoDB vector search.
   */
  healthCheck(): Promise<{ voyage: boolean; mongo_vector: boolean }>;
}

// =============================================================================
// HEALTH CHECK TYPES
// =============================================================================

/**
 * Detailed health check response.
 */
export interface HealthCheckResult {
  /** Whether Voyage AI is reachable and responding */
  voyage: boolean;
  /** Whether MongoDB vector search index is functional */
  mongo_vector: boolean;
  /** Optional latency and error details */
  details?: {
    voyage_latency_ms?: number;
    mongo_latency_ms?: number;
    voyage_error?: string;
    mongo_error?: string;
  };
}
