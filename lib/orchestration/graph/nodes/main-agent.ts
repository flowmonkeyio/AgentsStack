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
import type { WorkItem, ActionItem, Agent, PromptTemplate } from "@/types";
import type { OrchestrationState } from "../types";
import {
  getActionableTodos,
  allTodosCompleted,
  synthesizeOutput,
} from "../utils";
import { getDiscoveryService, type RerankResult } from "@/lib/orchestration/discovery";
import { getDatabaseClient } from "@/lib/db";

const logger = createLogger("graph");

// =============================================================================
// DISCOVERY HELPERS
// =============================================================================

/**
 * Convert a RerankResult from discovery to an Agent type.
 * Note: Some fields like wallet and url need to be fetched from DB if needed.
 */
function rerankResultToAgent(result: RerankResult): Agent {
  return {
    agent_id: result.agent_id,
    name: result.name,
    capabilities: result.capabilities,
    capabilities_embedding: [], // Not needed for planning
    url: "", // Not available from discovery, will be fetched when dispatching
    wallet: "", // Not available from discovery, will be fetched when dispatching
    pricing: {
      base_price: result.base_price,
      negotiable: false,
      min_price: result.base_price * 0.8, // Assume 20% negotiable
    },
    stats: {
      avg_score: result.stats.avg_score,
      jobs_completed: result.stats.jobs_completed,
      avg_response_time_ms: 0, // Not available from discovery
    },
    supports_async: true,
    supports_callback: true,
    registered_at: new Date(),
  };
}

/**
 * Discover available agents for a task using the discovery service.
 *
 * @param ctx - Request context
 * @param prompt - Task description for agent discovery
 * @param budget - Budget constraint
 * @returns Array of discovered agents
 */
async function discoverAgentsForTask(
  ctx: RequestContext,
  prompt: string,
  budget: number
): Promise<Agent[]> {
  logger.info(ctx, `operation=discover_agents prompt_length=${prompt.length} budget=${budget}`);

  try {
    const discoveryService = getDiscoveryService();

    const result = await discoveryService.discoverAgents(ctx, {
      task_description: prompt,
      max_price: budget,
      min_quality: 0.7, // Minimum quality threshold
      limit: 20, // Get up to 20 agents
    });

    const agents = result.candidates.map(rerankResultToAgent);

    logger.info(ctx, `operation=discover_agents candidates_found=${agents.length} search_time_ms=${result.search_time_ms} total_cost=${result.total_cost.toFixed(6)}`);

    return agents;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(ctx, `operation=discover_agents status=failed error="${message}"`, error instanceof Error ? error : undefined);
    // Return empty array on error - planning will proceed without agent recommendations
    return [];
  }
}

/**
 * Fetch available prompt templates from the database.
 * Fetches templates for common agent types.
 *
 * @param ctx - Request context
 * @returns Array of available templates
 */
async function fetchPromptTemplates(ctx: RequestContext): Promise<PromptTemplate[]> {
  logger.debug(ctx, `operation=fetch_prompt_templates`);

  try {
    const db = getDatabaseClient();

    // Fetch templates for common agent types
    const agentTypes = ["content", "design", "code", "research", "generic"];
    const templatePromises = agentTypes.map((type) =>
      db.getTemplatesByType(ctx, type).catch(() => [])
    );

    const templateArrays = await Promise.all(templatePromises);
    const templates = templateArrays.flat();

    // Deduplicate by template_id
    const uniqueTemplates = Array.from(
      new Map(templates.map((t) => [t.template_id, t])).values()
    );

    logger.debug(ctx, `operation=fetch_prompt_templates count=${uniqueTemplates.length}`);
    return uniqueTemplates;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(ctx, `operation=fetch_prompt_templates status=failed error="${message}"`);
    return [];
  }
}

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
  // First, discover agents and fetch templates if not already populated
  if ((state.trigger === "new_job" || state.trigger === "continue") && !state.plan) {
    const reason = state.trigger === "new_job"
      ? "new_job_no_plan"
      : "continuation_no_plan";

    logger.info(ctx, `operation=main_agent job_id=${state.job_id} decision=call_planning reason=${reason}`);

    // Discover agents if not already populated
    let availableAgents = state.available_agents;
    let availableTemplates = state.available_templates;

    if (availableAgents.length === 0) {
      logger.info(ctx, `operation=main_agent job_id=${state.job_id} action=discovering_agents`);
      const prompt = state.continuation_prompt ?? state.prompt;
      const [agents, templates] = await Promise.all([
        discoverAgentsForTask(ctx, prompt, state.budget),
        fetchPromptTemplates(ctx),
      ]);
      availableAgents = agents;
      availableTemplates = templates;
      logger.info(ctx, `operation=main_agent job_id=${state.job_id} discovered_agents=${agents.length} templates=${templates.length}`);
    }

    const reasoning = state.trigger === "new_job"
      ? "New job, need to create plan"
      : `Continuation requested: "${state.continuation_prompt}"`;

    return {
      decision: "call_planning",
      reasoning,
      available_agents: availableAgents,
      available_templates: availableTemplates,
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
