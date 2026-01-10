# ORCH_DISCOVERY

Agent discovery: Voyage AI embeddings, MongoDB vector search, and reranking.

---

## File Structure

```
lib/orchestration/discovery/
├── index.ts           # Public exports (DiscoveryService)
├── service.ts         # Main DiscoveryService implementation
├── embeddings.ts      # Voyage AI embedding functions
├── rerank.ts          # Voyage AI reranking functions
├── vector-search.ts   # MongoDB vector search queries
├── health.ts          # Health check implementation
├── events.ts          # Event emission for discovery operations
├── utils.ts           # Utilities (generateOperationId, cost calculations)
└── types.ts           # Type definitions (DiscoveryRequest, etc.)
```

---

## Scope

**Owns:**
- Agent capability embedding (Voyage AI)
- Query embedding for semantic search
- MongoDB Atlas Vector Search queries
- Reranking of search results (Voyage AI)
- Candidate preparation for Planning Agent

**Does NOT own:**
- Agent selection decision (that's Planning Agent in ORCH_GRAPH)
- Agent storage schema (that's DATA)
- Agent registration (that's EXTERNAL_AGENTS)

---

## Development Phase

This module can be developed independently once DATA module provides the `agents` collection with `capabilities_embedding` field.

**Prerequisites:**
- DATA: `agents` collection with vector index
- Voyage AI API key configured

**Delivers:**
- `DiscoveryService` that returns ranked agent candidates

---

## Utility Functions

### lib/orchestration/discovery/utils.ts

```typescript
import { randomUUID } from 'crypto';

/**
 * Generates a unique operation ID for cost tracking.
 * Format: op_{uuid} - matches pattern used across all orchestration modules.
 *
 * @returns Unique operation ID string
 */
export function generateOperationId(): string {
  return `op_${randomUUID()}`;
}

/**
 * Sleep utility for retry backoff.
 *
 * @param ms - Milliseconds to sleep
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Voyage AI pricing (as of January 2025)
// Reference: https://docs.voyageai.com/pricing/
export const VOYAGE_PRICING = {
  // Embedding models
  "voyage-3": {
    per_million_tokens: 0.06,    // $0.06 per 1M tokens
    dimensions: 1024
  },
  "voyage-3-lite": {
    per_million_tokens: 0.02,    // $0.02 per 1M tokens
    dimensions: 512
  },
  // Reranking models
  "rerank-2": {
    per_million_tokens: 0.05,    // $0.05 per 1M tokens
  },
  "rerank-2-lite": {
    per_million_tokens: 0.02,    // $0.02 per 1M tokens
  }
} as const;

export type VoyageEmbedModel = "voyage-3" | "voyage-3-lite";
export type VoyageRerankModel = "rerank-2" | "rerank-2-lite";

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
```

---

## Voyage AI Pricing

Cost tracking for discovery operations using Voyage AI.

### Pricing Constants

Pricing constants and cost calculation helpers are defined in `lib/orchestration/discovery/utils.ts` (see Utility Functions section above).

```typescript
// Import from utils.ts
import {
  VOYAGE_PRICING,
  calculateVoyageEmbedCost,
  calculateVoyageRerankCost,
  estimateRerankTokens,
  generateOperationId
} from './utils';
```

### Cost Examples

| Operation | Typical Tokens | Cost |
|-----------|---------------|------|
| Embed query (~20 words) | ~30 | $0.0000018 |
| Embed agent capabilities (~50 words) | ~70 | $0.0000042 |
| Rerank 20 candidates | ~2000 | $0.0001 |
| Full discovery (embed + rerank) | ~2030 | ~$0.0001 |

**Note**: Discovery costs are minimal (~$0.0001 per discovery). At 1000 discoveries, total cost is ~$0.10.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  AGENT DISCOVERY PIPELINE                                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Planning Agent needs: "content strategist for marketing"                   │
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  STEP 1: EMBED QUERY                                                    ││
│  │  Voyage AI (voyage-3 model)                                             ││
│  │  "content strategist for marketing" → [0.12, -0.34, 0.56, ...]         ││
│  │  (1024 dimensions)                                                      ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  STEP 2: VECTOR SEARCH                                                  ││
│  │  MongoDB Atlas Vector Search                                            ││
│  │  Find agents with similar capability embeddings                         ││
│  │  Returns: 20-50 candidates                                              ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  STEP 3: RERANK                                                         ││
│  │  Voyage AI (rerank-2 model)                                             ││
│  │  Reorder candidates by relevance to query                               ││
│  │  Returns: top 10 with relevance scores                                  ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│       │                                                                      │
│       ▼                                                                      │
│  Planning Agent receives: ranked candidates with scores                     │
│  Planning Agent decides: which one to pick (see ORCH_GRAPH)                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Step 1: Query Embedding

### Voyage AI Client Setup

```typescript
import { VoyageAIClient } from "voyageai";

const voyage = new VoyageAIClient({
  apiKey: process.env.VOYAGE_API_KEY,
  maxRetries: 3,
  timeoutInSeconds: 30
});
```

### Embedding Function

```typescript
import { generateOperationId, calculateVoyageEmbedCost } from './utils';
import type { LLMOperation } from '@/types';

interface EmbeddingResult {
  embedding: number[];
  operation: LLMOperation;  // Full operation for cost tracking
}

async function embedQuery(query: string): Promise<EmbeddingResult> {
  const result = await voyage.embed({
    input: [query],
    model: "voyage-3",
    inputType: "query"  // CRITICAL: use "query" for search queries
  });

  return {
    embedding: result.data[0].embedding,
    operation: {
      operation_id: generateOperationId(),
      timestamp: new Date(),
      operation_type: "discovery_embed",
      model: "voyage-3",
      native_tokens_prompt: result.usage.totalTokens,
      total_cost: calculateVoyageEmbedCost(result.usage.totalTokens),
      metadata: {
        query_length: query.length,
        embedding_dimensions: 1024
      }
    }
  };
}
```

### Input Types

```typescript
// IMPORTANT: Voyage AI uses different input types for optimal retrieval

// For indexing agent capabilities (done once when agent registers)
const docEmbedding = await voyage.embed({
  input: [agent.capabilities],
  model: "voyage-3",
  inputType: "document"  // Use "document" for stored content
});

// For searching (done per query)
const queryEmbedding = await voyage.embed({
  input: [searchQuery],
  model: "voyage-3",
  inputType: "query"     // Use "query" for search queries
});
```

---

## Step 2: MongoDB Vector Search

### Vector Index Definition

```javascript
// Create index in MongoDB Atlas (via Atlas UI or API)
{
  "name": "agent_capabilities_vector",
  "type": "vectorSearch",
  "definition": {
    "fields": [
      {
        "type": "vector",
        "path": "capabilities_embedding",
        "numDimensions": 1024,
        "similarity": "cosine"
      }
    ]
  }
}
```

### Vector Search Query

```typescript
interface VectorSearchResult {
  agent_id: string;
  name: string;
  capabilities: string;
  base_price: number;
  stats: {
    avg_score: number;
    jobs_completed: number;
  };
  vector_score: number;
}

async function vectorSearch(
  queryEmbedding: number[],
  limit: number = 20
): Promise<VectorSearchResult[]> {
  const results = await db.agents.aggregate([
    {
      $vectorSearch: {
        index: "agent_capabilities_vector",
        path: "capabilities_embedding",
        queryVector: queryEmbedding,
        numCandidates: limit * 3,  // Over-fetch for better recall
        limit: limit
      }
    },
    {
      $project: {
        agent_id: 1,
        name: 1,
        capabilities: 1,
        base_price: 1,
        stats: 1,
        vector_score: { $meta: "vectorSearchScore" }
      }
    }
  ]).toArray();

  return results;
}
```

### Filtering by Attributes

```typescript
// Vector search with pre-filter (e.g., only agents under budget)
async function vectorSearchWithFilter(
  queryEmbedding: number[],
  maxPrice: number,
  minScore: number = 0.80
): Promise<VectorSearchResult[]> {
  return db.agents.aggregate([
    {
      $vectorSearch: {
        index: "agent_capabilities_vector",
        path: "capabilities_embedding",
        queryVector: queryEmbedding,
        numCandidates: 100,
        limit: 20,
        filter: {
          $and: [
            { base_price: { $lte: maxPrice } },
            { "stats.avg_score": { $gte: minScore } }
          ]
        }
      }
    },
    {
      $project: {
        agent_id: 1,
        name: 1,
        capabilities: 1,
        base_price: 1,
        stats: 1,
        vector_score: { $meta: "vectorSearchScore" }
      }
    }
  ]).toArray();
}
```

---

## Step 3: Reranking

### Why Rerank?

```
Vector search is good but not perfect:
├── Fast: handles millions of agents
├── Approximate: may miss subtle relevance
└── No context: doesn't understand task nuance

Reranking fixes this:
├── Slower but more accurate
├── Cross-encoder understands query-document relationship
└── Applied to top-N candidates only (fast enough)
```

### Rerank Function

```typescript
interface RerankResult {
  agent_id: string;
  name: string;
  capabilities: string;
  base_price: number;
  stats: {
    avg_score: number;
    jobs_completed: number;
  };
  relevance_score: number;  // From reranker (0-1)
}

interface RerankResponse {
  results: RerankResult[];
  operation: LLMOperation;  // Full operation for cost tracking
}

async function rerankCandidates(
  query: string,
  candidates: VectorSearchResult[],
  topK: number = 10
): Promise<RerankResponse> {
  // Prepare documents for reranking
  const documents = candidates.map(c => c.capabilities);

  const result = await voyage.rerank({
    query: query,
    documents: documents,
    model: "rerank-2",
    topK: topK,
    returnDocuments: false  // We already have them
  });

  // Map rerank results back to candidates
  const results = result.data.map(r => ({
    ...candidates[r.index],
    relevance_score: r.relevanceScore
  }));

  // Calculate tokens used (query + all documents)
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
        results_count: results.length
      }
    }
  };
}

// Estimate tokens for reranking (query + each document)
function estimateRerankTokens(query: string, documents: string[]): number {
  // Rough estimate: ~4 chars per token (conservative)
  const queryTokens = Math.ceil(query.length / 4);
  const docTokens = documents.reduce((sum, doc) => sum + Math.ceil(doc.length / 4), 0);
  return queryTokens + docTokens;
}
```

---

## Complete Discovery Flow

```typescript
interface DiscoveryRequest {
  task_description: string;  // What the task needs
  max_price?: number;        // Budget constraint
  min_quality?: number;      // Quality threshold (default 0.80)
  limit?: number;            // How many candidates (default 10)
}

interface DiscoveryResult {
  candidates: RerankResult[];
  llm_operations: LLMOperation[];  // All operations for cost tracking
  total_cost: number;              // Sum of all operation costs
  search_time_ms: number;
}

async function discoverAgents(
  request: DiscoveryRequest
): Promise<DiscoveryResult> {
  const startTime = Date.now();
  const operations: LLMOperation[] = [];

  // Step 1: Embed the query
  const embedResult = await embedQuery(request.task_description);
  operations.push(embedResult.operation);

  // Step 2: Vector search (no cost - MongoDB is free for this)
  const vectorResults = await vectorSearchWithFilter(
    embedResult.embedding,
    request.max_price || Infinity,
    request.min_quality || 0.80
  );

  if (vectorResults.length === 0) {
    return {
      candidates: [],
      llm_operations: operations,
      total_cost: operations.reduce((sum, op) => sum + op.total_cost, 0),
      search_time_ms: Date.now() - startTime
    };
  }

  // Step 3: Rerank
  const rerankResponse = await rerankCandidates(
    request.task_description,
    vectorResults,
    request.limit || 10
  );
  operations.push(rerankResponse.operation);

  return {
    candidates: rerankResponse.results,
    llm_operations: operations,
    total_cost: operations.reduce((sum, op) => sum + op.total_cost, 0),
    search_time_ms: Date.now() - startTime
  };
}
```

---

## Integration with Planning Agent

```typescript
// In Planning Agent (ORCH_GRAPH)

async function planningAgentNode(state: GraphState): Promise<Partial<GraphState>> {
  // Collect all discovery operations for cost tracking
  const allDiscoveryOperations: LLMOperation[] = [];

  // For each action item, discover suitable agents
  const actionItemsWithAgents = await Promise.all(
    state.draft_action_items.map(async (item) => {
      // Discover agents for this task
      const discovery = await discoverAgents({
        task_description: item.item,
        max_price: state.budget / state.draft_action_items.length,
        min_quality: 0.80,
        limit: 10
      });

      // Collect operations for cost tracking
      allDiscoveryOperations.push(...discovery.llm_operations);

      // Select best agent (see ORCH_GRAPH for selection algorithm)
      const selected = selectBestAgent(
        discovery.candidates,
        item,
        state.budget
      );

      return {
        ...item,
        agent_id: selected.agent_id,
        agent_candidates: discovery.candidates  // For audit trail
      };
    })
  );

  // Add discovery operations to graph state for cost tracking
  return {
    plan: {
      action_items: actionItemsWithAgents,
      // ...
    },
    // Append discovery operations to existing token_usage
    token_usage: [
      ...state.token_usage,
      ...allDiscoveryOperations
    ]
  };
}
```

---

## Agent Registration (Embedding Capabilities)

When an agent registers, embed their capabilities for future discovery.

```typescript
async function registerAgent(agent: NewAgent): Promise<void> {
  // Embed capabilities for vector search
  const embedding = await voyage.embed({
    input: [agent.capabilities],
    model: "voyage-3",
    inputType: "document"  // IMPORTANT: use "document" for stored content
  });

  await db.agents.insertOne({
    agent_id: generateAgentId(),
    name: agent.name,
    capabilities: agent.capabilities,
    capabilities_embedding: embedding.data[0].embedding,
    endpoint: agent.endpoint,
    base_price: agent.base_price,
    wallet_address: agent.wallet_address,
    stats: {
      avg_score: 0,
      jobs_completed: 0,
      avg_response_time_ms: 0
    },
    status: "active",
    created_at: new Date()
  });
}
```

---

## Error Handling

```typescript
import { VoyageAIError } from "voyageai";

async function discoverAgentsWithRetry(
  request: DiscoveryRequest,
  maxRetries: number = 3
): Promise<DiscoveryResult> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await discoverAgents(request);
    } catch (err) {
      if (err instanceof VoyageAIError) {
        if (err.statusCode === 429) {
          // Rate limited - exponential backoff
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`Rate limited. Retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }
        if (err.statusCode >= 500) {
          // Server error - retry
          console.log(`Server error. Attempt ${attempt}/${maxRetries}`);
          continue;
        }
      }
      throw err;  // Don't retry client errors
    }
  }
  throw new Error(`Discovery failed after ${maxRetries} attempts`);
}
```

---

## Interface: Dependencies

| Module | What We Need | Interface |
|--------|--------------|-----------|
| **DATA** | Agent collection with vector index | `db.agents` with `capabilities_embedding` |
| **Voyage AI** | Embedding and reranking | `VoyageAIClient` |

---

## Interface: Provides

### DiscoveryService

```typescript
interface DiscoveryService {
  // Discover agents for a task (returns candidates + cost operations)
  discoverAgents(request: DiscoveryRequest): Promise<DiscoveryResult>;

