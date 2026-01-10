/**
 * Discovery Module - Public Exports
 *
 * Agent discovery: Voyage AI embeddings, MongoDB vector search, and reranking.
 *
 * @see /docs/designs/orchestration/discovery/TECH_DESIGN.md
 */

// =============================================================================
// TYPES
// =============================================================================

export type {
  DiscoveryService,
  DiscoveryRequest,
  DiscoveryResult,
  VectorSearchResult,
  RerankResult,
  RerankResponse,
  EmbeddingResult,
  VoyageInputType,
  HealthCheckResult,
} from "./types";

// =============================================================================
// SERVICE
// =============================================================================

export {
  DiscoveryServiceImpl,
  getDiscoveryService,
  createDiscoveryService,
  discoverAgentsWithEvents,
  discoverAgentsWithRetry,
} from "./service";

// =============================================================================
// EMBEDDINGS
// =============================================================================

export {
  embedQuery,
  embedCapabilities,
  embedBatch,
  getVoyageClient,
  createVoyageClient,
} from "./embeddings";

// =============================================================================
// VECTOR SEARCH
// =============================================================================

export {
  vectorSearch,
  vectorSearchWithFilter,
  testVectorSearchIndex,
  VECTOR_INDEX_NAME,
} from "./vector-search";

// =============================================================================
// RERANKING
// =============================================================================

export { rerankCandidates, simpleRerank } from "./rerank";

// =============================================================================
// HEALTH CHECK
// =============================================================================

export { healthCheck, quickHealthCheck } from "./health";

// =============================================================================
// EVENTS
// =============================================================================

export type { DiscoveryEvent, DiscoveryEventEmitter, EventBus } from "./events";
export { noOpEmitter, createDiscoveryEmitter } from "./events";

// =============================================================================
// UTILITIES
// =============================================================================

export {
  generateOperationId,
  sleep,
  VOYAGE_PRICING,
  calculateVoyageEmbedCost,
  calculateVoyageRerankCost,
  estimateRerankTokens,
} from "./utils";

export type { VoyageEmbedModel, VoyageRerankModel } from "./utils";
