/**
 * Work Lifecycle Types
 *
 * Contains all type definitions for the work lifecycle module including:
 * - Transition triggers and payloads
 * - State machine types
 * - Parallel execution types
 * - Event types
 *
 * @see /docs/designs/orchestration/work-lifecycle/TECH_DESIGN.md
 */

import type { RequestContext } from "@/lib/logging";
import type {
  WorkItem,
  WorkItemStatus,
  ActionItem,
  Agent,
  CriteriaResult,
  Plan,
} from "@/types";

// =============================================================================
// TRANSITION TRIGGER TYPES
// =============================================================================

/**
 * Union type of all valid transition triggers
 */
export type TransitionTrigger =
  | "dependencies_met"
  | "picked_up"
  | "prompt_generated"
  | "async_response"
  | "sync_response"
  | "poll_completed"
  | "poll_timeout"
  | "retry_dispatch"
  | "max_stale_retries"
  | "start_verification"
  | "verification_pass"
  | "verification_retry"
  | "verification_reject"
  | "retry_initiated"
  | "try_new_agent"
  | "no_alternatives"
  | "agent_reassigned"
  | "start_payment"
  | "payment_confirmed"
  | "payment_failed"
  | "retry_payment"
  | "max_payment_retries";

// =============================================================================
// PAYLOAD INTERFACES FOR EACH TRIGGER
// =============================================================================

/**
 * Payload for "prompt_generated" trigger
 */
export interface PromptGeneratedPayload {
  generated_prompt: string;
  requirements: string[];
  context_used: {
    summary: string;
    refs_fetched: string[];
  };
}

/**
 * Payload for "async_response" trigger (agent returned async reference)
 */
export interface AsyncResponsePayload {
  reference_id: string;
  status_url: string;
  callback_url?: string;
}

/**
 * Payload for "sync_response" trigger (agent returned immediate result)
 */
export interface SyncResponsePayload {
  output: {
    title: string;
    description: string;
    content: unknown;
  };
}

/**
 * Payload for "poll_completed" trigger
 */
export interface PollCompletedPayload {
  output: {
    title: string;
    description: string;
    content: unknown;
  };
}

/**
 * Payload for verification triggers (pass, retry, reject)
 */
export interface VerificationPayload {
  score: number;
  reasoning: string;
  criteria_results: CriteriaResult[];
  issues: string[];
}

/**
 * Extended payload for verification_retry (includes retry context)
 */
export interface VerificationRetryPayload extends VerificationPayload {
  previous_output: unknown;
  suggestions: string[];
}

/**
 * Payload for "try_new_agent" trigger
 */
export interface TryNewAgentPayload {
  alternative_agents: Agent[];
}

/**
 * Payload for "agent_reassigned" trigger
 */
export interface AgentReassignedPayload {
  new_agent: {
    agent_id: string;
    name: string;
    url: string;
    price: number;
  };
}

/**
 * Payload for "payment_confirmed" trigger
 */
export interface PaymentConfirmedPayload {
  amount: number;
  tx_hash: string;
}

// =============================================================================
// TRANSITION PAYLOAD TYPE MAP
// =============================================================================

/**
 * Maps each trigger to its payload type.
 * Triggers with undefined payload require no additional data.
 */
export interface TransitionPayloadMap {
  dependencies_met: undefined;
  picked_up: undefined;
  prompt_generated: PromptGeneratedPayload;
  async_response: AsyncResponsePayload;
  sync_response: SyncResponsePayload;
  poll_completed: PollCompletedPayload;
  poll_timeout: undefined;
  retry_dispatch: undefined;
  max_stale_retries: undefined;
  start_verification: undefined;
  verification_pass: VerificationPayload;
  verification_retry: VerificationRetryPayload;
  verification_reject: VerificationPayload;
  retry_initiated: undefined;
  try_new_agent: TryNewAgentPayload;
  no_alternatives: undefined;
  agent_reassigned: AgentReassignedPayload;
  start_payment: undefined;
  payment_confirmed: PaymentConfirmedPayload;
  payment_failed: undefined;
  retry_payment: undefined;
  max_payment_retries: undefined;
}

/**
 * Helper type to get payload type for a trigger
 */
export type PayloadFor<T extends TransitionTrigger> = TransitionPayloadMap[T];

