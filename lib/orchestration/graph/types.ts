/**
 * Graph Module Type Definitions
 *
 * Types for the LangGraph orchestration graph including:
 * - Graph state schema
 * - Node input/output types
 * - Routing types
 * - Event types
 *
 * @see /docs/designs/orchestration/graph/TECH_DESIGN.md
 */

import type {
  LLMOperation,
  Plan,
  ActionItem,
  Agent,
  PromptTemplate,
  WorkItem,
  Job,
} from "@/types";

// =============================================================================
// GRAPH TRIGGER TYPES
// =============================================================================

/**
 * Trigger type for graph invocation.
 * - new_job: Starting a brand new job
 * - continue: User continuation of existing job
 * - recover: System recovery after restart
 */
export type GraphTrigger = "new_job" | "continue" | "recover";

// =============================================================================
// CONTEXT REFERENCE
// =============================================================================

/**
 * Reference to a completed work item's output.
 * Contains metadata but not full content (lazy loading).
 */
export interface ContextRef {
  work_id: string;
  title: string;
  description: string;
}

// =============================================================================
// PLAN VERIFICATION TYPES
// =============================================================================

/**
 * Result of plan verification by plan_verifier node.
 */
export interface PlanVerifierOutput {
  /** Whether plan passed all validation checks */
  result: "PASS" | "FAIL";
  /** List of issues found (empty if PASS) */
  issues: string[];
  /** Suggestions for fixing issues (for retry) */
  suggestions?: string[];
}

// =============================================================================
// PLANNING AGENT TYPES
// =============================================================================

/**
 * Input for the Planning Agent.
 */
export interface PlanningAgentInput {
  /** User prompt or continuation prompt */
  prompt: string;
  /** Budget constraint */
  budget: number;
  /** Optional context data */
  context?: Record<string, unknown>;
  /** Whether this is a continuation */
  is_continuation: boolean;
  /** Continuation prompt (if continuation) */
  continuation_prompt?: string;
  /** Context summary for continuation */
  context_summary?: string;
  /** References to prior work */
  context_refs?: ContextRef[];
  /** Available agents from discovery */
  available_agents: Agent[];
  /** Available prompt templates */
  available_templates: PromptTemplate[];
  /** Whether this is a retry after failed verification */
  is_plan_retry?: boolean;
  /** Previous plan (for retry) */
  previous_plan?: PlanningAgentOutput;
  /** Feedback from failed verification */
  verification_feedback?: string[];
}

/**
 * Agent selection reasoning for audit trail.
 */
export interface AgentSelectionReasoning {
  todo_id: number;
  selected_agent: string;
  reasoning: string;
  candidates_considered: string[];
  scores: Record<string, number>;
}

/**
 * Output from the Planning Agent.
 */
export interface PlanningAgentOutput {
  /** Requirements extracted from prompt */
  requirements: {
    deliverables: Array<{
      id: string;
      name: string;
      criteria: string[];
    }>;
    constraints: {
      budget: number;
      brand_tone?: string;
      [key: string]: unknown;
    };
  };
  /** Action items (TODOs) to execute */
  action_items: ActionItem[];
  /** Reasoning for each agent selection */
  agent_selection_reasoning: AgentSelectionReasoning[];
}

// =============================================================================
// PROMPT AGENT TYPES
// =============================================================================

/**
 * Input for the Prompt Agent.
 */
export interface PromptAgentInput {
  /** Template ID to use */
  template_id: string;
  /** Action item details */
  action_item: ActionItem;
  /** Context for prompt generation */
  context: {
    summary: string;
    refs: ContextRef[];
    loaded_content: Record<string, unknown>;
  };
  /** Requirements from action item */
  requirements: string[];
  /** Whether this is a retry attempt */
  is_retry: boolean;
  /** Retry context (if retry) */
  retry_context?: RetryContext;
}

/**
 * Retry context for failed work items.
 */
export interface RetryContext {
  previous_attempt: number;
  previous_output: unknown;
  verification_feedback: {
    score: number;
    reasoning: string;
    issues: Array<{ criterion: string; passed: boolean; detail: string }>;
    suggestions: string[];
  };
}

/**
 * Output from the Prompt Agent.
 */
