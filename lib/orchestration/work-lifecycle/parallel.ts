/**
 * Parallel Execution and Dynamic Spawning
 *
 * Handles parallel execution of work items and dynamic TODO spawning.
 * Uses DatabaseClient for all database operations.
 *
 * @see /docs/designs/orchestration/work-lifecycle/TECH_DESIGN.md
 */

import type { RequestContext } from "@/lib/logging";
import { createLogger } from "@/lib/logging";
import type { DatabaseClient } from "@/lib/db/database-client";
import type {
  WorkItem,
  Plan,
  ActionItem,
  Agent,
  WorkItemStatus,
} from "@/types";
import type {
  WorkExecutionResult,
  WorkLifecycleEvent,
  ContinuationActionItem,
  ContinuationActionType,
  CascadeAnalysisResult,
  CascadeDecisionInput,
  ReassignmentCriteria,
} from "./types";
import { MAX_REASSIGNMENTS } from "./types";
import { WorkLifecycle, type ExtendedDatabaseClient } from "./state-machine";

const logger = createLogger("work-lifecycle");

// =============================================================================
// DEPENDENCY RESOLUTION
// =============================================================================

/**
 * Get action items that have all dependencies satisfied.
 * Uses Plan's action_items and a set of completed action item IDs.
 *
 * @param ctx - Request context for tracing
 * @param plan - The plan containing action items
 * @param completedIds - Set of completed action item IDs
 * @returns Array of actionable items
 */
export function getActionableTodos(
  ctx: RequestContext,
  plan: Plan,
  completedIds: Set<number>
): ActionItem[] {
  const actionable = plan.action_items.filter((item) => {
    // Must be pending
    if (item.status !== "pending") return false;

    // All dependencies must be completed
    return item.depends_on.every((depId) => completedIds.has(depId));
  });

  logger.debug(ctx, `operation=get_actionable_todos plan_id=${plan.plan_id} total_items=${plan.action_items.length} actionable_count=${actionable.length}`);

  return actionable;
}

/**
 * Build a set of completed action item IDs from work items.
 *
 * @param ctx - Request context for tracing
 * @param workItems - Array of work items
 * @returns Set of completed action item IDs
 */
export function getCompletedActionItemIds(
  ctx: RequestContext,
  workItems: WorkItem[]
): Set<number> {
  const completedIds = new Set<number>();
  for (const work of workItems) {
    if (work.status === "completed") {
      completedIds.add(work.action_item_id);
    }
  }

  logger.debug(ctx, `operation=get_completed_action_item_ids total_work_items=${workItems.length} completed_count=${completedIds.size}`);

  return completedIds;
}

// =============================================================================
// PARALLEL EXECUTION
// =============================================================================

/**
 * Execute work item callback type
 */
export type ExecuteWorkItemFn = (work: WorkItem) => Promise<WorkExecutionResult>;

/**
 * Execute multiple work items in parallel.
 * Uses Promise.allSettled to ensure all items are attempted regardless of failures.
 *
 * @param ctx - Request context for tracing
 * @param lifecycle - WorkLifecycle instance for transitions
 * @param workItems - Work items to execute in parallel
 * @param executeWorkItem - Function that executes a single work item
 * @returns Array of execution results
 */
export async function executeParallel(
  ctx: RequestContext,
  lifecycle: WorkLifecycle,
  workItems: WorkItem[],
  executeWorkItem: ExecuteWorkItemFn
): Promise<WorkExecutionResult[]> {
  logger.info(ctx, `operation=execute_parallel_start work_item_count=${workItems.length}`);

  // Execute all items in parallel
  const promises = workItems.map((work) =>
    executeWorkItem(work).catch((error: Error) => ({
      work_id: work.work_id,
      success: false,
      error: error.message,
    }))
  );

  const results = await Promise.allSettled(promises);
  const executionResults: WorkExecutionResult[] = [];

  // Process results
  let successCount = 0;
  let failureCount = 0;
  for (const result of results) {
    if (result.status === "fulfilled") {
      executionResults.push(result.value);
      if (result.value.success) {
        successCount++;
      } else {
        failureCount++;
      }
    } else {
      // Unexpected rejection (executeWorkItem should not throw)
      logger.error(ctx, `operation=execute_parallel error=unexpected_rejection reason=${result.reason}`);
      failureCount++;
    }
  }

  logger.info(ctx, `operation=execute_parallel_complete total=${workItems.length} success=${successCount} failed=${failureCount}`);

  return executionResults;
}