// =============================================================================
// TRANSITION INTERFACE
// =============================================================================

/**
 * Generic transition definition with typed payload.
 * The guard and execute functions receive the correct payload type for their trigger.
 */
export interface Transition<T extends TransitionTrigger = TransitionTrigger> {
  from: WorkItemStatus;
  to: WorkItemStatus;
  trigger: T;
  guard?: (work: WorkItem, payload: PayloadFor<T>) => boolean;
  guardName?: string;
  execute: (work: WorkItem, payload: PayloadFor<T>) => Partial<WorkItem>;
}

/**
 * Helper to create a typed transition.
 * This preserves the specific trigger type for proper payload inference.
 */
export function defineTransition<T extends TransitionTrigger>(
  transition: Transition<T>
): Transition<T> {
  return transition;
}

/**
 * Type for the transitions array - allows any trigger type.
 */
export type AnyTransition = {
  [K in TransitionTrigger]: Transition<K>;
}[TransitionTrigger];

// =============================================================================
// TRANSITION RESULT
// =============================================================================

/**
 * Result of a state transition
 */
export interface TransitionResult {
  success: boolean;
  new_status?: WorkItemStatus;
  error?: string;
  event?: WorkLifecycleEvent;
}

// =============================================================================
// EVENTS
// =============================================================================

/**
 * Events emitted by the work lifecycle module
 */
export type WorkLifecycleEvent =
  | { type: "work:created"; work_id: string; action_item_id: number }
  | { type: "work:status_changed"; work_id: string; status: WorkItemStatus }
  | { type: "work:retry"; work_id: string; attempt: number; reason: string; issues: string[] }
  | { type: "work:failed"; work_id: string; reason: string }
  | { type: "todo:spawned"; parent_id: number; new_todos: ActionItem[] };

// =============================================================================
// RETRY LIMITS
// =============================================================================

/**
 * Retry limits for different failure scenarios
 */
export interface RetryLimits {
  verification_retries: number;
  stale_retries: number;
  payment_retries: number;
  agent_reassignments: number;
}

/**
 * Default retry limits
 */
export const DEFAULT_RETRY_LIMITS: RetryLimits = {
  verification_retries: 3,
  stale_retries: 3,
  payment_retries: 3,
  agent_reassignments: 2,
};

/**
 * Retry type for canRetry check
 */
export type RetryType = keyof RetryLimits;

// =============================================================================
// PARALLEL EXECUTION TYPES
// =============================================================================

/**
 * Result of executing a single work item
 */
export interface WorkExecutionResult {
  work_id: string;
  success: boolean;
  error?: string;
}

// =============================================================================
// SPAWN TYPES
// =============================================================================

/**
 * Request to spawn new TODO items from a parent TODO.
 */
export interface SpawnRequest {
  job_id: string;
  plan_id: string;
  parent_todo_id: number;
  new_todos: Array<{
    item: string;
    priority: number;
    depends_on: number[];
    deliverable_id: string;
    agent_id: string | null;
    template_id: string;
    resource_type: "AGENT" | "SELF";
    estimated_cost: number;
  }>;
}

/**
 * Result of spawning new TODOs
 */
export interface SpawnResult {
  spawned_items: ActionItem[];
  created_work_ids: string[];
}

/**
 * Output structure that may trigger spawning (for list-type outputs)
 */
export interface SpawnableOutput {
  items?: Array<{ name: string; [key: string]: unknown }>;
  needs_detail?: boolean;
}

/**
 * Definition for a new TODO to spawn
 */
export interface SpawnedTodoDefinition {
  item: string;
  priority: number;
}

/**
 * A spawn trigger defines when and what new TODOs to create.
 */
export interface SpawnTrigger {
  /** Unique identifier for this trigger */
  id: string;
  /** Human-readable description */
  description: string;
  /** Condition function - returns true if trigger should fire */
  condition: (work: WorkItem, output: SpawnableOutput) => boolean;
  /** Generate new TODO definitions when condition is met */
  spawn: (work: WorkItem, output: SpawnableOutput) => SpawnedTodoDefinition[];
}

// =============================================================================
// CONTINUATION TYPES
// =============================================================================

/**
 * Action types for user continuation flows
 */
export type ContinuationActionType =
  | "CREATE_NEW"
  | "MODIFY_EXISTING"
  | "REPLACE_EXISTING"
  | "RERUN_WITH_CONTEXT";