export interface PromptAgentOutput {
  /** Generated prompt for external agent */
  generated_prompt: string;
  /** Requirements passed through */
  requirements: string[];
  /** Template used */
  template_used: string;
}

// =============================================================================
// MAIN AGENT DECISION TYPES
// =============================================================================

/**
 * Decisions that main_agent can make.
 */
export type MainAgentDecision =
  | "call_planning"
  | "execute_work"
  | "job_completed"
  | "job_failed";

// =============================================================================
// PLAN VERIFIER DECISION TYPES
// =============================================================================

/**
 * Decisions from plan_verifier node.
 */
export type PlanVerifierDecision = "pass" | "fail" | "max_attempts_exceeded";

// =============================================================================
// VERIFICATION ROUTER TYPES
// =============================================================================

/**
 * Decisions from verification router (after galileo_verify).
 */
export type VerificationDecision = "pass" | "retry" | "reject";

// =============================================================================
// PAYMENT ROUTER TYPES
// =============================================================================

/**
 * Decisions from payment router.
 */
export type PaymentDecision = "success" | "retry" | "failed";

// =============================================================================
// NODE OUTPUT TYPES
// =============================================================================

/**
 * Partial state update returned by node functions.
 * Nodes return partial state - LangGraph merges into full state.
 */
export interface NodeOutput {
  /** Decision made by the node */
  decision?: string;
  /** Reasoning for the decision */
  reasoning?: string;
  /** Updated token usage (with new operation appended) */
  token_usage?: LLMOperation[];
  /** Any other partial state updates */
  [key: string]: unknown;
}

// =============================================================================
// LLM INVOKE RESULT
// =============================================================================

/**
 * Result from invoking an LLM via OpenRouter.
 * Contains both the parsed data and the operation for cost tracking.
 */
export interface LLMInvokeResult<T> {
  /** Parsed LLM response */
  data: T;
  /** Operation record for cost tracking */
  operation: LLMOperation;
}

// =============================================================================
// TOKEN USAGE TOTALS
// =============================================================================

/**
 * Computed totals from token usage operations.
 */
export interface TokenUsageTotals {
  total_cost: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  by_operation_type: Record<string, { cost: number; count: number }>;
}

// =============================================================================
// GRAPH RUNNER INTERFACE
// =============================================================================

/**
 * Input for starting a new job.
 */
export interface StartJobInput {
  user_id: string;
  prompt: string;
  budget: number;
  context?: Record<string, unknown>;
}

/**
 * Result of starting a new job.
 */
export interface StartJobResult {
  job_id: string;
  trace_id: string;
}

/**
 * Input for continuing an existing job.
 */
export interface ContinueJobInput {
  job_id: string;
  prompt: string;
}

/**
 * Result of continuing a job.
 */
export interface ContinueJobResult {
  version: number;
}

/**
 * GraphRunner interface - main entry point for graph execution.
 */
export interface GraphRunner {
  /**
   * Start a new job.
   * @param input - Job input parameters
   * @returns Job ID and trace ID
   */
  startJob(input: StartJobInput): Promise<StartJobResult>;

  /**
   * Continue an existing job with a new prompt.
   * @param input - Continuation parameters
   * @returns New version number
   */
  continueJob(input: ContinueJobInput): Promise<ContinueJobResult>;

  /**
   * Resume a job from checkpoint (recovery).
   * @param job_id - Job ID to recover
   */
  recoverJob(job_id: string): Promise<void>;

  /**
   * Get current graph state for a job.
   * @param job_id - Job ID
   * @returns Current graph state
   */
  getState(job_id: string): Promise<OrchestrationState>;
}

// =============================================================================
// GRAPH EVENT TYPES
// =============================================================================

/**
 * Events emitted by the graph for SSE streaming.
 */
export type GraphEvent =
  | { type: "job:started"; job_id: string }
  | { type: "job:planning"; job_id: string }
  | { type: "job:plan_verified"; job_id: string; plan_id: string }
  | { type: "job:executing"; job_id: string }
  | { type: "job:completed"; job_id: string; version: number }
  | { type: "job:failed"; job_id: string; reason: string }
  | {
      type: "reasoning";
      agent: string;
      step: string;
      thought: string;
      decision?: string;
    };

