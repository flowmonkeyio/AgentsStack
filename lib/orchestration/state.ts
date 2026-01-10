/**
 * LangGraph State Definition
 *
 * Defines the state structure for the orchestration graph.
 *
 * @see /docs/ORCH_GRAPH.md
 * @see /docs/designs/core-data-structure/TECH_DESIGN.md
 */

import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import type { Job, Plan, ActionItem, LLMOperation, ReasoningEntry } from "@/types";

/**
 * LangGraph state for job orchestration.
 * Matches the GraphState defined in ORCH_GRAPH.md
 */
export const JobStateAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,

  // Job context
  job_id: Annotation<string>,
  user_id: Annotation<string>,
  prompt: Annotation<string>,
  status: Annotation<Job["status"]>,

  // Budget
  budget: Annotation<Job["budget"]>,

  // Planning
  plan: Annotation<Plan | null>,
  current_action_item: Annotation<ActionItem | null>,

  // Token usage tracking
  token_usage: Annotation<{
    operations: LLMOperation[];
    total_internal_cost_usd: number;
  }>,

  // Reasoning log
  reasoning_log: Annotation<ReasoningEntry[]>,

  // Context
  context_summary: Annotation<string>,

  // Execution tracking
  completed_actions: Annotation<number[]>,
  failed_actions: Annotation<number[]>,

  // Agent discovery
  discovered_agents: Annotation<Array<{ agent_id: string; score: number }>>,
  selected_agent_id: Annotation<string | null>,

  // Current work
  current_prompt: Annotation<string | null>,
  current_result: Annotation<unknown>,
  verification_result: Annotation<{
    score: number;
    passed: boolean;
    issues: string[];
  } | null>,

  // Plan verification (for plan_verifier agent)
  plan_verification_passed: Annotation<boolean>,
  plan_verification_feedback: Annotation<string | null>,

  // Error handling
  error: Annotation<string | null>,
  retry_count: Annotation<number>,
});

export type JobState = typeof JobStateAnnotation.State;

/**
 * Create initial state for a new job.
 *
 * @param job_id - Job ID
 * @param user_id - User ID
 * @param prompt - User prompt
 * @param budget_total - Total budget in USD
 * @returns Initial graph state
 */
export function createInitialState(
  job_id: string,
  user_id: string,
  prompt: string,
  budget_total: number
): Partial<JobState> {
  return {
    job_id,
    user_id,
    prompt,
    status: "planning",
    budget: {
      total: budget_total,
      allocated: 0,
      spent: 0,
      remaining: budget_total,
    },
    plan: null,
    current_action_item: null,
    token_usage: {
      operations: [],
      total_internal_cost_usd: 0,
    },
    reasoning_log: [],
    context_summary: "",
    completed_actions: [],
    failed_actions: [],
    discovered_agents: [],
    selected_agent_id: null,
    current_prompt: null,
    current_result: null,
    verification_result: null,
    plan_verification_passed: false,
    plan_verification_feedback: null,
    error: null,
    retry_count: 0,
  };
}
