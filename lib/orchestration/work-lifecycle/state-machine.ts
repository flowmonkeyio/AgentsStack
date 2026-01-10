/**
 * Work Lifecycle State Machine
 *
 * Implements the WorkLifecycle class that manages state transitions for work items.
 * Uses DatabaseClient for all database operations (never direct MongoDB access).
 *
 * @see /docs/designs/orchestration/work-lifecycle/TECH_DESIGN.md
 */

import type { RequestContext } from "@/lib/logging";
import { createLogger } from "@/lib/logging";
import type { DatabaseClient } from "@/lib/db/database-client";
import type { WorkItem, Plan, ActionItem } from "@/types";
import type {
  TransitionTrigger,
  TransitionResult,
  PayloadFor,
  WorkLifecycleEvent,
  RetryType,
  SpawnRequest,
  SpawnResult,
  IWorkLifecycle,
  Transition,
} from "./types";
import { DEFAULT_RETRY_LIMITS } from "./types";
import { TRANSITIONS } from "./transitions";

const logger = createLogger("work-lifecycle");

// =============================================================================
// EXTENDED DATABASE CLIENT INTERFACE
// =============================================================================

/**
 * Extended DatabaseClient interface with methods required by WorkLifecycle.
 * These methods should be added to the main DatabaseClient interface.
 */
export interface ExtendedDatabaseClient extends DatabaseClient {
  /**
   * Update specific fields of a work item (partial update).
   * This is used by state transitions to update status and related fields.
   */
  updateWorkItemFields(work_id: string, updates: Partial<WorkItem>): Promise<void>;

  /**
   * Get work items for specific action item IDs within a job.
   * Used for dependency checking.
   */
  getWorkItemsByActionItemIds(job_id: string, action_item_ids: number[]): Promise<WorkItem[]>;

  /**
   * Add new action items to a plan.
   * Used for dynamic TODO spawning.
   */
  pushActionItemsToPlan(plan_id: string, newItems: ActionItem[]): Promise<void>;
}

// =============================================================================
// EVENT EMITTER TYPE
// =============================================================================

/**
 * Event emitter function type
 */
export type EventEmitter = (event: WorkLifecycleEvent) => void;

// =============================================================================
// WORK LIFECYCLE CLASS
// =============================================================================

/**
 * WorkLifecycle manages state transitions for work items.
 * Uses DatabaseClient for all database operations (never direct MongoDB access).
 */
export class WorkLifecycle implements IWorkLifecycle {
  private readonly db: ExtendedDatabaseClient;
  private readonly emitEvent: EventEmitter;

  /**
   * Create a new WorkLifecycle instance.
   *
   * @param db - Extended DatabaseClient instance
   * @param emitEvent - Optional event emitter function
   */
  constructor(db: ExtendedDatabaseClient, emitEvent?: EventEmitter) {
    this.db = db;
    this.emitEvent = emitEvent ?? (() => {});
  }

  /**
   * Execute a state transition for a work item.
   *
   * @param ctx - Request context for tracing
   * @param work_id - The work item ID
   * @param trigger - The transition trigger (must be valid TransitionTrigger)
   * @param payload - Optional payload data (type depends on trigger)
   */
  async transition<T extends TransitionTrigger>(
    ctx: RequestContext,
    work_id: string,
    trigger: T,
    payload?: PayloadFor<T>
  ): Promise<TransitionResult> {
    // Use DatabaseClient to fetch work item
    const work = await this.db.getWorkItem(work_id);
    if (!work) {
      logger.warn(ctx, `operation=transition work_id=${work_id} error=work_item_not_found`);
      return { success: false, error: "Work item not found" };
    }

    const transition = this.getTransition(work.status, trigger);
    if (!transition) {
      logger.warn(ctx, `operation=transition work_id=${work_id} from=${work.status} trigger=${trigger} error=invalid_transition`);
      return {
        success: false,
        error: `Invalid transition: ${work.status} + ${trigger}`,
      };
    }

    // Check guard (guard functions are typed per transition)
    // Type assertion needed because we're working with a union of all transition types
    if (
      transition.guard &&
      !transition.guard(work, payload as Parameters<typeof transition.guard>[1])
    ) {
      logger.warn(ctx, `operation=transition_blocked work_id=${work_id} from=${work.status} trigger=${trigger} reason=guard_failed guard=${transition.guardName}`);
      return { success: false, error: `Guard failed: ${transition.guardName}` };
    }

    // Execute transition to get field updates
    // Type assertion needed because we're working with a union of all transition types
    const updates = transition.execute(
      work,
      payload as Parameters<typeof transition.execute>[1]
    );

    // Use DatabaseClient method to update work item
    // The updateWorkItemFields method performs a partial update
    await this.db.updateWorkItemFields(work_id, {
      status: transition.to,
      ...updates,
    });

    logger.info(ctx, `operation=transition work_id=${work_id} from=${work.status} to=${transition.to} trigger=${trigger}`);

    // Create event for emission
    const event: WorkLifecycleEvent = {
      type: "work:status_changed",
      work_id,
      status: transition.to,
    };

    // Emit the event
    this.emitEvent(event);

    return {
      success: true,
      new_status: transition.to,
      event,
    };
  }