/**
 * Get ready work items for a job and execute them in parallel.
 *
 * @param ctx - Request context for tracing
 * @param db - Extended DatabaseClient instance
 * @param lifecycle - WorkLifecycle instance
 * @param job_id - The job ID
 * @param executeWorkItem - Function that executes a single work item
 * @returns Array of execution results
 */
export async function executeReadyWorkItems(
  ctx: RequestContext,
  db: ExtendedDatabaseClient,
  lifecycle: WorkLifecycle,
  job_id: string,
  executeWorkItem: ExecuteWorkItemFn
): Promise<WorkExecutionResult[]> {
  // Get all ready work items
  const readyItems = await lifecycle.getActionable(ctx, job_id);

  if (readyItems.length === 0) {
    logger.debug(ctx, `operation=execute_ready_work_items job_id=${job_id} ready_count=0`);
    return [];
  }

  logger.info(ctx, `operation=execute_ready_work_items job_id=${job_id} ready_count=${readyItems.length}`);

  // Execute in parallel
  return executeParallel(ctx, lifecycle, readyItems, executeWorkItem);
}

// =============================================================================
// AGENT REASSIGNMENT
// =============================================================================

/**
 * Find an alternative agent for a failed work item.
 * Excludes agents that have already failed and applies quality/capability filters.
 *
 * @param ctx - Request context for tracing
 * @param work - The work item that needs a new agent
 * @param availableAgents - List of all available agents
 * @returns The best alternative agent or null if none found
 */
export function findAlternativeAgent(
  ctx: RequestContext,
  work: WorkItem,
  availableAgents: Agent[]
): Agent | null {
  // Get failed agent IDs for this work item from retries
  const failedAgentIds: string[] = [];
  for (const retry of work.retries) {
    if (retry.reason === "reassignment" && retry.agent_id) {
      failedAgentIds.push(retry.agent_id);
    }
  }
  // Add current agent to exclusion list
  if (work.agent?.agent_id) {
    failedAgentIds.push(work.agent.agent_id);
  }

  // Filter candidates
  const candidates = availableAgents.filter((agent) => {
    // Must not have already failed
    if (failedAgentIds.includes(agent.agent_id)) return false;

    // Must meet quality threshold (0.80)
    if (agent.stats.avg_score < 0.8) return false;

    // Note: Capability matching would require parsing work.action for required capabilities
    // For now, we assume all candidates have required capabilities
    // A full implementation would check: agent.capabilities includes all required caps

    return true;
  });

  if (candidates.length === 0) {
    logger.warn(ctx, `operation=find_alternative_agent work_id=${work.work_id} available_count=${availableAgents.length} excluded_count=${failedAgentIds.length} candidates=0`);
    return null;
  }

  // Sort by quality (since previous agent failed, prioritize quality)
  candidates.sort((a, b) => b.stats.avg_score - a.stats.avg_score);

  const selected = candidates[0];
  logger.info(ctx, `operation=find_alternative_agent work_id=${work.work_id} selected_agent=${selected.agent_id} score=${selected.stats.avg_score}`);

  return selected;
}

/**
 * Check if a work item can be reassigned to a new agent.
 * Limited by MAX_REASSIGNMENTS.
 *
 * @param ctx - Request context for tracing
 * @param work - The work item
 * @returns True if reassignment is possible
 */
export function canReassign(ctx: RequestContext, work: WorkItem): boolean {
  const reassignmentCount = work.retries.filter(
    (r) => r.reason === "reassignment"
  ).length;
  const canReassignResult = reassignmentCount < MAX_REASSIGNMENTS;

  logger.debug(ctx, `operation=can_reassign work_id=${work.work_id} reassignment_count=${reassignmentCount} max=${MAX_REASSIGNMENTS} can_reassign=${canReassignResult}`);

  return canReassignResult;
}

