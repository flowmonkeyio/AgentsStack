/**
 * Parallel Execution and Dynamic Spawning
 *
 * Handles parallel execution of work items and dynamic TODO spawning.
 * Uses DatabaseClient for all database operations.
 *
 * @see /docs/designs/orchestration/work-lifecycle/TECH_DESIGN.md
 */

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

// =============================================================================
// DEPENDENCY RESOLUTION
// =============================================================================

/**
 * Get action items that have all dependencies satisfied.
 * Uses Plan's action_items and a set of completed action item IDs.
 *
 * @param plan - The plan containing action items
 * @param completedIds - Set of completed action item IDs
 * @returns Array of actionable items
 */
export function getActionableTodos(plan: Plan, completedIds: Set<number>): ActionItem[] {
  return plan.action_items.filter((item) => {
    // Must be pending
    if (item.status !== "pending") return false;

    // All dependencies must be completed
    return item.depends_on.every((depId) => completedIds.has(depId));
  });
}

/**
 * Build a set of completed action item IDs from work items.
 *
 * @param workItems - Array of work items
 * @returns Set of completed action item IDs
 */
export function getCompletedActionItemIds(workItems: WorkItem[]): Set<number> {
  const completedIds = new Set<number>();
  for (const work of workItems) {
    if (work.status === "completed") {
      completedIds.add(work.action_item_id);
    }
  }
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
 * @param lifecycle - WorkLifecycle instance for transitions
 * @param workItems - Work items to execute in parallel
 * @param executeWorkItem - Function that executes a single work item
 * @returns Array of execution results
 */
export async function executeParallel(
  lifecycle: WorkLifecycle,
  workItems: WorkItem[],
  executeWorkItem: ExecuteWorkItemFn
): Promise<WorkExecutionResult[]> {
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
  for (const result of results) {
    if (result.status === "fulfilled") {
      executionResults.push(result.value);
    } else {
      // Unexpected rejection (executeWorkItem should not throw)
      console.error("Unexpected rejection in parallel execution:", result.reason);
    }
  }

  return executionResults;
}

/**
 * Get ready work items for a job and execute them in parallel.
 *
 * @param db - Extended DatabaseClient instance
 * @param lifecycle - WorkLifecycle instance
 * @param job_id - The job ID
 * @param executeWorkItem - Function that executes a single work item
 * @returns Array of execution results
 */
export async function executeReadyWorkItems(
  db: ExtendedDatabaseClient,
  lifecycle: WorkLifecycle,
  job_id: string,
  executeWorkItem: ExecuteWorkItemFn
): Promise<WorkExecutionResult[]> {
  // Get all ready work items
  const readyItems = await lifecycle.getActionable(job_id);

  if (readyItems.length === 0) {
    return [];
  }

  // Execute in parallel
  return executeParallel(lifecycle, readyItems, executeWorkItem);
}

// =============================================================================
// AGENT REASSIGNMENT
// =============================================================================

/**
 * Find an alternative agent for a failed work item.
 * Excludes agents that have already failed and applies quality/capability filters.
 *
 * @param work - The work item that needs a new agent
 * @param availableAgents - List of all available agents
 * @returns The best alternative agent or null if none found
 */
export function findAlternativeAgent(
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

  if (candidates.length === 0) return null;

  // Sort by quality (since previous agent failed, prioritize quality)
  candidates.sort((a, b) => b.stats.avg_score - a.stats.avg_score);

  return candidates[0];
}

/**
 * Check if a work item can be reassigned to a new agent.
 * Limited by MAX_REASSIGNMENTS.
 *
 * @param work - The work item
 * @returns True if reassignment is possible
 */
export function canReassign(work: WorkItem): boolean {
  const reassignmentCount = work.retries.filter(
    (r) => r.reason === "reassignment"
  ).length;
  return reassignmentCount < MAX_REASSIGNMENTS;
}

/**
 * Build reassignment criteria for a work item.
 *
 * @param work - The work item
 * @returns Reassignment criteria
 */
export function buildReassignmentCriteria(work: WorkItem): ReassignmentCriteria {
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
 * @param db - DatabaseClient instance
 * @param job_id - The job ID
 * @param plan_id - The plan ID
 * @param action_item - The continuation action item
 * @param emitEvent - Function to emit events
 * @returns The created work item
 */
export async function createContinuationWorkItem(
  db: DatabaseClient,
  job_id: string,
  plan_id: string,
  action_item: ContinuationActionItem,
  emitEvent: (event: WorkLifecycleEvent) => void
): Promise<WorkItem> {
  const work_id = `work_${Date.now()}_${action_item.id}`;

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

  return workItem;
}

// =============================================================================
// DEPENDENCY CASCADE
// =============================================================================

/**
 * Check if modifying a work item requires cascading updates to dependents.
 * Uses DatabaseClient for all database operations.
 *
 * @param db - DatabaseClient instance
 * @param job_id - The job ID
 * @param plan_id - The plan ID
 * @param modified_work_id - The work item that was modified
 * @param invokePlanningLLM - Function to invoke Planning Agent for decisions
 * @returns Array of continuation action items for cascade
 */
export async function checkDependencyCascade(
  db: DatabaseClient,
  job_id: string,
  plan_id: string,
  modified_work_id: string,
  invokePlanningLLM: (input: CascadeDecisionInput) => Promise<CascadeAnalysisResult>
): Promise<ContinuationActionItem[]> {
  // Use DatabaseClient to get modified work item
  const modifiedWork = await db.getWorkItem(modified_work_id);
  if (!modifiedWork) {
    throw new Error(`Work item not found: ${modified_work_id}`);
  }

  // Use DatabaseClient to get plan
  const plan = await db.getPlan(plan_id);
  if (!plan) {
    throw new Error(`Plan not found: ${plan_id}`);
  }

  // Find items that depend on the modified action item
  const dependents = plan.action_items.filter((item) =>
    item.depends_on.includes(modifiedWork.action_item_id)
  );

  if (dependents.length === 0) {
    return []; // No cascade needed
  }

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
    return cascadeDecision.items_to_rerun.map((id) => {
      const actionItem = plan.action_items.find((a) => a.id === id);
      if (!actionItem) {
        throw new Error(`Action item not found: ${id}`);
      }
      return {
        ...actionItem,
        action_type: "RERUN_WITH_CONTEXT" as ContinuationActionType,
        original_work_id: modified_work_id,
      };
    });
  }

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
