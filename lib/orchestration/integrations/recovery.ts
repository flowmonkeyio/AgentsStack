/**
 * Recovery Module
 *
 * Handles poll manager (background polling) and system restart recovery.
 * Ensures in-flight work items are properly resumed after interruptions.
 *
 * @see /docs/designs/orchestration/integrations/TECH_DESIGN.md
 */

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
 * @param deps - Dispatch dependencies
 */
async function runPollCycle(deps: DispatchDependencies): Promise<void> {
  const { db, lifecycle } = deps;

  // Find items needing poll
  const needsPoll = await db.getItemsNeedingPoll();

  for (const work of needsPoll) {
    try {
      await pollAgent(work.work_id, deps);
    } catch (error) {
      console.error(`[PollManager] Poll failed for ${work.work_id}:`, error);
    }
  }

  // Find stale items (timeout exceeded)
  const staleItems = await db.getStaleItems();

  for (const work of staleItems) {
    try {
      await handleStaleWork(work, deps, lifecycle);
    } catch (error) {
      console.error(`[PollManager] Stale handling failed for ${work.work_id}:`, error);
    }
  }
}

/**
 * Handle a stale work item (polling timeout exceeded).
 * Retries dispatch up to 3 times, then fails.
 *
 * @param work - Stale work item
 * @param deps - Dispatch dependencies
 * @param lifecycle - Work lifecycle for state transitions
 */
async function handleStaleWork(
  work: WorkItem,
  deps: DispatchDependencies,
  lifecycle: IWorkLifecycle
): Promise<void> {
  // Count stale retries
  const staleRetryCount = work.retries.filter((r) => r.reason === "stale").length;
  const canRetry = staleRetryCount < 3;

  if (canRetry) {
    // Transition to stale, then retry dispatch
    await lifecycle.transition(work.work_id, "poll_timeout");
    await lifecycle.transition(work.work_id, "retry_dispatch");
    await dispatchToAgent(work.work_id, deps);
  } else {
    // Max retries exceeded
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
    console.warn("[PollManager] Already running");
    return;
  }

  pollManagerState.isRunning = true;
  pollManagerState.intervalId = setInterval(
    () => runPollCycle(deps),
    config.pollIntervalMs
  );

  console.log(`[PollManager] Started with ${config.pollIntervalMs}ms interval`);
}

/**
 * Stop the poll manager background process.
 */
export function stopPollManager(): void {
  if (pollManagerState.intervalId) {
    clearInterval(pollManagerState.intervalId);
    pollManagerState.intervalId = null;
  }
  pollManagerState.isRunning = false;
  console.log("[PollManager] Stopped");
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
 * @param deps - Recovery dependencies
 */
export async function recoverInFlightWork(
  deps: RecoveryDependencies
): Promise<void> {
  const { db, lifecycle } = deps;

  console.log("[Recovery] Starting in-flight work recovery...");

  // Find active jobs
  const activeJobs = await findActiveJobs(db);
  console.log(`[Recovery] Found ${activeJobs.length} active jobs`);

  for (const job of activeJobs) {
    const workItems = await db.getWorkItemsByJob(job.job_id);
    console.log(
      `[Recovery] Job ${job.job_id}: ${workItems.length} work items`
    );

    for (const work of workItems) {
      try {
        await recoverWorkItem(work, deps);
      } catch (error) {
        console.error(
          `[Recovery] Failed to recover work ${work.work_id}:`,
          error
        );
      }
    }
  }

  console.log("[Recovery] In-flight work recovery complete");
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

  console.warn(
    "[Recovery] findActiveJobs requires getJobsByStatus method on DatabaseClient"
  );
  return [];
}

/**
 * Recover a single work item based on its current status.
 *
 * @param work - Work item to recover
 * @param deps - Recovery dependencies
 */
async function recoverWorkItem(
  work: WorkItem,
  deps: RecoveryDependencies
): Promise<void> {
  console.log(`[Recovery] Recovering work ${work.work_id} (status: ${work.status})`);

  switch (work.status) {
    case "dispatched":
    case "polling":
      // Resume polling
      await pollAgent(work.work_id, deps.dispatch);
      break;

    case "prompting":
      // Restart prompting
      await restartPrompting(work.work_id, deps);
      break;

    case "verifying":
      // Re-run verification
      await verifyWork(work.work_id, deps.verification);
      break;

    case "paying":
    case "payment_retry":
      // Check payment status
      await checkPaymentStatus(work.work_id, deps.payment);
      break;

    case "stale":
      // Handle stale - attempt re-dispatch
      await handleStaleWork(work, deps.dispatch, deps.lifecycle);
      break;

    default:
      // No recovery needed for: pending, ready, received, verified,
      // retry_pending, rejected, reassigning, completed, failed
      console.log(
        `[Recovery] No recovery action needed for status: ${work.status}`
      );
  }
}

/**
 * Restart prompting for a work item that was interrupted during prompt generation.
 *
 * @param work_id - Work item ID
 * @param deps - Recovery dependencies
 */
async function restartPrompting(
  work_id: string,
  deps: RecoveryDependencies
): Promise<void> {
  const { db } = deps;

  // Reset to ready status so it can be picked up by the execution loop
  await db.updateWorkItemStatus(work_id, "ready");

  console.log(`[Recovery] Reset work ${work_id} to ready for re-prompting`);
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
 * @param db - Database client
 * @returns Health status
 */
export async function getRecoveryHealthStatus(
  db: DatabaseClient
): Promise<RecoveryHealthStatus> {
  // Note: This would benefit from more specialized database methods
  // For now, we use available methods

  const needsPoll = await db.getItemsNeedingPoll();
  const staleItems = await db.getStaleItems();

  const statusCounts: Record<string, number> = {};

  for (const item of [...needsPoll, ...staleItems]) {
    statusCounts[item.status] = (statusCounts[item.status] ?? 0) + 1;
  }

  return {
    totalChecked: needsPoll.length + staleItems.length,
    needingRecovery: needsPoll.length + staleItems.length,
    statusCounts,
    pollManagerRunning: isPollManagerRunning(),
  };
}
