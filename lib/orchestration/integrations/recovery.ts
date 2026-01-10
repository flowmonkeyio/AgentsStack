/**
 * Recovery Module
 *
 * Handles poll manager (background polling) and system restart recovery.
 * Ensures in-flight work items are properly resumed after interruptions.
 *
 * @see /docs/designs/orchestration/integrations/TECH_DESIGN.md
 */

import type { RequestContext } from "@/lib/logging";
import { createLogger, createContext } from "@/lib/logging";
import type { DatabaseClient } from "@/lib/db/database-client";
import type { ExtendedDatabaseClient } from "@/lib/orchestration/work-lifecycle";
import type { IWorkLifecycle } from "@/lib/orchestration/work-lifecycle";
import type { WorkItem } from "@/types";
import type { DispatchDependencies } from "./dispatch";
import type { VerificationDependencies } from "./galileo";
import type { PaymentDependencies } from "./payments";
import { pollAgent, dispatchToAgent } from "./dispatch";
import { verifyWork } from "./galileo";
import { payForWork, checkPaymentStatus } from "./payments";
import { DEFAULT_POLL_MANAGER_CONFIG } from "./types";
import type { PollManagerConfig } from "./types";

const logger = createLogger("integrations");

// =============================================================================
// POLL MANAGER
// =============================================================================

/**
 * Poll manager state
 */
interface PollManagerState {
  /** Interval timer ID */
  intervalId: NodeJS.Timeout | null;
  /** Whether poll manager is running */
  isRunning: boolean;
}

/**
 * Global poll manager state
 */
const pollManagerState: PollManagerState = {
  intervalId: null,
  isRunning: false,
};

/**
 * Run a single poll cycle.
 * Finds and polls all items that need polling.
 *
 * @param ctx - Request context for tracing
 * @param deps - Dispatch dependencies
 */
async function runPollCycle(ctx: RequestContext, deps: DispatchDependencies): Promise<void> {
  const { db, lifecycle } = deps;

  logger.debug(ctx, `operation=poll_cycle_start`);

  // Find items needing poll
  const needsPoll = await db.getItemsNeedingPoll();

  logger.debug(ctx, `operation=poll_cycle items_needing_poll=${needsPoll.length}`);

  for (const work of needsPoll) {
    try {
      await pollAgent(ctx, work.work_id, deps);
    } catch (error) {
      logger.error(ctx, `operation=poll_cycle_poll_failed work_id=${work.work_id}`, error instanceof Error ? error : undefined);
    }
  }

  // Find stale items (timeout exceeded)
  const staleItems = await db.getStaleItems();

  logger.debug(ctx, `operation=poll_cycle stale_items=${staleItems.length}`);

  for (const work of staleItems) {
    try {
      await handleStaleWork(ctx, work, deps, lifecycle);
    } catch (error) {
      logger.error(ctx, `operation=poll_cycle_stale_failed work_id=${work.work_id}`, error instanceof Error ? error : undefined);
    }
  }

  logger.debug(ctx, `operation=poll_cycle_complete`);
}

/**
 * Handle a stale work item (polling timeout exceeded).
 * Retries dispatch up to 3 times, then fails.
 *
 * @param ctx - Request context for tracing
 * @param work - Stale work item
 * @param deps - Dispatch dependencies
 * @param lifecycle - Work lifecycle for state transitions
 */
async function handleStaleWork(
  ctx: RequestContext,
  work: WorkItem,
  deps: DispatchDependencies,
  lifecycle: IWorkLifecycle
): Promise<void> {
  // Count stale retries
  const staleRetryCount = work.retries.filter((r) => r.reason === "stale").length;
  const canRetry = staleRetryCount < 3;

  logger.info(ctx, `operation=handle_stale work_id=${work.work_id} stale_retry_count=${staleRetryCount} can_retry=${canRetry}`);

  if (canRetry) {
    // Transition to stale, then retry dispatch
    await lifecycle.transition(work.work_id, "poll_timeout");
    await lifecycle.transition(work.work_id, "retry_dispatch");
    await dispatchToAgent(ctx, work.work_id, deps);
  } else {
    // Max retries exceeded
    logger.warn(ctx, `operation=handle_stale work_id=${work.work_id} status=max_retries_exceeded`);
    await lifecycle.transition(work.work_id, "max_stale_retries");
  }
}

/**
 * Start the poll manager background process.
 * Runs every 5 seconds by default.
 *
 * @param deps - Dispatch dependencies
 * @param config - Optional configuration
 */
