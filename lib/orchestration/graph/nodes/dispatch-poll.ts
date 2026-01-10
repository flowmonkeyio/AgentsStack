/**
 * Dispatch and Poll Node
 *
 * Handles dispatching work to external agents and polling for results.
 * Supports both synchronous and asynchronous execution patterns.
 *
 * This node delegates to the ORCH_INTEGRATIONS module for actual HTTP calls.
 *
 * @see /docs/designs/orchestration/graph/TECH_DESIGN.md
 */

import { nanoid } from "nanoid";
import type { LLMOperation, WorkItem, Agent, AgentUsage } from "@/types";
import { withTracing } from "@/lib/galileo";
import type { RequestContext } from "@/lib/logging";
import { createLogger } from "@/lib/logging";
import type { OrchestrationState } from "../types";
import type { DispatchResult, PollResult } from "@/lib/orchestration/integrations";

const logger = createLogger("graph");

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Dependencies for dispatch operations
 */
export interface DispatchPollDependencies {
  /**
   * Dispatch work to an external agent
   * @param ctx - Request context for logging
   * @param work_id - Work item ID
   * @returns Dispatch result (sync or async)
   */
  dispatchToAgent: (ctx: RequestContext, work_id: string) => Promise<DispatchResult>;

  /**
   * Poll an async agent for completion
   * @param ctx - Request context for logging
   * @param work_id - Work item ID
   * @returns Poll result
   */
  pollAgent: (ctx: RequestContext, work_id: string) => Promise<PollResult>;

  /**
   * Get work item from database
   * @param ctx - Request context for logging
   * @param work_id - Work item ID
   */
  getWorkItem: (ctx: RequestContext, work_id: string) => Promise<WorkItem | null>;

  /**
   * Get agent from database
   * @param ctx - Request context for logging
   * @param agent_id - Agent ID
   */
  getAgent: (ctx: RequestContext, agent_id: string) => Promise<Agent | null>;
}

/**
 * Result from dispatch and poll operation
 */
