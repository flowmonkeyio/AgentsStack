/**
 * Core Data Structure Types
 *
 * This file contains all MongoDB collection types and shared interfaces
 * as defined in the technical design.
 *
 * @see /docs/designs/core-data-structure/TECH_DESIGN.md
 */

// =============================================================================
// SHARED INTERFACES: Token Usage & Cost
// =============================================================================

/**
 * Each LLM call is stored as a separate operation
 * Follows OpenRouter format: https://openrouter.ai/docs/api/reference/overview
 */
export interface LLMOperation {
  operation_id: string; // Unique ID for this operation
  timestamp: Date;
  operation_type: // What triggered this LLM call
    | "main_agent"
    | "planning_agent"
    | "plan_verifier"
    | "prompt_agent"
    | "discovery_embed"
    | "discovery_rerank"
    | "summarization"
    | "external_agent"; // External agent LLM calls (when breakdown provided)
  model: string; // e.g., "anthropic/claude-sonnet-4", "voyage-3"
  native_tokens_prompt?: number; // Input tokens - optional (some providers don't report)
  native_tokens_completion?: number; // Output tokens - optional
  total_cost: number; // Cost in USD - REQUIRED (provider reports this)
  metadata?: Record<string, unknown>; // Additional context (e.g., work_id, action_item_id)
}

/**
 * Simple model usage from external agents (doesn't require operation tracking fields)
 * External agents return this format - simpler than LLMOperation
 */
export interface ModelUsage {
  model: string; // e.g., "openai/gpt-4o", "anthropic/claude-sonnet-4"
  native_tokens_prompt?: number; // Input tokens (native tokenizer) - optional
  native_tokens_completion?: number; // Output tokens (native tokenizer) - optional
  total_cost: number; // Cost in USD for this model call
}

/**
 * For external agents - price is mandatory, breakdown is optional
 * Supports multi-agent flows where external agent calls multiple models
 * Uses ModelUsage (simpler) - transformed to LLMOperation when storing
 */
export interface AgentUsage {
  total_cost: number; // REQUIRED: total cost in USD
  model_usage?: ModelUsage[]; // OPTIONAL: per-model breakdown (for multi-agent flows)
}

// =============================================================================
// COLLECTION 1: users
// =============================================================================

export interface User {
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

// =============================================================================
// COLLECTION 2: jobs
// =============================================================================

export interface Job {
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
  context_summary: string; // ~100 words rolling summary
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

export interface ContextRef {
  work_id: string;
  action_item_id: number;
  title: string;
  description: string; // No full content - lazy load
}

export interface ReasoningEntry {
  ts: Date;
  agent: "main" | "planning" | "plan_verifier" | "prompt";
  step: string;
  thought: string;
  decision: string;
}

export interface JobVersion {
  version: number;
  completed_at: Date;
  work_ids: string[];
}

// =============================================================================
// COLLECTION 3: plans
// =============================================================================

export interface Plan {
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
      [key: string]: unknown;
    };
  };

  // Action items
  action_items: ActionItem[];

  created_at: Date;
}

export interface Deliverable {
  id: string; // "D1", "D2", etc.
  name: string;
  criteria: string[];
}

export interface ActionItem {
  id: number;
  item: string;
  priority: number;
  depends_on: number[];
  deliverable_id: string;

  // Pre-picked by Planning Agent
  agent_id: string | null; // null if SELF
  template_id: string;
  estimated_cost: number;

  // Status
  status: "pending" | "in_progress" | "completed" | "failed";
  work_id: string | null;

  // Resource type
  resource_type: "AGENT" | "SELF";
}

// =============================================================================
// COLLECTION 4: work_items
// =============================================================================

export type WorkItemStatus =
  | "pending" // Waiting for dependencies
  | "ready" // Queued for execution
  | "prompting" // Prompt Agent generating
  | "dispatched" // Sent to external agent
  | "polling" // Async, checking status
  | "stale" // Polling timed out
  | "received" // Output received
  | "verifying" // Galileo checking
  | "verified" // Passed verification
  | "retry_pending" // Failed, preparing retry
  | "rejected" // Failed after max retries
  | "reassigning" // Selecting new agent
  | "paying" // Payment in progress
  | "payment_retry" // Payment failed, retrying
  | "completed" // Done (terminal)
  | "failed"; // Permanently failed (terminal)

export interface PollingConfig {
  initial_interval_ms: number; // 3000
  current_interval_ms: number;
  max_interval_ms: number; // 15000
  backoff_multiplier: number; // 1.5
  poll_count: number;
  timeout_at: Date;
  timeout_ms: number; // 600000 (10 min)
}

export interface CriteriaResult {
  criterion: string;
  passed: boolean;
}

export interface RetryEntry {
  attempt: number;
  reason: string;
  score: number;
  feedback_sent: string;
  agent_id: string;
  timestamp: Date;
}

export interface WorkItem {
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
    last_response: unknown;
    last_error: string | null;
  } | null;

  // Output
  output: {
    title: string;
    description: string;
    content: unknown;
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
    previous_output: unknown;
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

// =============================================================================
// COLLECTION 5: agents
// =============================================================================

export interface Agent {
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
  capabilities_embedding: number[]; // Vector for search

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

// =============================================================================
// COLLECTION 6: prompt_templates
// =============================================================================

export interface PromptTemplate {
  template_id: string;
  name: string;
  agent_type: string;
  version: string;

  // Template
  template: string; // With {{placeholders}}

  // Retry template
  retry_template: string;

  // Schema
  input_schema: Record<
    string,
    {
      type: string;
      required: boolean;
    }
  >;

  // Examples
  examples: unknown[];

  created_at: Date;
  updated_at: Date;
}

// =============================================================================
// COLLECTION 7: transactions
// =============================================================================

export interface Transaction {
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
