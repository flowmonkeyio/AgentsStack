/**
 * Main Agent Node
 *
 * Orchestrator that decides the next action in the graph.
 * This is the central decision point for job execution.
 *
 * Decisions:
 * - call_planning: Need to create/update plan
 * - execute_work: Execute actionable TODOs
 * - job_completed: All TODOs done
 * - job_failed: Error state
 *
 * @see /docs/designs/orchestration/graph/TECH_DESIGN.md
 */

import type { RequestContext } from "@/lib/logging";
import { createLogger } from "@/lib/logging";
import type { WorkItem, ActionItem } from "@/types";
import type { OrchestrationState } from "../types";
import {
  getActionableTodos,
  allTodosCompleted,
  synthesizeOutput,
} from "../utils";

const logger = createLogger("graph");

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Work item created from an action item for execution.
 */
interface CreatedWorkItem {
  work_id: string;
  job_id: string;
  plan_id: string;
  action_item_id: number;
  status: "pending";
  attempt: number;
  max_attempts: number;
  action: {
    item: string;
    deliverable_id: string;
    requirements: string[];
  };
  agent: {
    agent_id: string;
    name: string;
    url: string;
    price: number;
  } | null;
  prompt: null;
  external_ref: null;
  output: null;
  verification: null;
  retry_context: null;
  payment: null;
  token_usage: {
    internal: [];
    external: null;
    total_internal_cost_usd: number;
    total_external_cost_usd: number;
    total_cost_usd: number;
  };
  retries: [];
  created_at: Date;
  started_at: null;
  completed_at: null;
}

// =============================================================================
// WORK ITEM CREATION
// =============================================================================

/**
 * Generate a unique work ID.
 */
function generateWorkId(): string {
  return `work_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Create a work item from an action item.
 *
 * @param actionItem - Action item from plan
 * @param state - Current graph state
 * @returns Created work item
 */
function createWorkItem(
  actionItem: ActionItem,
  state: OrchestrationState
): CreatedWorkItem {
  // Find the agent for this action item
  const agent = state.available_agents.find(
    (a) => a.agent_id === actionItem.agent_id
  );

  return {
    work_id: generateWorkId(),
    job_id: state.job_id,
    plan_id: state.plan ? `plan_${state.job_id}_v${state.plan_verification_attempts}` : "",
    action_item_id: actionItem.id,
    status: "pending",
    attempt: 1,
    max_attempts: 3,
    action: {
      item: actionItem.item,
      deliverable_id: actionItem.deliverable_id,
      requirements: [], // Will be filled by prompt agent
    },
    agent: agent
      ? {
          agent_id: agent.agent_id,
          name: agent.name,
          url: agent.url,
          price: agent.pricing.base_price,
        }
      : null,
    prompt: null,
    external_ref: null,
    output: null,
    verification: null,
    retry_context: null,
    payment: null,
    token_usage: {
      internal: [],
      external: null,
      total_internal_cost_usd: 0,
      total_external_cost_usd: 0,
      total_cost_usd: 0,
    },
    retries: [],
    created_at: new Date(),
    started_at: null,
    completed_at: null,
  };
}

// =============================================================================
// NODE IMPLEMENTATION
// =============================================================================

/**
 * Main Agent Node Implementation
 *
 * Orchestrator - decides next action based on current state.
 *
 * Decision logic:
 * 1. If new_job/continue trigger and no plan -> call_planning
 * 2. If plan exists and has actionable TODOs -> execute_work
 * 3. If all TODOs completed -> job_completed
 * 4. Otherwise -> job_failed (stuck state)
 *
 * @param ctx - Request context for logging
 * @param state - Current graph state
 * @returns Partial state update with decision
 */
async function mainAgentNodeImpl(
  ctx: RequestContext,
  state: OrchestrationState
): Promise<Partial<OrchestrationState>> {
  logger.info(ctx, `operation=main_agent job_id=${state.job_id} trigger=${state.trigger}`);

  // Case 1: New job or continuation without a plan -> call planning
  if (state.trigger === "new_job" && !state.plan) {
    logger.info(ctx, `operation=main_agent job_id=${state.job_id} decision=call_planning reason=new_job_no_plan`);
    return {
      decision: "call_planning",
      reasoning: "New job, need to create plan",
    };
  }

  if (state.trigger === "continue" && !state.plan) {
    logger.info(ctx, `operation=main_agent job_id=${state.job_id} decision=call_planning reason=continuation_no_plan`);
    return {
      decision: "call_planning",
      reasoning: `Continuation requested: "${state.continuation_prompt}"`,
    };
  }

  // Case 2: Recovery trigger - resume from checkpoint
  if (state.trigger === "recover") {
    // For recovery, check if we have work in progress
    const inProgressWork = state.current_work_items.filter(
      (w) => w.status !== "completed" && w.status !== "failed"
    );

    if (inProgressWork.length > 0) {
      logger.info(ctx, `operation=main_agent job_id=${state.job_id} decision=execute_work reason=recovery_in_progress work_count=${inProgressWork.length}`);
      return {
        decision: "execute_work",
        reasoning: `Recovery: resuming ${inProgressWork.length} in-progress work items`,
      };
    }

    // No in-progress work, check for actionable TODOs
    if (state.plan) {
      const actionable = getActionableTodos(state.plan, state.completed_work_ids);
      if (actionable.length > 0) {
        const workItems = actionable.map((todo) => createWorkItem(todo, state));
        logger.info(ctx, `operation=main_agent job_id=${state.job_id} decision=execute_work reason=recovery_actionable_todos count=${actionable.length}`);
        return {
          decision: "execute_work",
          current_work_items: workItems as unknown as WorkItem[],
          reasoning: `Recovery: executing ${actionable.length} actionable TODOs`,
        };
      }
    }
  }

  // Case 3: Plan exists - check for actionable work
  if (state.plan) {
    const actionable = getActionableTodos(state.plan, state.completed_work_ids);

    if (actionable.length > 0) {
      // Create work items for actionable TODOs
      const workItems = actionable.map((todo) => createWorkItem(todo, state));

      logger.info(ctx, `operation=main_agent job_id=${state.job_id} decision=execute_work actionable_count=${actionable.length}`);
      return {
        decision: "execute_work",
        current_work_items: workItems as unknown as WorkItem[],
        reasoning: `Executing ${actionable.length} actionable TODOs`,
      };
    }

    // Case 4: All TODOs completed
    if (allTodosCompleted(state.plan, state.completed_work_ids)) {
      const output = synthesizeOutput(state);
      logger.info(ctx, `operation=main_agent job_id=${state.job_id} decision=job_completed completed_count=${state.completed_work_ids.length}`);
      return {
        decision: "job_completed",
        final_output: output,
        reasoning: "All TODOs completed successfully",
      };
    }
  }

  // Case 5: Stuck state - no actionable items and job not complete
  logger.warn(ctx, `operation=main_agent job_id=${state.job_id} decision=job_failed reason=stuck_state`);
  return {
    decision: "job_failed",
    error: "No actionable items but job not complete",
    reasoning: "Stuck state - no progress possible",
  };
}

/**
 * Exported main agent node (without tracing wrapper - tracing applied in graph.ts)
 */
export const mainAgentNode = mainAgentNodeImpl;

/**
 * Re-export for direct use
 */
export { mainAgentNodeImpl };

/**
 * Export helper for testing
 */
export { createWorkItem };