// =============================================================================
// ORCHESTRATION STATE (GRAPH STATE)
// =============================================================================

/**
 * Full graph state for the orchestration workflow.
 * This is the LangGraph state schema.
 */
export interface OrchestrationState {
  // Job context
  job_id: string;
  user_id: string;
  trigger: GraphTrigger;

  // Planning inputs
  prompt: string;
  budget: number;
  context?: Record<string, unknown>;

  // Continuation
  continuation_prompt?: string;
  context_summary?: string;
  context_refs?: ContextRef[];

  // Plan state
  plan?: PlanningAgentOutput;
  plan_verification?: PlanVerifierOutput;
  plan_verification_attempts: number;
  plan_verification_feedback?: string[];

  // Execution state
  current_work_items: WorkItem[];
  completed_work_ids: string[];

  // Resources (loaded from DB)
  available_agents: Agent[];
  available_templates: PromptTemplate[];

  // Output
  final_output?: unknown;
  error?: string;

  // Current decision (for routing)
  decision?: string;

  // Reasoning (for tracing)
  reasoning?: string;

  // Tracing
  trace_id: string;

  // Token Usage & Cost Tracking
  // Each operation is stored separately for client visibility and auditing
  token_usage: LLMOperation[];
}

// =============================================================================
// MODEL CONFIGURATION
// =============================================================================

/**
 * Agent type for model selection.
 */
export type AgentType =
  | "main_agent"
  | "planning_agent"
  | "plan_verifier"
  | "prompt_agent"
  | "summarization";

/**
 * Model configuration for each agent type.
 */
export const MODEL_CONFIG: Record<AgentType, string> = {
  main_agent: "anthropic/claude-sonnet-4",
  planning_agent: "anthropic/claude-sonnet-4",
  plan_verifier: "anthropic/claude-sonnet-4",
  prompt_agent: "anthropic/claude-3.5-haiku",
  summarization: "google/gemini-2.5-flash",
} as const;

/**
 * Alternative models for fallback.
 */
export const MODEL_ALTERNATIVES: Record<AgentType, string[]> = {
  main_agent: ["openai/gpt-4o", "google/gemini-2.5-pro"],
  planning_agent: ["openai/gpt-4o", "google/gemini-2.5-pro"],
  plan_verifier: ["openai/gpt-4o-mini", "anthropic/claude-3.5-haiku"],
  prompt_agent: ["openai/gpt-4o-mini", "google/gemini-2.5-flash"],
  summarization: ["openai/gpt-4o-mini", "meta-llama/llama-3.1-8b-instruct"],
} as const;

// =============================================================================
// OPENROUTER PRICING
// =============================================================================

/**
 * OpenRouter pricing per million tokens (approximate).
 * Actual costs come from OpenRouter response.
 */
export const OPENROUTER_PRICING: Record<
  string,
  { input: number; output: number }
> = {
  "anthropic/claude-sonnet-4": { input: 3.0, output: 15.0 },
  "anthropic/claude-3.5-haiku": { input: 0.8, output: 4.0 },
  "google/gemini-2.5-flash": { input: 0.075, output: 0.3 },
  "google/gemini-2.5-pro": { input: 1.25, output: 10.0 },
  "openai/gpt-4o": { input: 2.5, output: 10.0 },
  "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
  "meta-llama/llama-3.1-8b-instruct": { input: 0.055, output: 0.055 },
} as const;

// =============================================================================
// CHECKPOINT TYPES
// =============================================================================

/**
 * Graph checkpoint metadata.
 */
export interface GraphCheckpointMetadata {
  step: number;
  timestamp: Date;
  node_name: string;
}

/**
 * Graph checkpoint structure (stored in MongoDB).
 */
export interface GraphCheckpoint {
  thread_id: string;
  checkpoint_id: string;
  parent_id: string | null;
  checkpoint: OrchestrationState;
  metadata: GraphCheckpointMetadata;
}

// =============================================================================
// TRACING TYPES
// =============================================================================

/**
 * Node name for tracing.
 */
export type TracedNodeName =
  | "main"
  | "planning"
  | "plan_verifier"
  | "prompt";

/**
 * API node name for tracing (non-LLM nodes).
 */
export type ApiNodeName = "galileo_verify" | "payment" | "dispatch_and_poll";