/**
 * Extended WorkItem data for continuation scenarios.
 * Includes action type and reference to original work.
 */
export interface ContinuationWorkItemData {
  action_type: ContinuationActionType;
  original_work_id?: string;
  modification_context?: {
    specific_item: string;
    current_value: unknown;
  };
}

/**
 * Extended ActionItem for continuation scenarios.
 */
export interface ContinuationActionItem extends ActionItem {
  action_type: ContinuationActionType;
  original_work_id?: string;
  specific_item?: string;
  current_value?: unknown;
}

/**
 * Continuation events
 */
export type ContinuationEvent =
  | { type: "continuation:started"; job_id: string; user_message: string }
  | { type: "continuation:planning"; job_id: string }
  | { type: "continuation:work_created"; work_id: string; action_type: ContinuationActionType }
  | { type: "continuation:superseded"; original_work_id: string; new_work_id: string }
  | { type: "continuation:version_complete"; job_id: string; version: number };

// =============================================================================
// CASCADE TYPES
// =============================================================================

/**
 * Result of cascade analysis
 */
export interface CascadeAnalysisResult {
  needs_cascade: boolean;
  items_to_rerun: number[];
}

/**
 * Input for cascade decision LLM call
 */
export interface CascadeDecisionInput {
  task: string;
  modified_item: WorkItem["action"];
  modification_description: string;
  dependents: Array<{ id: number; item: string }>;
  question: string;
}

// =============================================================================
// REASSIGNMENT TYPES
// =============================================================================

/**
 * Criteria for agent reassignment
 */
export interface ReassignmentCriteria {
  /** Agents that have already failed for this work item */
  excluded_agent_ids: string[];
  /** Minimum quality score required (hard constraint) */
  min_quality_score: number;
  /** Required capabilities that must match */
  capabilities: string[];
  /** Prioritize quality over price */
  prefer_higher_quality: boolean;
}

/**
 * Maximum number of agent reassignments allowed
 */
export const MAX_REASSIGNMENTS = 2;

// =============================================================================
// WORK LIFECYCLE INTERFACE
// =============================================================================

/**
 * WorkLifecycle interface - the main API for work item state management.
 * All methods use DatabaseClient internally (injected via constructor).
 * All public methods take RequestContext as the first argument for tracing.
 */
export interface IWorkLifecycle {
  /**
   * Execute a state transition for a work item.
   * Uses typed triggers and payloads.
   *
   * @param ctx - Request context for tracing
   * @param work_id - The work item ID
   * @param trigger - The transition trigger
   * @param payload - Optional payload (type depends on trigger)
   */
  transition<T extends TransitionTrigger>(
    ctx: RequestContext,
    work_id: string,
    trigger: T,
    payload?: PayloadFor<T>
  ): Promise<TransitionResult>;

  /**
   * Get all work items that are ready for execution.
   * Returns items in "ready" status for the given job.
   *
   * @param ctx - Request context for tracing
   * @param job_id - The job ID
   */
  getActionable(ctx: RequestContext, job_id: string): Promise<WorkItem[]>;

  /**
   * Check if a work item can retry for a specific retry type.
   *
   * @param ctx - Request context for tracing
   * @param work_id - The work item ID
   * @param type - The type of retry to check
   */
  canRetry(ctx: RequestContext, work_id: string, type: RetryType): Promise<boolean>;

  /**
   * Spawn new TODO items from a parent TODO.
   *
   * @param ctx - Request context for tracing
   * @param request - The spawn request
   */
  spawnTodos(ctx: RequestContext, request: SpawnRequest): Promise<SpawnResult>;

  /**
   * Check if a work item's dependencies are satisfied.
   * If all dependencies are completed, transitions to "ready".
   *
   * @param ctx - Request context for tracing
   * @param work_id - The work item to check
   * @param plan - The plan containing action items
   */
  checkDependencies(ctx: RequestContext, work_id: string, plan: Plan): Promise<void>;

  /**
   * Called when a work item completes.
   * Checks all pending items that depend on this one.
   *
   * @param ctx - Request context for tracing
   * @param work_id - The completed work item ID
   * @param plan - The plan containing action items
   */
  onWorkCompleted(ctx: RequestContext, work_id: string, plan: Plan): Promise<void>;
}