export function startPollManager(
  deps: DispatchDependencies,
  config: PollManagerConfig = DEFAULT_POLL_MANAGER_CONFIG
): void {
  if (pollManagerState.isRunning) {
    const ctx = createContext();
    logger.warn(ctx, `operation=start_poll_manager status=already_running`);
    return;
  }

  pollManagerState.isRunning = true;
  pollManagerState.intervalId = setInterval(
    () => {
      const ctx = createContext();
      runPollCycle(ctx, deps);
    },
    config.pollIntervalMs
  );

  const ctx = createContext();
  logger.info(ctx, `operation=start_poll_manager interval_ms=${config.pollIntervalMs}`);
}

/**
 * Stop the poll manager background process.
 */
export function stopPollManager(): void {
  const ctx = createContext();
  if (pollManagerState.intervalId) {
    clearInterval(pollManagerState.intervalId);
    pollManagerState.intervalId = null;
  }
  pollManagerState.isRunning = false;
  logger.info(ctx, `operation=stop_poll_manager`);
}

/**
 * Check if poll manager is running.
 */
export function isPollManagerRunning(): boolean {
  return pollManagerState.isRunning;
}

// =============================================================================
// SYSTEM RESTART RECOVERY
// =============================================================================

/**
 * Combined dependencies for recovery operations
 */
export interface RecoveryDependencies {
  /** Database client */
  db: DatabaseClient & ExtendedDatabaseClient;
  /** Work lifecycle */
  lifecycle: IWorkLifecycle;
  /** Dispatch dependencies (for agent operations) */
  dispatch: DispatchDependencies;
  /** Verification dependencies (for Galileo operations) */
  verification: VerificationDependencies;
  /** Payment dependencies (for payment operations) */
  payment: PaymentDependencies;
}

/**
 * Recover all in-flight work from active jobs.
 * Called on system startup to resume interrupted work.
 *
 * @param ctx - Request context for tracing
 * @param deps - Recovery dependencies
 */
export async function recoverInFlightWork(
  ctx: RequestContext,
  deps: RecoveryDependencies
): Promise<void> {
  const { db, lifecycle } = deps;

  logger.info(ctx, `operation=recover_in_flight_work status=starting`);

  // Find active jobs
  const activeJobs = await findActiveJobs(db);
  logger.info(ctx, `operation=recover_in_flight_work active_jobs=${activeJobs.length}`);

  for (const job of activeJobs) {
    const workItems = await db.getWorkItemsByJob(job.job_id);
    logger.info(ctx, `operation=recover_in_flight_work job_id=${job.job_id} work_items=${workItems.length}`);

    for (const work of workItems) {
      try {
        await recoverWorkItem(ctx, work, deps);
      } catch (error) {
        logger.error(ctx, `operation=recover_work_item_failed work_id=${work.work_id}`, error instanceof Error ? error : undefined);
      }
    }
  }

  logger.info(ctx, `operation=recover_in_flight_work status=complete`);
}

/**
 * Find all jobs that are in an active state.
 *
 * @param db - Database client
 * @returns Array of active jobs
 */
async function findActiveJobs(
  db: DatabaseClient
): Promise<Array<{ job_id: string }>> {
  // Note: Would need a getJobsByStatus method on DatabaseClient
  // For now, this is a placeholder that returns an empty array
  // The actual implementation would query jobs with status in:
  // ["planning", "plan_verification", "executing"]

  // This is a limitation of the current DatabaseClient interface
  // A proper implementation would be:
  // return db.getJobsByStatus(["planning", "plan_verification", "executing"]);

  // Note: This function doesn't take ctx as it's an internal helper.
  // Logging is done by the caller.
  return [];
}

/**
 * Recover a single work item based on its current status.
 *
 * @param ctx - Request context for tracing
 * @param work - Work item to recover
 * @param deps - Recovery dependencies
 */