  /**
   * Get all work items that are ready for execution.
   * Returns items in "ready" status for the given job.
   *
   * @param ctx - Request context for tracing
   * @param job_id - The job ID
   */
  async getActionable(ctx: RequestContext, job_id: string): Promise<WorkItem[]> {
    const allWorkItems = await this.db.getWorkItemsByJob(job_id);
    const actionable = allWorkItems.filter((work) => work.status === "ready");
    logger.info(ctx, `operation=get_actionable job_id=${job_id} total_count=${allWorkItems.length} actionable_count=${actionable.length}`);
    return actionable;
  }

  /**
   * Check if a work item can retry for a specific retry type.
   *
   * @param ctx - Request context for tracing
   * @param work_id - The work item ID
   * @param type - The type of retry to check
   */
  async canRetry(ctx: RequestContext, work_id: string, type: RetryType): Promise<boolean> {
    const work = await this.db.getWorkItem(work_id);
    if (!work) {
      logger.warn(ctx, `operation=can_retry work_id=${work_id} type=${type} error=work_item_not_found`);
      return false;
    }

    const canRetryResult = this.checkRetryLimit(work, type);
    logger.debug(ctx, `operation=can_retry work_id=${work_id} type=${type} can_retry=${canRetryResult}`);
    return canRetryResult;
  }

  /**
   * Spawn new TODO items from a parent TODO.
   *
   * @param ctx - Request context for tracing
   * @param request - The spawn request
   */
  async spawnTodos(ctx: RequestContext, request: SpawnRequest): Promise<SpawnResult> {
    logger.info(ctx, `operation=spawn_todos_start plan_id=${request.plan_id} parent_todo_id=${request.parent_todo_id} new_todo_count=${request.new_todos.length}`);

    // Use DatabaseClient to get plan
    const plan = await this.db.getPlan(request.plan_id);
    if (!plan) {
      logger.error(ctx, `operation=spawn_todos plan_id=${request.plan_id} error=plan_not_found`);
      throw new Error(`Plan not found: ${request.plan_id}`);
    }

    // Generate new IDs (incrementing from max existing ID)
    const maxId = Math.max(0, ...plan.action_items.map((a) => a.id));
    const newActionItems: ActionItem[] = request.new_todos.map((todo, index) => ({
      id: maxId + index + 1,
      item: todo.item,
      priority: todo.priority,
      depends_on: todo.depends_on,
      deliverable_id: todo.deliverable_id,
      agent_id: todo.agent_id,
      template_id: todo.template_id,
      estimated_cost: todo.estimated_cost,
      status: "pending" as const,
      work_id: null,
      resource_type: todo.resource_type,
    }));

    // Use DatabaseClient to add action items to plan
    await this.db.pushActionItemsToPlan(request.plan_id, newActionItems);

    // Create work items for each new action item
    const createdWorkIds: string[] = [];
    for (const actionItem of newActionItems) {
      const workItem = await this.db.createWorkItem({
        work_id: `work_${Date.now()}_${actionItem.id}`,
        job_id: request.job_id,
        plan_id: request.plan_id,
        action_item_id: actionItem.id,
        status: "pending",
        attempt: 1,
        max_attempts: 3,
        action: {
          item: actionItem.item,
          deliverable_id: actionItem.deliverable_id,
          requirements: [], // Will be populated during prompting
        },
        agent: null,
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
        started_at: null,
        completed_at: null,
      });
      createdWorkIds.push(workItem.work_id);
    }

    // Emit event for spawned TODOs
    this.emitEvent({
      type: "todo:spawned",
      parent_id: request.parent_todo_id,
      new_todos: newActionItems,
    });

    logger.info(ctx, `operation=spawn_todos_complete plan_id=${request.plan_id} parent_todo_id=${request.parent_todo_id} spawned_count=${newActionItems.length}`);

    return {
      spawned_items: newActionItems,
      created_work_ids: createdWorkIds,
    };
  }

