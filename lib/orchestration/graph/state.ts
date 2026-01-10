/**
 * LangGraph State Definition for Orchestration
 *
 * Defines the state annotation and initial state factory for the orchestration graph.
 * Uses LangGraph's Annotation system for type-safe state management.
 *
 * @see /docs/designs/orchestration/graph/TECH_DESIGN.md
 */

import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import type { RequestContext } from "@/lib/logging";
import { createLogger } from "@/lib/logging";

const logger = createLogger("graph");
import type {
  LLMOperation,
  Agent,
  PromptTemplate,
  WorkItem,
} from "@/types";
import type {
  GraphTrigger,
  ContextRef,
  PlanningAgentOutput,
  PlanVerifierOutput,
} from "./types";

// =============================================================================
// STATE ANNOTATION
// =============================================================================

/**
 * LangGraph state annotation for the orchestration workflow.
 *
 * This defines the full state schema that flows through all graph nodes.
 * Each node receives the full state and returns a partial update.
 *
 * Key state groups:
 * - Job context: job_id, user_id, trigger
 * - Planning inputs: prompt, budget, context
 * - Continuation: continuation_prompt, context_summary, context_refs
 * - Plan state: plan, plan_verification, plan_verification_attempts
 * - Execution state: current_work_items, completed_work_ids
 * - Resources: available_agents, available_templates
 * - Output: final_output, error
 * - Routing: decision, reasoning
 * - Tracing: trace_id, token_usage
 */
export const OrchestrationStateAnnotation = Annotation.Root({
  // Include messages for LangGraph compatibility (optional but useful for tracing)
  ...MessagesAnnotation.spec,

  // ==========================================================================
  // JOB CONTEXT
  // ==========================================================================

  /** Unique job identifier */
  job_id: Annotation<string>,

  /** User who owns this job */
  user_id: Annotation<string>,

  /** How this graph invocation was triggered */
  trigger: Annotation<GraphTrigger>,

  // ==========================================================================
  // PLANNING INPUTS
  // ==========================================================================

  /** User's original prompt */
  prompt: Annotation<string>,

  /** Budget constraint in USD */
  budget: Annotation<number>,

  /** Optional additional context */
  context: Annotation<Record<string, unknown> | undefined>,

  // ==========================================================================
  // CONTINUATION
  // ==========================================================================

  /** User's continuation prompt (for continue trigger) */
  continuation_prompt: Annotation<string | undefined>,

  /** Rolling summary of job context (~100 words) */
  context_summary: Annotation<string | undefined>,

  /** References to completed work items */
  context_refs: Annotation<ContextRef[] | undefined>,

  // ==========================================================================
  // PLAN STATE
  // ==========================================================================

  /** Current plan from planning agent */
  plan: Annotation<PlanningAgentOutput | undefined>,

  /** Plan verification result */
  plan_verification: Annotation<PlanVerifierOutput | undefined>,

  /** Number of plan verification attempts (max 3) */
  plan_verification_attempts: Annotation<number>,

  /** Feedback from failed verification (for retry) */
  plan_verification_feedback: Annotation<string[] | undefined>,

  // ==========================================================================
  // EXECUTION STATE
  // ==========================================================================

  /** Work items currently being processed */
  current_work_items: Annotation<WorkItem[]>,

  /** IDs of completed work items */
  completed_work_ids: Annotation<string[]>,

  // ==========================================================================
  // RESOURCES (loaded from DB)
  // ==========================================================================

  /** Available agents from discovery */
  available_agents: Annotation<Agent[]>,

  /** Available prompt templates */
  available_templates: Annotation<PromptTemplate[]>,

  // ==========================================================================
  // OUTPUT
  // ==========================================================================

  /** Final synthesized output (on completion) */
  final_output: Annotation<unknown>,

  /** Error message (on failure) */
  error: Annotation<string | undefined>,

  // ==========================================================================
  // ROUTING
  // ==========================================================================

  /** Current decision for routing to next node */
  decision: Annotation<string | undefined>,

  /** Reasoning for current decision (for tracing) */
  reasoning: Annotation<string | undefined>,

  // ==========================================================================
  // TRACING
  // ==========================================================================

  /** LangSmith trace ID */
  trace_id: Annotation<string>,

  /** Token usage - stored per operation for billing transparency */
  token_usage: Annotation<LLMOperation[]>,
});