export interface DispatchPollResult {
  /** Whether operation completed (sync or poll finished) */
  completed: boolean;
  /** Output if completed */
  output?: unknown;
  /** Whether we're waiting for async result */
  pending?: boolean;
  /** Reference ID for async tracking */
  reference_id?: string;
  /** Error if failed */
  error?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Maximum number of polling attempts before timeout
 */
const MAX_POLL_ATTEMPTS = 200; // 10 minutes at 3s intervals

/**
 * Default polling interval (milliseconds)
 */
const DEFAULT_POLL_INTERVAL_MS = 3000;

/**
 * Polling timeout (milliseconds)
 */
const POLLING_TIMEOUT_MS = 600000; // 10 minutes

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Generate operation ID for external agent usage tracking
 */
function generateOperationId(): string {
  return `op_${nanoid(12)}`;
}

/**
 * Append operation to usage array (pure function)
 */
function appendOperation(
  currentUsage: LLMOperation[],
  operation: LLMOperation
): LLMOperation[] {
  return [...currentUsage, operation];
}

/**
 * Convert AgentUsage to LLMOperation for tracking
 */
function agentUsageToOperation(
  usage: AgentUsage,
  workId: string,
  agentId: string
): LLMOperation[] {
  // If breakdown provided, create operations for each model
  if (usage.model_usage && usage.model_usage.length > 0) {
    return usage.model_usage.map((mu) => ({
      operation_id: generateOperationId(),
      timestamp: new Date(),
      operation_type: "external_agent" as const,
      model: mu.model,
      native_tokens_prompt: mu.native_tokens_prompt,
      native_tokens_completion: mu.native_tokens_completion,
      total_cost: mu.total_cost,
      metadata: {
        work_id: workId,
        agent_id: agentId,
        source: "external_agent_response",
      },
    }));
  }

  // Single operation with total cost
  return [
    {
      operation_id: generateOperationId(),
      timestamp: new Date(),
      operation_type: "external_agent" as const,
      model: "unknown",
      total_cost: usage.total_cost,
      metadata: {
        work_id: workId,
        agent_id: agentId,
        source: "external_agent_response",
        note: "Agent returned total_cost without model breakdown",
      },
    },
  ];
}

/**
 * Sleep utility for polling intervals
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// NODE IMPLEMENTATION
// =============================================================================

/**
 * Dispatch and Poll Node Implementation
 *
 * Dispatches work to external agent and handles response.
 * For async agents, polls until completion or timeout.
 *
 * @param ctx - Request context for logging
 * @param state - Current graph state
 * @param deps - Dependencies for dispatch operations
 * @returns Partial state update
 */
async function dispatchPollNodeImpl(
  ctx: RequestContext,
  state: OrchestrationState,
  deps?: DispatchPollDependencies
): Promise<Partial<OrchestrationState>> {
  // Get current work item that's ready for dispatch
  const currentWork = state.current_work_items.find(
    (w) => w.status === "pending" || w.status === "dispatched"
  );
  if (!currentWork) {
    logger.warn(ctx, `operation=dispatch_poll job_id=${state.job_id} result=fail reason=no_work_item`);
    return {
      error: "No work item ready for dispatch",
      reasoning: "No pending or dispatched work item in state",
      decision: "failed",
    };
  }

  const workId = currentWork.work_id;
  const agentId = currentWork.agent?.agent_id ?? "unknown";

  logger.info(ctx, `operation=dispatch_poll work_id=${workId} agent_id=${agentId} status=started`);

  // If no dependencies provided, we're in a simulation/test mode
  if (!deps) {
    logger.debug(ctx, `operation=dispatch_poll work_id=${workId} status=simulated`);
    return {
      reasoning: `Simulated dispatch for work ${workId}`,
      decision: "sync_completed",
    };
  }

  try {
    // Dispatch to external agent
    const dispatchResult = await deps.dispatchToAgent(ctx, workId);

    // Handle sync response (immediate result)
    if (dispatchResult.type === "sync") {
      logger.info(ctx, `operation=dispatch_poll work_id=${workId} agent_id=${agentId} status=completed type=sync`);
      return {
        reasoning: `Sync response received for work ${workId}`,
        decision: "output_received",
      };
    }

    // Handle async response (need to poll)
    if (dispatchResult.type === "async" && dispatchResult.reference_id) {
      logger.info(ctx, `operation=dispatch_poll work_id=${workId} agent_id=${agentId} status=polling reference_id=${dispatchResult.reference_id}`);
      const pollResult = await pollUntilComplete(ctx, workId, deps, agentId);

      if (pollResult.completed && pollResult.output) {
        logger.info(ctx, `operation=dispatch_poll work_id=${workId} agent_id=${agentId} status=completed type=async`);
        return {
          reasoning: `Async response received for work ${workId} after polling`,
          decision: "output_received",
        };
      }

      logger.warn(ctx, `operation=dispatch_poll work_id=${workId} agent_id=${agentId} status=failed reason=polling_failed`);
      return {
        error: pollResult.error ?? "Polling timeout",
        reasoning: `Polling failed: ${pollResult.error ?? "timeout"}`,
        decision: "retry_or_fail",
      };
    }

    logger.error(ctx, `operation=dispatch_poll work_id=${workId} status=failed reason=unexpected_result_type`);
    return {
      error: "Unexpected dispatch result type",
      reasoning: "Dispatch returned unexpected result type",
      decision: "failed",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(ctx, `operation=dispatch_poll work_id=${workId} agent_id=${agentId} status=failed`, error instanceof Error ? error : undefined);
    return {
      error: `Dispatch failed: ${errorMessage}`,
      reasoning: `Dispatch threw exception: ${errorMessage}`,
      decision: "retry_or_fail",
    };
  }
}

/**
 * Poll until work completes or times out
 *
 * @param ctx - Request context for logging
 * @param workId - Work item ID
 * @param deps - Dependencies for polling
 * @param agentId - Agent ID for logging
 * @returns Poll result
 */
async function pollUntilComplete(
  ctx: RequestContext,
  workId: string,
  deps: DispatchPollDependencies,
  agentId: string
): Promise<DispatchPollResult> {
  const startTime = Date.now();
  let attempts = 0;
  let interval = DEFAULT_POLL_INTERVAL_MS;

  while (attempts < MAX_POLL_ATTEMPTS) {
    // Check timeout
    if (Date.now() - startTime > POLLING_TIMEOUT_MS) {
      logger.warn(ctx, `operation=poll_complete work_id=${workId} agent_id=${agentId} result=timeout duration_ms=${Date.now() - startTime}`);
      return {
        completed: false,
        error: `Polling timeout after ${POLLING_TIMEOUT_MS / 1000} seconds`,
      };
    }

    // Wait before polling
    await sleep(interval);
    attempts++;

    try {
      const pollResult = await deps.pollAgent(ctx, workId);

      // Completed successfully
      if (pollResult.status === "completed") {
        logger.debug(ctx, `operation=poll_complete work_id=${workId} agent_id=${agentId} result=completed attempts=${attempts}`);
        return {
          completed: true,
          output: pollResult.output,
        };
      }

      // Failed permanently
      if (pollResult.status === "failed") {
        logger.warn(ctx, `operation=poll_complete work_id=${workId} agent_id=${agentId} result=failed attempts=${attempts}`);
        return {
          completed: false,
          error: pollResult.error ?? "Agent task failed",
        };
      }

      // Still pending - adjust interval based on elapsed time
      const elapsed = Date.now() - startTime;
      if (elapsed < 30000) {
        interval = 3000; // First 30s: every 3s
      } else if (elapsed < 120000) {
        interval = 5000; // 30s-2min: every 5s
      } else if (elapsed < 300000) {
        interval = 10000; // 2-5min: every 10s
      } else {
        interval = 15000; // 5-10min: every 15s
      }

      logger.debug(ctx, `operation=poll_attempt work_id=${workId} agent_id=${agentId} attempt=${attempts} status=pending next_interval_ms=${interval}`);
    } catch (error) {
      // Log polling error but continue (could be transient)
      logger.warn(ctx, `operation=poll_attempt work_id=${workId} agent_id=${agentId} attempt=${attempts} status=error`, error instanceof Error ? error : undefined);
    }
  }

  logger.warn(ctx, `operation=poll_complete work_id=${workId} agent_id=${agentId} result=max_attempts attempts=${attempts}`);
  return {
    completed: false,
    error: `Max polling attempts (${MAX_POLL_ATTEMPTS}) exceeded`,
  };
}

/**
 * Exported dispatch-poll node (without tracing wrapper - tracing applied in graph.ts)
 */
export const dispatchPollNode = dispatchPollNodeImpl;

/**
 * Re-export for direct use
 */
export { dispatchPollNodeImpl };

/**
 * Export utilities for testing
 */
export {
  pollUntilComplete,
  agentUsageToOperation,
  MAX_POLL_ATTEMPTS,
  DEFAULT_POLL_INTERVAL_MS,
  POLLING_TIMEOUT_MS,
};

/**
 * Create a dispatch-poll node with injected dependencies
 *
 * This allows the graph to inject the actual implementation
 * of dispatch and poll functions from the integrations module.
 *
 * @param deps - Dependencies for dispatch operations
 * @returns Node function with ctx as first parameter
 */
export function createDispatchPollNode(
  deps: DispatchPollDependencies
): (ctx: RequestContext, state: OrchestrationState) => Promise<Partial<OrchestrationState>> {
  return async (ctx: RequestContext, state: OrchestrationState) => {
    return dispatchPollNodeImpl(ctx, state, deps);
  };
}