  /**
   * Check if a work item's dependencies are satisfied.
   * If all dependencies are completed, transitions to "ready".
   *
   * @param ctx - Request context for tracing
   * @param work_id - The work item to check
   * @param plan - The plan containing action items
   */
  async checkDependencies(ctx: RequestContext, work_id: string, plan: Plan): Promise<void> {
    // Use DatabaseClient to get work item
    const work = await this.db.getWorkItem(work_id);
    if (!work) {
      logger.error(ctx, `operation=check_dependencies work_id=${work_id} error=work_item_not_found`);
      throw new Error(`Work item not found: ${work_id}`);
    }

    // Find the action item for this work
    const actionItem = plan.action_items.find((ai) => ai.id === work.action_item_id);
    if (!actionItem) {
      logger.error(ctx, `operation=check_dependencies work_id=${work_id} error=action_item_not_found`);
      throw new Error(`Action item not found for work: ${work_id}`);
    }

    if (actionItem.depends_on.length === 0) {
      // No dependencies, ready immediately
      logger.debug(ctx, `operation=check_dependencies work_id=${work_id} dependencies_met=true reason=no_dependencies`);
      await this.transition(ctx, work_id, "dependencies_met");
      return;
    }

    // Use DatabaseClient to get dependency work items
    const dependencyWorks = await this.db.getWorkItemsByActionItemIds(
      work.job_id,
      actionItem.depends_on
    );

    const allCompleted = dependencyWorks.every((w) => w.status === "completed");

    logger.debug(ctx, `operation=check_dependencies work_id=${work_id} dependency_count=${actionItem.depends_on.length} dependencies_met=${allCompleted}`);

    if (allCompleted) {
      await this.transition(ctx, work_id, "dependencies_met");
    }
  }

  /**
   * Called when a work item completes.
   * Checks all pending items that depend on this one.
   *
   * @param ctx - Request context for tracing
   * @param work_id - The completed work item ID
   * @param plan - The plan containing action items
   */
  async onWorkCompleted(ctx: RequestContext, work_id: string, plan: Plan): Promise<void> {
    logger.info(ctx, `operation=on_work_completed work_id=${work_id}`);

    // Get the completed work item
    const completedWork = await this.db.getWorkItem(work_id);
    if (!completedWork) {
      logger.error(ctx, `operation=on_work_completed work_id=${work_id} error=work_item_not_found`);
      throw new Error(`Work item not found: ${work_id}`);
    }

    // Find all action items that depend on the completed one
    const dependentActionItems = plan.action_items.filter((ai) =>
      ai.depends_on.includes(completedWork.action_item_id)
    );

    logger.debug(ctx, `operation=on_work_completed work_id=${work_id} dependent_count=${dependentActionItems.length}`);

    // Check dependencies for each dependent work item
    for (const actionItem of dependentActionItems) {
      if (actionItem.work_id) {
        // Get the work item for this action
        const dependentWork = await this.db.getWorkItem(actionItem.work_id);
        if (dependentWork && dependentWork.status === "pending") {
          // Check if all its dependencies are now satisfied
          await this.checkDependencies(ctx, actionItem.work_id, plan);
        }
      }
    }
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  /**
   * Find a transition by current status and trigger.
   *
   * @param from - Current work item status
   * @param trigger - Transition trigger
   * @returns The matching transition or null
   */
  private getTransition(
    from: WorkItem["status"],
    trigger: TransitionTrigger
  ): Transition | null {
    return TRANSITIONS.find((t) => t.from === from && t.trigger === trigger) ?? null;
  }

  /**
   * Check if a work item is within retry limits for a given type.
   *
   * @param work - The work item
   * @param type - The retry type to check
   * @returns True if retries are available
   */
  private checkRetryLimit(work: WorkItem, type: RetryType): boolean {
    switch (type) {
      case "verification_retries":
        return work.attempt < DEFAULT_RETRY_LIMITS.verification_retries;
      case "stale_retries": {
        const staleRetryCount = work.retries.filter((r) => r.reason === "stale").length;
        return staleRetryCount < DEFAULT_RETRY_LIMITS.stale_retries;
      }
      case "payment_retries":
        return (work.payment?.retry_count ?? 0) < DEFAULT_RETRY_LIMITS.payment_retries;
      case "agent_reassignments": {
        const reassignmentCount = work.retries.filter(
          (r) => r.reason === "reassignment"
        ).length;
        return reassignmentCount < DEFAULT_RETRY_LIMITS.agent_reassignments;
      }
    }
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new WorkLifecycle instance.
 *
 * @param db - Extended DatabaseClient instance
 * @param emitEvent - Optional event emitter function
 * @returns WorkLifecycle instance
 */
export function createWorkLifecycle(
  db: ExtendedDatabaseClient,
  emitEvent?: EventEmitter
): WorkLifecycle {
  return new WorkLifecycle(db, emitEvent);
}