async function recoverWorkItem(
  ctx: RequestContext,
  work: WorkItem,
  deps: RecoveryDependencies
): Promise<void> {
  logger.info(ctx, `operation=recover_work_item work_id=${work.work_id} status=${work.status}`);

  switch (work.status) {
    case "dispatched":
    case "polling":
      // Resume polling
      await pollAgent(ctx, work.work_id, deps.dispatch);
      break;

    case "prompting":
      // Restart prompting
      await restartPrompting(ctx, work.work_id, deps);
      break;

    case "verifying":
      // Re-run verification
      await verifyWork(ctx, work.work_id, deps.verification);
      break;

    case "paying":
    case "payment_retry":
      // Check payment status
      await checkPaymentStatus(ctx, work.work_id, deps.payment);
      break;

    case "stale":
      // Handle stale - attempt re-dispatch
      await handleStaleWork(ctx, work, deps.dispatch, deps.lifecycle);
      break;

    default:
      // No recovery needed for: pending, ready, received, verified,
      // retry_pending, rejected, reassigning, completed, failed
      logger.debug(ctx, `operation=recover_work_item work_id=${work.work_id} action=none status=${work.status}`);
  }
}

/**
 * Restart prompting for a work item that was interrupted during prompt generation.
 *
 * @param ctx - Request context for tracing
 * @param work_id - Work item ID
 * @param deps - Recovery dependencies
 */
async function restartPrompting(
  ctx: RequestContext,
  work_id: string,
  deps: RecoveryDependencies
): Promise<void> {
  const { db } = deps;

  // Reset to ready status so it can be picked up by the execution loop
  await db.updateWorkItemStatus(work_id, "ready");

  logger.info(ctx, `operation=restart_prompting work_id=${work_id} action=reset_to_ready`);
}

// =============================================================================
// RECOVERY UTILITIES
// =============================================================================

/**
 * Check if a work item needs recovery.
 *
 * @param work - Work item to check
 * @returns true if work item is in a state that needs recovery
 */
export function needsRecovery(work: WorkItem): boolean {
  const recoverableStates: WorkItem["status"][] = [
    "dispatched",
    "polling",
    "prompting",
    "verifying",
    "paying",
    "payment_retry",
    "stale",
  ];
  return recoverableStates.includes(work.status);
}

/**
 * Get recovery priority for a work item.
 * Higher priority items should be recovered first.
 *
 * @param work - Work item
 * @returns Priority (higher = more urgent)
 */
export function getRecoveryPriority(work: WorkItem): number {
  const priorities: Record<WorkItem["status"], number> = {
    // Payment states have highest priority (money involved)
    paying: 100,
    payment_retry: 90,
    // Verification is high priority
    verifying: 80,
    // Active execution
    dispatched: 70,
    polling: 60,
    prompting: 50,
    stale: 40,
    // States that don't need recovery
    pending: 0,
    ready: 0,
    received: 0,
    verified: 0,
    retry_pending: 0,
    rejected: 0,
    reassigning: 0,
    completed: 0,
    failed: 0,
  };
  return priorities[work.status] ?? 0;
}

/**
 * Sort work items by recovery priority.
 *
 * @param workItems - Array of work items
 * @returns Sorted array (highest priority first)
 */
export function sortByRecoveryPriority(workItems: WorkItem[]): WorkItem[] {
  return [...workItems].sort(
    (a, b) => getRecoveryPriority(b) - getRecoveryPriority(a)
  );
}

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * Recovery health status
 */
export interface RecoveryHealthStatus {
  /** Total work items checked */
  totalChecked: number;
  /** Items needing recovery */
  needingRecovery: number;
  /** Items by status */
  statusCounts: Record<string, number>;
  /** Poll manager running */
  pollManagerRunning: boolean;
}

/**
 * Get recovery health status for monitoring.
 *
 * @param ctx - Request context for tracing
 * @param db - Database client
 * @returns Health status
 */
export async function getRecoveryHealthStatus(
  ctx: RequestContext,
  db: DatabaseClient
): Promise<RecoveryHealthStatus> {
  logger.debug(ctx, `operation=get_recovery_health_status`);

  // Note: This would benefit from more specialized database methods
  // For now, we use available methods

  const needsPoll = await db.getItemsNeedingPoll();
  const staleItems = await db.getStaleItems();

  const statusCounts: Record<string, number> = {};

  for (const item of [...needsPoll, ...staleItems]) {
    statusCounts[item.status] = (statusCounts[item.status] ?? 0) + 1;
  }

  const status = {
    totalChecked: needsPoll.length + staleItems.length,
    needingRecovery: needsPoll.length + staleItems.length,
    statusCounts,
    pollManagerRunning: isPollManagerRunning(),
  };

  logger.info(ctx, `operation=get_recovery_health_status total_checked=${status.totalChecked} needing_recovery=${status.needingRecovery} poll_manager_running=${status.pollManagerRunning}`);

  return status;
}