/**
 * Build reassignment criteria for a work item.
 *
 * @param ctx - Request context for tracing
 * @param work - The work item
 * @returns Reassignment criteria
 */
export function buildReassignmentCriteria(
  ctx: RequestContext,
  work: WorkItem
): ReassignmentCriteria {
  // Get all agent IDs that have failed for this work
  const excludedIds: string[] = [];
  for (const retry of work.retries) {
    if (retry.agent_id) {
      excludedIds.push(retry.agent_id);
    }
  }
  if (work.agent?.agent_id) {
    excludedIds.push(work.agent.agent_id);
  }

  logger.debug(ctx, `operation=build_reassignment_criteria work_id=${work.work_id} excluded_agent_count=${excludedIds.length}`);

  return {
    excluded_agent_ids: excludedIds,
    min_quality_score: 0.8,
    capabilities: [], // Would be derived from work.action.requirements
    prefer_higher_quality: true,
  };
}

// =============================================================================
// CONTINUATION WORK ITEMS
// =============================================================================

/**
 * Create a work item for a continuation action.
 * Uses DatabaseClient for all database operations.
 *
 * @param ctx - Request context for tracing
 * @param db - DatabaseClient instance
 * @param job_id - The job ID
 * @param plan_id - The plan ID
 * @param action_item - The continuation action item
 * @param emitEvent - Function to emit events
 * @returns The created work item
 */
export async function createContinuationWorkItem(
  ctx: RequestContext,
  db: DatabaseClient,
  job_id: string,
  plan_id: string,
  action_item: ContinuationActionItem,
  emitEvent: (event: WorkLifecycleEvent) => void
): Promise<WorkItem> {
  const work_id = `work_${Date.now()}_${action_item.id}`;

  logger.info(ctx, `operation=create_continuation_work_item_start job_id=${job_id} plan_id=${plan_id} action_item_id=${action_item.id} action_type=${action_item.action_type}`);

  // Determine initial status based on action type
  let initialStatus: WorkItemStatus;
  switch (action_item.action_type) {
    case "CREATE_NEW":
    case "REPLACE_EXISTING":
    case "RERUN_WITH_CONTEXT":
      initialStatus = "pending";
      break;
    case "MODIFY_EXISTING":
      // Skip to prompting - we already have the content
      initialStatus = "prompting";
      break;
  }

  // Build work item using DatabaseClient
  const workItem = await db.createWorkItem({
    work_id,
    job_id,
    plan_id,
    action_item_id: action_item.id,
    status: initialStatus,
    attempt: 1,
    max_attempts: 3,
    action: {
      item: action_item.item,
      deliverable_id: action_item.deliverable_id,
      requirements: [],
    },
    agent: null,
    prompt: null,
    external_ref: null,
    output: null,
    verification: null,
    retry_context:
      action_item.action_type === "MODIFY_EXISTING"
        ? {
            previous_attempt: 0,
            previous_output: action_item.current_value ?? null,
            verification_feedback: {
              score: 0,
              reasoning: "",
              issues: [],
              suggestions: [],
            },
          }
        : null,
    payment: null,
    token_usage: {
      internal: [],
      external: null,
      total_internal_cost_usd: 0,
      total_external_cost_usd: 0,
      total_cost_usd: 0,
    },
    retries: [],
    started_at: action_item.action_type === "MODIFY_EXISTING" ? new Date() : null,
    completed_at: null,
  });

  // Emit creation event
  emitEvent({
    type: "work:created",
    work_id,
    action_item_id: action_item.id,
  });

  logger.info(ctx, `operation=create_continuation_work_item_complete work_id=${work_id} initial_status=${initialStatus}`);

  return workItem;
}

// =============================================================================
// DEPENDENCY CASCADE
// =============================================================================

/**
 * Check if modifying a work item requires cascading updates to dependents.
 * Uses DatabaseClient for all database operations.
 *
 * @param ctx - Request context for tracing
 * @param db - DatabaseClient instance
 * @param job_id - The job ID
 * @param plan_id - The plan ID
 * @param modified_work_id - The work item that was modified
 * @param invokePlanningLLM - Function to invoke Planning Agent for decisions
 * @returns Array of continuation action items for cascade
 */
