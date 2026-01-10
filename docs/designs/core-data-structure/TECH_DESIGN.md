# Module: DATA

MongoDB data layer - collections, schemas, indexes.

---

## Scope

**Owns:**
- All MongoDB collection definitions
- Document schemas and TypeScript types
- Indexes for query performance
- Database connection and client

**Does NOT own:**
- Business logic (that's ORCHESTRATION)
- API endpoints (that's API)
- External service calls

---

## Collections Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  7 COLLECTIONS                                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. users             → User accounts + wallets                             │
│  2. jobs              → Main task/conversation                              │
│  3. plans             → Planning output (requirements + action items)       │
│  4. work_items        → Execution records (one per action item)             │
│  5. agents            → Marketplace registry                                │
│  6. prompt_templates  → Template library                                    │
│  7. transactions      → Payment audit log                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Collection Relationships

```
users ──────────────────────────────► jobs (1:many)
  │                                      │
  │ (user_id, wallet)                    │
  │                                      ▼
  │                                 ┌─────────┐
  │                                 │  plans  │ (1:many versions)
  │                                 └────┬────┘
  │                                      │
  │                                      └──► action_items[] (embedded)
  │                                                  │
  │                                                  │ (agent_id, template_id)
  │                                                  ▼
  │                                            ┌──────────┐
  │                                            │ agents   │
  │                                            │ (wallet) │
  │                                            └──────────┘
  │                                            ┌──────────────────┐
  │                                            │ prompt_templates │
  │                                            └──────────────────┘
  │
  │  jobs ──────────────────────────► work_items (1:many)
  │                                        │
  │                                        ├──► output content
  │                                        ├──► prompt used
  │                                        ├──► verification result
  │                                        └──► payment record
  │                                                   │
  │                                                   ▼
  └──────────────────────────────────────────► transactions
       (user funds job)                      (system pays agent)
```

---

## Collection 1: `users`

```typescript
interface User {
  user_id: string;

  // Authentication
  email: string;
  auth_provider: "clerk" | "auth0" | "custom";

  // Wallet for funding jobs
  wallet: {
    address: string;
    provider: "coinbase" | "metamask" | "walletconnect";
    verified: boolean;
  };

  // Usage stats
  stats: {
    total_jobs: number;
    total_spent: number;
    total_work_items: number;
  };

  created_at: Date;
  updated_at: Date;
}
```

**Indexes:**
```javascript
{ user_id: 1 }        // unique
{ email: 1 }          // unique
{ "wallet.address": 1 }
```

---

## Collection 2: `jobs`

```typescript
interface Job {
  job_id: string;
  user_id: string;

  // Status
  status: "planning" | "plan_verification" | "executing" | "completed" | "failed";

  // User input
  prompt: string;

  // Budget
  budget: {
    total: number;
    allocated: number;
    spent: number;
    remaining: number;
  };

  // Token Usage & Cost - stored per operation (not accumulated)
  // Each operation is stored separately for client visibility and auditing
  // Follows OpenRouter format: https://openrouter.ai/docs/api/reference/overview
  token_usage: {
    // All internal LLM operations (our cost) - array, each stored separately
    operations: LLMOperation[];
    // External agent costs (from work_items) - just total cost per agent
    external_costs: Array<{
      work_id: string;
      agent_id: string;
      usage: AgentUsage;
    }>;
    // Computed totals (for quick access, but derived from operations array)
    total_internal_cost_usd: number;
    total_external_cost_usd: number;
    total_cost_usd: number;
  };

  // Current plan
  current_plan_id: string;
  plan_version: number;

  // Context (kept small for token limits)
  context_summary: string;  // ~100 words rolling summary
  context_refs: ContextRef[];

  // Reasoning log
  reasoning_log: ReasoningEntry[];

  // Version history
  versions: JobVersion[];

  // Recovery
  last_checkpoint: {
    timestamp: Date;
    action_item_id: number;
    status: string;
  };

  created_at: Date;
  updated_at: Date;
}

interface ContextRef {
  work_id: string;
  action_item_id: number;
  title: string;
  description: string;  // No full content - lazy load
}

interface ReasoningEntry {
  ts: Date;
  agent: "main" | "planning" | "plan_verifier" | "prompt";
  step: string;
  thought: string;
  decision: string;
}

interface JobVersion {
  version: number;
  completed_at: Date;
  work_ids: string[];
}
```

**Indexes:**
```javascript
{ job_id: 1 }           // unique
{ user_id: 1 }
{ status: 1 }
{ created_at: -1 }
```

---

## Collection 3: `plans`

```typescript
interface Plan {
  plan_id: string;
  job_id: string;
  version: number;

  // Verification
  status: "pending" | "verified" | "failed";
  verified_at: Date | null;
  verification_attempts: number;
  verification_issues: string[];

  // Requirements
  requirements: {
    deliverables: Deliverable[];
    constraints: {
      budget: number;
      brand_tone?: string;
      [key: string]: any;
    };
  };

  // Action items
  action_items: ActionItem[];

  created_at: Date;
}

interface Deliverable {
  id: string;           // "D1", "D2", etc.
  name: string;
  criteria: string[];
}

interface ActionItem {
  id: number;
  item: string;
  priority: number;
  depends_on: number[];
  deliverable_id: string;

  // Pre-picked by Planning Agent
  agent_id: string | null;    // null if SELF
  template_id: string;
  estimated_cost: number;

  // Status
  status: "pending" | "in_progress" | "completed" | "failed";
  work_id: string | null;

  // Resource type
  resource_type: "AGENT" | "SELF";
}
```

**Indexes:**
```javascript
{ plan_id: 1 }          // unique
{ job_id: 1, version: 1 }
{ status: 1 }
```

---

## Collection 4: `work_items`

```typescript
interface WorkItem {
  work_id: string;
  job_id: string;
  plan_id: string;
  action_item_id: number;

  // Status (16 states)
  status: WorkItemStatus;

  // Retry tracking
  attempt: number;
  max_attempts: number;

  // Action
  action: {
    item: string;
    deliverable_id: string;
    requirements: string[];
  };

  // Agent
  agent: {
    agent_id: string;
    name: string;
    url: string;
    price: number;
  } | null;

  // Prompt
  prompt: {
    template_id: string;
    generated_prompt: string;
    context_used: {
      summary: string;
      refs_fetched: string[];
    };
    generated_at: Date;
  } | null;

  // External reference (async)
  external_ref: {
    reference_id: string;
    status_url: string;
    callback_url: string;
    dispatched_at: Date;
    last_poll_at: Date | null;
    next_poll_at: Date | null;
    polling: PollingConfig;
    last_response: any;
    last_error: string | null;
  } | null;

  // Output
  output: {
    title: string;
    description: string;
    content: any;
  } | null;

  // Verification
  verification: {
    score: number;
    reasoning: string;
    criteria_results: CriteriaResult[];
    issues: string[];
    verified_at: Date;
  } | null;

  // Retry context (for retry with feedback)
  retry_context: {
    previous_attempt: number;
    previous_output: any;
    verification_feedback: {
      score: number;
      reasoning: string;
      issues: Array<{ criterion: string; passed: boolean; detail: string }>;
      suggestions: string[];
    };
  } | null;

  // Payment
  payment: {
    status: "pending" | "processing" | "confirmed" | "failed" | "refunded";
    amount: number;
    tx_hash: string | null;
    original_price: number;
    negotiated_price: number;
    error: string | null;
    retry_count: number;
    initiated_at: Date | null;
    confirmed_at: Date | null;
  } | null;

  // Token Usage & Cost - stored per operation (not accumulated)
  // Each operation is stored separately for client visibility
  // Follows OpenRouter format: https://openrouter.ai/docs/api/reference/overview
  token_usage: {
    // Internal LLM calls for this work item (our cost)
    internal: LLMOperation[];
    // External agent (reported by agent) - price mandatory, breakdown optional
    external: AgentUsage | null;
    // Totals for this work item
    total_internal_cost_usd: number;
    total_external_cost_usd: number;
    total_cost_usd: number;
  };

  // Retry history
  retries: RetryEntry[];

  // Timing
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
}

type WorkItemStatus =
  | "pending"        // Waiting for dependencies
  | "ready"          // Queued for execution
  | "prompting"      // Prompt Agent generating
  | "dispatched"     // Sent to external agent
  | "polling"        // Async, checking status
  | "stale"          // Polling timed out
  | "received"       // Output received
  | "verifying"      // Galileo checking
  | "verified"       // Passed verification
  | "retry_pending"  // Failed, preparing retry
  | "rejected"       // Failed after max retries
  | "reassigning"    // Selecting new agent
  | "paying"         // Payment in progress
  | "payment_retry"  // Payment failed, retrying
  | "completed"      // Done (terminal)
  | "failed";        // Permanently failed (terminal)

interface PollingConfig {
  initial_interval_ms: number;   // 3000
  current_interval_ms: number;
  max_interval_ms: number;       // 15000
  backoff_multiplier: number;    // 1.5
  poll_count: number;
  timeout_at: Date;
  timeout_ms: number;            // 600000 (10 min)
}

interface CriteriaResult {
  criterion: string;
  passed: boolean;
}

interface RetryEntry {
  attempt: number;
  reason: string;
  score: number;
  feedback_sent: string;
  agent_id: string;
  timestamp: Date;
}
```

**Indexes:**
```javascript
{ work_id: 1 }                              // unique
{ job_id: 1 }
{ status: 1 }
{ "external_ref.next_poll_at": 1 }          // for poll manager
{ status: 1, "external_ref.polling.timeout_at": 1 }  // for stale detection
```

---

## Collection 5: `agents`

```typescript
interface Agent {
  agent_id: string;
  name: string;
  url: string;

  // Pricing
  pricing: {
    base_price: number;
    negotiable: boolean;
    min_price: number;
  };

  // Capabilities (for discovery)
  capabilities: string;
  capabilities_embedding: number[];  // Vector for search

  // Wallet
  wallet: string;

  // Stats (for selection reasoning)
  stats: {
    jobs_completed: number;
    avg_score: number;
    avg_response_time_ms: number;
  };

  // Async support
  supports_async: boolean;
  supports_callback: boolean;

  registered_at: Date;
}
```

**Indexes:**
```javascript
{ agent_id: 1 }              // unique
{ name: 1 }
{ "stats.avg_score": -1 }
{ capabilities_embedding: "vectorSearch" }  // Atlas Vector Search
```

---

## Collection 6: `prompt_templates`

```typescript
interface PromptTemplate {
  template_id: string;
  name: string;
  agent_type: string;
  version: string;

  // Template
  template: string;  // With {{placeholders}}

  // Retry template
  retry_template: string;

  // Schema
  input_schema: Record<string, {
    type: string;
    required: boolean;
  }>;

  // Examples
  examples: any[];

  created_at: Date;
  updated_at: Date;
}
```

**Indexes:**
```javascript
{ template_id: 1 }      // unique
{ agent_type: 1 }
{ name: 1 }
```

---

## Collection 7: `transactions`

```typescript
interface Transaction {
  tx_id: string;

  // References
  job_id: string;
  work_id: string;
  user_id: string;
  agent_id: string;

  // Payment details
  amount: number;
  currency: "USDC";
  protocol: "x402";
  tx_hash: string;

  // Status
  status: "pending" | "confirmed" | "failed" | "refunded";

  // Audit
  audit: {
    reason: string;
    approved_by: string;
    budget_before: number;
    budget_after: number;
  };

  created_at: Date;
  confirmed_at: Date | null;
}
```

**Indexes:**
```javascript
{ tx_id: 1 }            // unique
{ job_id: 1 }
{ work_id: 1 }
{ user_id: 1 }
{ agent_id: 1 }
{ status: 1 }
{ tx_hash: 1 }
```

---

## Interface: Exports

This module exports TypeScript types and database operations.

### Types Export

```typescript
// types/data.ts
export type {
  User,
  Job,
  ContextRef,
  ReasoningEntry,
  JobVersion,
  Plan,
  Deliverable,
  ActionItem,
  WorkItem,
  WorkItemStatus,
  PollingConfig,
  CriteriaResult,
  RetryEntry,
  Agent,
  PromptTemplate,
  Transaction
};
```

### Database Client Export

```typescript
// db/client.ts
export interface DatabaseClient {
  // Users
  getUser(user_id: string): Promise<User | null>;
  createUser(user: Omit<User, 'created_at' | 'updated_at'>): Promise<User>;
  updateUserStats(user_id: string, stats: Partial<User['stats']>): Promise<void>;

  // Jobs
  getJob(job_id: string): Promise<Job | null>;
  createJob(job: Omit<Job, 'created_at' | 'updated_at'>): Promise<Job>;
  updateJobStatus(job_id: string, status: Job['status']): Promise<void>;
  updateJobBudget(job_id: string, budget: Job['budget']): Promise<void>;
  addReasoningLog(job_id: string, entry: ReasoningEntry): Promise<void>;
  updateContextSummary(job_id: string, summary: string): Promise<void>;
  addContextRef(job_id: string, ref: ContextRef): Promise<void>;

  // Plans
  getPlan(plan_id: string): Promise<Plan | null>;
  createPlan(plan: Omit<Plan, 'created_at'>): Promise<Plan>;
  updatePlanStatus(plan_id: string, status: Plan['status']): Promise<void>;

  // Work Items
  getWorkItem(work_id: string): Promise<WorkItem | null>;
  getWorkItemsByJob(job_id: string): Promise<WorkItem[]>;
  getWorkItemsByStatus(status: WorkItemStatus): Promise<WorkItem[]>;
  createWorkItem(item: Omit<WorkItem, 'created_at'>): Promise<WorkItem>;
  updateWorkItemStatus(work_id: string, status: WorkItemStatus): Promise<void>;
  updateWorkItemOutput(work_id: string, output: WorkItem['output']): Promise<void>;
  updateWorkItemVerification(work_id: string, verification: WorkItem['verification']): Promise<void>;
  getItemsNeedingPoll(): Promise<WorkItem[]>;
  getStaleItems(): Promise<WorkItem[]>;

  // Agents
  getAgent(agent_id: string): Promise<Agent | null>;
  getAllAgents(): Promise<Agent[]>;
  searchAgentsByCapability(query: string, limit?: number): Promise<Agent[]>;
  updateAgentStats(agent_id: string, stats: Partial<Agent['stats']>): Promise<void>;

  // Templates
  getTemplate(template_id: string): Promise<PromptTemplate | null>;
  getTemplatesByType(agent_type: string): Promise<PromptTemplate[]>;

  // Transactions
  createTransaction(tx: Omit<Transaction, 'created_at'>): Promise<Transaction>;
  updateTransactionStatus(tx_id: string, status: Transaction['status']): Promise<void>;
  getTransactionsByJob(job_id: string): Promise<Transaction[]>;
}
```

---

## Shared Interfaces: Token Usage & Cost

Used across jobs, work_items, and external agent responses.

```typescript
// Each LLM call is stored as a separate operation
// Follows OpenRouter format: https://openrouter.ai/docs/api/reference/overview
interface LLMOperation {
  operation_id: string;           // Unique ID for this operation
  timestamp: Date;
  operation_type:                 // What triggered this LLM call
    | "main_agent"
    | "planning_agent"
    | "plan_verifier"
    | "prompt_agent"
    | "discovery_embed"
    | "discovery_rerank"
    | "summarization"
    | "external_agent";           // External agent LLM calls (when breakdown provided)
  model: string;                  // e.g., "anthropic/claude-sonnet-4", "voyage-3"
  native_tokens_prompt?: number;  // Input tokens - optional (some providers don't report)
  native_tokens_completion?: number; // Output tokens - optional
  total_cost: number;             // Cost in USD - REQUIRED (provider reports this)
  metadata?: Record<string, any>; // Additional context (e.g., work_id, action_item_id)
}

// Simple model usage from external agents (doesn't require operation tracking fields)
// External agents return this format - simpler than LLMOperation
interface ModelUsage {
  model: string;                  // e.g., "openai/gpt-4o", "anthropic/claude-sonnet-4"
  native_tokens_prompt?: number;  // Input tokens (native tokenizer) - optional
  native_tokens_completion?: number; // Output tokens (native tokenizer) - optional
  total_cost: number;             // Cost in USD for this model call
}

// For external agents - price is mandatory, breakdown is optional
// Supports multi-agent flows where external agent calls multiple models
// Uses ModelUsage (simpler) - transformed to LLMOperation when storing
interface AgentUsage {
  total_cost: number;             // REQUIRED: total cost in USD
  model_usage?: ModelUsage[];     // OPTIONAL: per-model breakdown (for multi-agent flows)
}
```

**Example: Job with 6 work items**

```typescript
// jobs.token_usage.operations array might contain:
[
  { operation_id: "op_001", operation_type: "main_agent", model: "claude-sonnet-4", total_cost: 0.003 },
  { operation_id: "op_002", operation_type: "planning_agent", model: "claude-sonnet-4", total_cost: 0.012 },
  { operation_id: "op_003", operation_type: "plan_verifier", model: "claude-sonnet-4", total_cost: 0.005 },
  { operation_id: "op_004", operation_type: "discovery_embed", model: "voyage-3", total_cost: 0.0001 },
  { operation_id: "op_005", operation_type: "prompt_agent", model: "claude-sonnet-4", total_cost: 0.004, metadata: { work_id: "work_001" } },
  { operation_id: "op_006", operation_type: "summarization", model: "gemini-2.5-flash", total_cost: 0.0002, metadata: { work_id: "work_001" } },
  // ... more operations for each work item
]

// jobs.token_usage.external_costs array might contain:
[
  { work_id: "work_001", agent_id: "agent_strategy_001", usage: { total_cost: 0.08 } },
  { work_id: "work_002", agent_id: "agent_copywriter_002", usage: { total_cost: 0.04, model_usage: [...] } },
  // ... one entry per external agent call
]
```

---

## Interface: Dependencies

This module has no dependencies on other modules. It is the foundation.

**External dependencies:**
- MongoDB Atlas (database)
- MongoDB Node.js Driver

---

## Vector Search Setup

For agent discovery, we use MongoDB Atlas Vector Search.

```javascript
// Atlas Search Index Definition
{
  "name": "agent_capabilities_vector",
  "type": "vectorSearch",
  "definition": {
    "fields": [
      {
        "type": "vector",
        "path": "capabilities_embedding",
        "numDimensions": 1024,  // Voyage AI dimension
        "similarity": "cosine"
      }
    ]
  }
}
```

**Query pattern:**
```javascript
db.agents.aggregate([
  {
    $vectorSearch: {
      index: "agent_capabilities_vector",
      path: "capabilities_embedding",
      queryVector: [/* embedding from Voyage AI */],
      numCandidates: 50,
      limit: 10
    }
  }
]);
```