  // Embed agent capabilities (for registration) - returns embedding + operation
  embedCapabilities(capabilities: string): Promise<{
    embedding: number[];
    operation: LLMOperation;
  }>;

  // Health check
  healthCheck(): Promise<{ voyage: boolean; mongo_vector: boolean }>;
}

// Request/Response types (see Complete Discovery Flow section)
interface DiscoveryRequest {
  task_description: string;
  max_price?: number;
  min_quality?: number;
  limit?: number;
}

interface DiscoveryResult {
  candidates: RerankResult[];
  llm_operations: LLMOperation[];  // For cost tracking
  total_cost: number;
  search_time_ms: number;
}
```

---

## Event Emission

Discovery operations emit events for SSE streaming to the frontend, following the same pattern established in ORCH_GRAPH.

### lib/orchestration/discovery/events.ts

```typescript
/**
 * Discovery event types for SSE streaming.
 * Events are published to the job-specific event bus channel.
 */

export type DiscoveryEvent =
  | { type: "discovery:started"; job_id: string; task: string; timestamp: Date }
  | { type: "discovery:embedding_complete"; job_id: string; tokens: number; cost: number; timestamp: Date }
  | { type: "discovery:vector_search_complete"; job_id: string; candidates_count: number; search_time_ms: number; timestamp: Date }
  | { type: "discovery:rerank_complete"; job_id: string; top_candidates: string[]; timestamp: Date }
  | { type: "discovery:complete"; job_id: string; candidates_count: number; total_cost: number; total_time_ms: number; timestamp: Date }
  | { type: "discovery:error"; job_id: string; error: string; timestamp: Date };