export async function checkDependencyCascade(
  ctx: RequestContext,
  db: DatabaseClient,
  job_id: string,
  plan_id: string,
  modified_work_id: string,
  invokePlanningLLM: (input: CascadeDecisionInput) => Promise<CascadeAnalysisResult>
): Promise<ContinuationActionItem[]> {
  logger.info(ctx, `operation=check_dependency_cascade_start job_id=${job_id} plan_id=${plan_id} modified_work_id=${modified_work_id}`);

  // Use DatabaseClient to get modified work item
  const modifiedWork = await db.getWorkItem(modified_work_id);
  if (!modifiedWork) {
    logger.error(ctx, `operation=check_dependency_cascade modified_work_id=${modified_work_id} error=work_item_not_found`);
    throw new Error(`Work item not found: ${modified_work_id}`);
  }

  // Use DatabaseClient to get plan
  const plan = await db.getPlan(plan_id);
  if (!plan) {
    logger.error(ctx, `operation=check_dependency_cascade plan_id=${plan_id} error=plan_not_found`);
    throw new Error(`Plan not found: ${plan_id}`);
  }

  // Find items that depend on the modified action item
  const dependents = plan.action_items.filter((item) =>
    item.depends_on.includes(modifiedWork.action_item_id)
  );

  if (dependents.length === 0) {
    logger.debug(ctx, `operation=check_dependency_cascade modified_work_id=${modified_work_id} dependent_count=0 cascade_needed=false`);
    return []; // No cascade needed
  }

  logger.debug(ctx, `operation=check_dependency_cascade modified_work_id=${modified_work_id} dependent_count=${dependents.length}`);

  // Ask Planning Agent to decide if dependents need re-running
  const cascadeDecision = await invokePlanningLLM({
    task: "Determine cascade impact",
    modified_item: modifiedWork.action,
    modification_description: `Modified ${modifiedWork.action.item}`,
    dependents: dependents.map((d) => ({
      id: d.id,
      item: d.item,
    })),
    question: "Do any dependents need to be updated due to this change?",
  });

  if (cascadeDecision.needs_cascade) {
    logger.info(ctx, `operation=check_dependency_cascade_complete modified_work_id=${modified_work_id} cascade_needed=true items_to_rerun=${cascadeDecision.items_to_rerun.length}`);

    return cascadeDecision.items_to_rerun.map((id) => {
      const actionItem = plan.action_items.find((a) => a.id === id);
      if (!actionItem) {
        logger.error(ctx, `operation=check_dependency_cascade action_item_id=${id} error=action_item_not_found`);
        throw new Error(`Action item not found: ${id}`);
      }
      return {
        ...actionItem,
        action_type: "RERUN_WITH_CONTEXT" as ContinuationActionType,
        original_work_id: modified_work_id,
      };
    });
  }

  logger.info(ctx, `operation=check_dependency_cascade_complete modified_work_id=${modified_work_id} cascade_needed=false`);

  return [];
}

// =============================================================================
// CONTINUATION LOADING PATTERNS
// =============================================================================

/**
 * Pattern descriptions for continuation loading.
 * Documents what work items need to be loaded for different request types.
 */
export const CONTINUATION_LOADING_PATTERNS: Array<{
  pattern: string;
  loads: string;
  reason: string;
}> = [
  {
    pattern: "Make headline #3 shorter",
    loads: "work_002 only",
    reason: "Need to see headlines to identify and modify #3",
  },
  {
    pattern: "Add TikTok script",
    loads: "work_001 (strategy) maybe",
    reason: "Need tone/audience context, not existing outputs",
  },
  {
    pattern: "Make images match playful tone",
    loads: "work_004, work_005",
    reason: "Need to see current images to understand what to change",
  },
  {
    pattern: "Rewrite everything for Gen Z",
    loads: "work_001 (strategy)",
    reason: "Need current approach as baseline, will regenerate all",
  },
  {
    pattern: "Add more headlines like #2",
    loads: "work_002 only",
    reason: "Need to see what #2 looks like as reference",
  },
];
