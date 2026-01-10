# ORCH_DISCOVERY

Agent discovery: Voyage AI embeddings, MongoDB vector search, and reranking.

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

## Voyage AI Pricing

Cost tracking for discovery operations using Voyage AI.

### Pricing Constants

```typescript
// Voyage AI pricing (as of January 2025)
// Reference: https://docs.voyageai.com/pricing/
const VOYAGE_PRICING = {
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
};

// Cost calculation helpers
function calculateVoyageEmbedCost(tokens: number, model: string = "voyage-3"): number {
  const pricing = VOYAGE_PRICING[model];
  if (!pricing) throw new Error(`Unknown model: ${model}`);
  return (tokens / 1_000_000) * pricing.per_million_tokens;
}

function calculateVoyageRerankCost(tokens: number, model: string = "rerank-2"): number {
  const pricing = VOYAGE_PRICING[model];
  if (!pricing) throw new Error(`Unknown model: ${model}`);
  return (tokens / 1_000_000) * pricing.per_million_tokens;
}
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
import { generateOperationId } from './utils';

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

## Events Emitted

```typescript
type DiscoveryEvent =
  | { type: "discovery:started"; task: string }
  | { type: "discovery:vector_search_complete"; candidates_count: number }
  | { type: "discovery:rerank_complete"; top_candidates: string[] }
  | { type: "discovery:complete"; selected_agent: string; relevance_score: number };
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
});
```