/**
 * Event emitter interface (injected from ORCH_GRAPH event bus).
 * In production, this publishes to Redis pub/sub for SSE streaming.
 */
export interface DiscoveryEventEmitter {
  emit(event: DiscoveryEvent): void;
}

/**
 * Default no-op emitter for standalone usage or testing.
 */
export const noOpEmitter: DiscoveryEventEmitter = {
  emit: () => {}
};

/**
 * Create an event emitter that publishes to the ORCH_GRAPH event bus.
 * This follows the pattern established in ORCH_GRAPH for SSE streaming.
 *
 * @param eventBus - The event bus instance (Redis pub/sub or similar)
 * @param job_id - The job ID for channel routing
 */
export function createDiscoveryEmitter(
  eventBus: { publish: (channel: string, event: unknown) => void },
  job_id: string
): DiscoveryEventEmitter {
  return {
    emit: (event: DiscoveryEvent) => {
      // Publish to job-specific channel for SSE streaming
      eventBus.publish(`job:${job_id}`, event);
    }
  };
}
```

### Event Emission in Discovery Flow

Events are emitted at key points during the discovery pipeline:

```typescript
import { DiscoveryEventEmitter, noOpEmitter } from './events';

async function discoverAgentsWithEvents(
  request: DiscoveryRequest,
  emitter: DiscoveryEventEmitter = noOpEmitter,
  job_id?: string
): Promise<DiscoveryResult> {
  const startTime = Date.now();
  const operations: LLMOperation[] = [];

  // Event: Discovery started
  if (job_id) {
    emitter.emit({
      type: "discovery:started",
      job_id,
      task: request.task_description,
      timestamp: new Date()
    });
  }

  try {
    // Step 1: Embed the query
    const embedResult = await embedQuery(request.task_description);
    operations.push(embedResult.operation);

    // Event: Embedding complete
    if (job_id) {
      emitter.emit({
        type: "discovery:embedding_complete",
        job_id,
        tokens: embedResult.operation.native_tokens_prompt || 0,
        cost: embedResult.operation.total_cost,
        timestamp: new Date()
      });
    }

    // Step 2: Vector search
    const vectorSearchStart = Date.now();
    const vectorResults = await vectorSearchWithFilter(
      embedResult.embedding,
      request.max_price || Infinity,
      request.min_quality || 0.80
    );
    const vectorSearchTime = Date.now() - vectorSearchStart;

    // Event: Vector search complete
    if (job_id) {
      emitter.emit({
        type: "discovery:vector_search_complete",
        job_id,
        candidates_count: vectorResults.length,
        search_time_ms: vectorSearchTime,
        timestamp: new Date()
      });
    }

    if (vectorResults.length === 0) {
      // Event: Complete (no candidates)
      if (job_id) {
        emitter.emit({
          type: "discovery:complete",
          job_id,
          candidates_count: 0,
          total_cost: operations.reduce((sum, op) => sum + op.total_cost, 0),
          total_time_ms: Date.now() - startTime,
          timestamp: new Date()
        });
      }

      return {
        candidates: [],
        llm_operations: operations,
        total_cost: operations.reduce((sum, op) => sum + op.total_cost, 0),
        search_time_ms: Date.now() - startTime
      };
    }

    // Step 3: Rerank
    const rerankResponse = await rerankCandidates(
      request.task_description,
      vectorResults,
      request.limit || 10
    );
    operations.push(rerankResponse.operation);

    // Event: Rerank complete
    if (job_id) {
      emitter.emit({
        type: "discovery:rerank_complete",
        job_id,
        top_candidates: rerankResponse.results.slice(0, 3).map(r => r.name),
        timestamp: new Date()
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
        timestamp: new Date()
      });
    }

    return {
      candidates: rerankResponse.results,
      llm_operations: operations,
      total_cost: totalCost,
      search_time_ms: totalTime
    };

  } catch (error) {
    // Event: Error
    if (job_id) {
      emitter.emit({
        type: "discovery:error",
        job_id,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date()
      });
    }
    throw error;
  }
}
```

### Integration with ORCH_GRAPH

When called from the Planning Agent node in ORCH_GRAPH:

```typescript
// In planning_agent node (ORCH_GRAPH)
import { createDiscoveryEmitter } from '@/lib/orchestration/discovery/events';