/**
 * Type alias for the orchestration state.
 */
export type OrchestrationState = typeof OrchestrationStateAnnotation.State;

// =============================================================================
// INITIAL STATE FACTORY
// =============================================================================

/**
 * Create initial state for a new job.
 *
 * @param ctx - Request context for logging
 * @param job_id - Unique job identifier
 * @param user_id - User who owns this job
 * @param prompt - User's prompt
 * @param budget - Budget constraint in USD
 * @param trace_id - LangSmith trace ID
 * @returns Initial graph state
 */
export function createInitialOrchestrationState(
  ctx: RequestContext,
  job_id: string,
  user_id: string,
  prompt: string,
  budget: number,
  trace_id: string
): Partial<OrchestrationState> {
  logger.info(ctx, `operation=create_initial_state job_id=${job_id} user_id=${user_id} budget=${budget}`);
  return {
    job_id,
    user_id,
    trigger: "new_job",
    prompt,
    budget,
    context: undefined,
    continuation_prompt: undefined,
    context_summary: undefined,
    context_refs: undefined,
    plan: undefined,
    plan_verification: undefined,
    plan_verification_attempts: 0,
    plan_verification_feedback: undefined,
    current_work_items: [],
    completed_work_ids: [],
    available_agents: [],
    available_templates: [],
    final_output: undefined,
    error: undefined,
    decision: undefined,
    reasoning: undefined,
    trace_id,
    token_usage: [],
  };
}

/**
 * Create initial state for a continuation.
 *
 * @param ctx - Request context for logging
 * @param job_id - Job ID being continued
 * @param user_id - User who owns this job
 * @param continuation_prompt - User's continuation prompt
 * @param context_summary - Rolling summary of prior work
 * @param context_refs - References to prior work items
 * @param budget - Remaining budget
 * @param trace_id - LangSmith trace ID
 * @returns Initial graph state for continuation
 */
export function createContinuationState(
  ctx: RequestContext,
  job_id: string,
  user_id: string,
  continuation_prompt: string,
  context_summary: string,
  context_refs: ContextRef[],
  budget: number,
  trace_id: string
): Partial<OrchestrationState> {
  logger.info(ctx, `operation=create_continuation_state job_id=${job_id} user_id=${user_id} budget=${budget} context_refs_count=${context_refs.length}`);
  return {
    job_id,
    user_id,
    trigger: "continue",
    prompt: continuation_prompt, // Use continuation prompt as main prompt
    budget,
    context: undefined,
    continuation_prompt,
    context_summary,
    context_refs,
    plan: undefined,
    plan_verification: undefined,
    plan_verification_attempts: 0,
    plan_verification_feedback: undefined,
    current_work_items: [],
    completed_work_ids: [],
    available_agents: [],
    available_templates: [],
    final_output: undefined,
    error: undefined,
    decision: undefined,
    reasoning: undefined,
    trace_id,
    token_usage: [],
  };
}

/**
 * Create initial state for recovery.
 *
 * Note: For recovery, we typically load the full state from checkpoint.
 * This function creates a minimal state if needed.
 *
 * @param ctx - Request context for logging
 * @param job_id - Job ID being recovered
 * @param trace_id - LangSmith trace ID
 * @returns Minimal state for recovery
 */
export function createRecoveryState(
  ctx: RequestContext,
  job_id: string,
  trace_id: string
): Partial<OrchestrationState> {
  logger.info(ctx, `operation=create_recovery_state job_id=${job_id}`);
  return {
    job_id,
    trigger: "recover",
    trace_id,
    // Rest loaded from checkpoint
  };
}