async function planningAgentNode(state: GraphState): Promise<Partial<GraphState>> {
  // Create emitter connected to job's event channel
  const emitter = createDiscoveryEmitter(eventBus, state.job_id);

  // Discovery operations will emit events to the SSE stream
  const discovery = await discoverAgentsWithEvents(
    { task_description: actionItem.item, limit: 10 },
    emitter,
    state.job_id
  );

  // ... rest of planning logic
}
```

---

## Health Check Implementation

### lib/orchestration/discovery/health.ts

```typescript
import { VoyageAIClient } from "voyageai";
import { getDatabaseClient } from "@/lib/db";

/**
 * Health check response type.
 */
export interface HealthCheckResult {
  voyage: boolean;
  mongo_vector: boolean;
  details?: {
    voyage_latency_ms?: number;
    mongo_latency_ms?: number;
    voyage_error?: string;
    mongo_error?: string;
  };
}

/**
 * Performs health check on Voyage AI and MongoDB vector search.
 *
 * @param voyageClient - Voyage AI client instance
 * @returns Health status for both services
 */
export async function healthCheck(
  voyageClient: VoyageAIClient
): Promise<HealthCheckResult> {
  const result: HealthCheckResult = {
    voyage: false,
    mongo_vector: false,
    details: {}
  };

  // Check Voyage AI
  const voyageStart = Date.now();
  try {
    await voyageClient.embed({
      input: ["health check"],
      model: "voyage-3"
    });
    result.voyage = true;
    result.details!.voyage_latency_ms = Date.now() - voyageStart;
  } catch (error) {
    result.voyage = false;
    result.details!.voyage_error = error instanceof Error ? error.message : "Unknown error";
  }

  // Check MongoDB Vector Search
  const mongoStart = Date.now();
  try {
    const db = getDatabaseClient();

    // Create a minimal test embedding (1024 dimensions of zeros)
    const testEmbedding = new Array(1024).fill(0);

    // Run a minimal vector search query
    // This validates the index exists and is functional
    const agents = await db.searchAgentsByCapability("health check test", 1);

    // If searchAgentsByCapability doesn't use vector search, do direct aggregate
    // This ensures the vector index is tested
    const collection = await import("@/lib/db").then(m => m.getAgentsCollection());
    await collection.aggregate([
      {
        $vectorSearch: {
          index: "agent_capabilities_vector",
          path: "capabilities_embedding",
          queryVector: testEmbedding,
          numCandidates: 3,
          limit: 1
        }
      }
    ]).toArray();

    result.mongo_vector = true;
    result.details!.mongo_latency_ms = Date.now() - mongoStart;
  } catch (error) {
    result.mongo_vector = false;
    result.details!.mongo_error = error instanceof Error ? error.message : "Unknown error";
  }

  return result;
}

/**
 * Simplified health check that returns just boolean status.
 * Use for quick liveness checks.
 */
export async function quickHealthCheck(
  voyageClient: VoyageAIClient
): Promise<{ voyage: boolean; mongo_vector: boolean }> {
  const result = await healthCheck(voyageClient);
  return {
    voyage: result.voyage,
    mongo_vector: result.mongo_vector
  };
}
```

### Health Check Usage

```typescript
// In DiscoveryService implementation
import { healthCheck, quickHealthCheck } from './health';

class DiscoveryServiceImpl implements DiscoveryService {
  private voyageClient: VoyageAIClient;

  constructor(voyageClient: VoyageAIClient) {
    this.voyageClient = voyageClient;
  }

  async healthCheck(): Promise<{ voyage: boolean; mongo_vector: boolean }> {
    return quickHealthCheck(this.voyageClient);
  }

  // For detailed health status (e.g., admin endpoints)
  async detailedHealthCheck(): Promise<HealthCheckResult> {
    return healthCheck(this.voyageClient);
  }
}
```

### Health Check Endpoint Integration

The health check is exposed via the API module:

```typescript
// In API routes (MODULE_API)
// GET /api/health/discovery

import { getDiscoveryService } from '@/lib/orchestration/discovery';

export async function GET() {
  const discovery = getDiscoveryService();
  const health = await discovery.healthCheck();

  const isHealthy = health.voyage && health.mongo_vector;

  return Response.json(
    { status: isHealthy ? "healthy" : "unhealthy", ...health },
    { status: isHealthy ? 200 : 503 }
  );
}
```

---

## Testing

```typescript
describe("DiscoveryService", () => {
  it("should find relevant agents for marketing task", async () => {
    const result = await discoverAgents({
      task_description: "content strategist for social media marketing",
      limit: 5
    });

    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0].relevance_score).toBeGreaterThan(0.5);
  });

  it("should respect price filter", async () => {
    const result = await discoverAgents({
      task_description: "image generation",
      max_price: 0.05
    });

    result.candidates.forEach(c => {
      expect(c.base_price).toBeLessThanOrEqual(0.05);
    });
  });

  it("should respect quality threshold", async () => {
    const result = await discoverAgents({
      task_description: "copywriting",
      min_quality: 0.85
    });

    result.candidates.forEach(c => {
      expect(c.stats.avg_score).toBeGreaterThanOrEqual(0.85);
    });
  });

  it("should handle zero matches gracefully", async () => {
    const result = await discoverAgents({
      task_description: "extremely obscure nonexistent capability xyz123",
      limit: 5
    });

    expect(result.candidates).toEqual([]);
    expect(result.llm_operations.length).toBe(1); // Only embedding, no rerank
    expect(result.total_cost).toBeGreaterThan(0); // Embedding still costs
  });

  it("should track all LLM operations for cost billing", async () => {
    const result = await discoverAgents({
      task_description: "content creation",
      limit: 5
    });

    // Should have embedding + rerank operations (if candidates found)
    if (result.candidates.length > 0) {
      expect(result.llm_operations.length).toBe(2);
      expect(result.llm_operations[0].operation_type).toBe("discovery_embed");
      expect(result.llm_operations[1].operation_type).toBe("discovery_rerank");
    }

    // Total cost should match sum of operations
    const summedCost = result.llm_operations.reduce((sum, op) => sum + op.total_cost, 0);
    expect(result.total_cost).toBe(summedCost);
  });
});

describe("DiscoveryService.healthCheck", () => {
  it("should return healthy status when both services are up", async () => {
    const service = getDiscoveryService();
    const health = await service.healthCheck();

    expect(health.voyage).toBe(true);
    expect(health.mongo_vector).toBe(true);
  });

  it("should return detailed latency information", async () => {
    const service = getDiscoveryService() as DiscoveryServiceImpl;
    const health = await service.detailedHealthCheck();

    expect(health.details?.voyage_latency_ms).toBeDefined();
    expect(health.details?.mongo_latency_ms).toBeDefined();
  });
});

describe("Event Emission", () => {
  it("should emit events at each pipeline stage", async () => {
    const events: DiscoveryEvent[] = [];
    const mockEmitter: DiscoveryEventEmitter = {
      emit: (event) => events.push(event)
    };

    await discoverAgentsWithEvents(
      { task_description: "content creation", limit: 5 },
      mockEmitter,
      "job_test_123"
    );

    // Verify event sequence
    expect(events[0].type).toBe("discovery:started");
    expect(events[1].type).toBe("discovery:embedding_complete");
    expect(events[2].type).toBe("discovery:vector_search_complete");
    // If candidates found:
    // expect(events[3].type).toBe("discovery:rerank_complete");
    // expect(events[4].type).toBe("discovery:complete");
  });

  it("should emit error event on failure", async () => {
    const events: DiscoveryEvent[] = [];
    const mockEmitter: DiscoveryEventEmitter = {
      emit: (event) => events.push(event)
    };

    // Mock Voyage AI to throw error
    // ... test implementation

    const errorEvent = events.find(e => e.type === "discovery:error");
    expect(errorEvent).toBeDefined();
  });
});

describe("Utility Functions", () => {
  it("should generate unique operation IDs", () => {
    const id1 = generateOperationId();
    const id2 = generateOperationId();

    expect(id1).toMatch(/^op_[a-f0-9-]{36}$/);
    expect(id2).toMatch(/^op_[a-f0-9-]{36}$/);
    expect(id1).not.toBe(id2);
  });

  it("should calculate embedding cost correctly", () => {
    // 1000 tokens at $0.06/1M = $0.00006
    const cost = calculateVoyageEmbedCost(1000, "voyage-3");
    expect(cost).toBeCloseTo(0.00006, 8);
  });

  it("should calculate rerank cost correctly", () => {
    // 2000 tokens at $0.05/1M = $0.0001
    const cost = calculateVoyageRerankCost(2000, "rerank-2");
    expect(cost).toBeCloseTo(0.0001, 8);
  });

  it("should estimate rerank tokens correctly", () => {
    const tokens = estimateRerankTokens("test query", ["doc one", "doc two"]);
    // "test query" = ~2.5 tokens, "doc one" = ~2 tokens, "doc two" = ~2 tokens
    // Total = ~6.5 tokens (rounded up per string)
    expect(tokens).toBeGreaterThan(0);
  });
});
```
