/**
 * Graph Module Utility Functions
 *
 * Utilities for operation ID generation, token tracking, and cost calculation.
 *
 * @see /docs/designs/orchestration/graph/TECH_DESIGN.md
 */

import { randomUUID } from "crypto";
import type { LLMOperation } from "@/types";
import type { TokenUsageTotals, AgentType } from "./types";
import { OPENROUTER_PRICING } from "./types";

// =============================================================================
// OPERATION ID GENERATION
// =============================================================================

/**
 * Generates a unique operation ID for cost tracking.
 * Format: op_{uuid} - consistent with discovery module pattern.
 *
 * @returns Unique operation ID string (e.g., "op_550e8400-e29b-41d4-a716-446655440000")
 */
export function generateOperationId(): string {
  return `op_${randomUUID()}`;
}

// =============================================================================
// TOKEN USAGE TRACKING
// =============================================================================

/**
 * Append a new operation to the token_usage array.
 * Returns a new array (immutable) for state update.
 *
 * This is the primary way to track LLM costs in the graph.
 * Each node should use this to add its operation to state.
 *
 * @param currentUsage - Current token_usage array from state
 * @param operation - New operation to append
 * @returns New array with operation appended
 *
 * @example
 * ```typescript
 * // In a node function:
 * const result = await invokePlanningLLM(input);
 * return {
 *   plan: result.data,
 *   token_usage: appendOperation(state.token_usage, result.operation),
 *   reasoning: "Created plan..."
 * };
 * ```
 */
export function appendOperation(
  currentUsage: LLMOperation[],
  operation: LLMOperation
): LLMOperation[] {
  return [...currentUsage, operation];
}

/**
 * Append multiple operations to the token_usage array.
 * Useful when a node makes multiple LLM calls.
 *
 * @param currentUsage - Current token_usage array from state
 * @param operations - New operations to append
 * @returns New array with operations appended
 */
export function appendOperations(
  currentUsage: LLMOperation[],
  operations: LLMOperation[]
): LLMOperation[] {
  return [...currentUsage, ...operations];
}

// =============================================================================
// COST CALCULATION
// =============================================================================

/**
 * Calculate cost from token usage using OpenRouter pricing.
 * This is a fallback - actual cost should come from OpenRouter response.
 *
 * @param model - Model identifier (e.g., "anthropic/claude-sonnet-4")
 * @param usage - Token counts
 * @returns Cost in USD
 */
export function calculateCostFromUsage(
  model: string,
  usage: { prompt_tokens?: number; completion_tokens?: number }
): number {
  const pricing = OPENROUTER_PRICING[model] ?? { input: 1.0, output: 1.0 };
  const promptCost = ((usage.prompt_tokens ?? 0) / 1_000_000) * pricing.input;
  const completionCost =
    ((usage.completion_tokens ?? 0) / 1_000_000) * pricing.output;

  return promptCost + completionCost;
}

/**
 * Compute aggregated totals from operations array.
 * Useful for job summary, billing, and analytics.
 *
 * @param operations - Array of LLM operations
 * @returns Aggregated totals
 */
export function computeTokenUsageTotals(
  operations: LLMOperation[]
): TokenUsageTotals {
  const totals: TokenUsageTotals = {
    total_cost: 0,
    total_prompt_tokens: 0,
    total_completion_tokens: 0,
    by_operation_type: {},
  };

  for (const op of operations) {
    totals.total_cost += op.total_cost;
    totals.total_prompt_tokens += op.native_tokens_prompt ?? 0;
    totals.total_completion_tokens += op.native_tokens_completion ?? 0;

    if (!totals.by_operation_type[op.operation_type]) {
      totals.by_operation_type[op.operation_type] = { cost: 0, count: 0 };
    }
    totals.by_operation_type[op.operation_type].cost += op.total_cost;
    totals.by_operation_type[op.operation_type].count += 1;
  }

  return totals;
}

// =============================================================================
// OPERATION CREATION HELPERS
// =============================================================================

/**
 * Create an LLMOperation record from OpenRouter response.
 *
 * @param agentType - Type of agent making the call
 * @param model - Model used
 * @param usage - Token usage from response
 * @param durationMs - Duration in milliseconds
 * @param finishReason - Finish reason from response
 * @param metadata - Optional additional metadata
 * @returns Complete LLMOperation record
 */
export function createLLMOperation(
  agentType: AgentType | LLMOperation["operation_type"],
  model: string,
  usage: { prompt_tokens?: number; completion_tokens?: number },
  durationMs: number,
  finishReason: string,
  metadata?: Record<string, unknown>
): LLMOperation {
  return {
    operation_id: generateOperationId(),
    timestamp: new Date(),
    operation_type: agentType as LLMOperation["operation_type"],
    model,
    native_tokens_prompt: usage.prompt_tokens,
    native_tokens_completion: usage.completion_tokens,
    total_cost: calculateCostFromUsage(model, usage),
    metadata: {
      duration_ms: durationMs,
      finish_reason: finishReason,
      ...metadata,
    },
  };
}

// =============================================================================
// PLAN VERIFICATION CONSTANTS
// =============================================================================

/**
 * Maximum number of plan verification attempts before terminal failure.
 */
export const MAX_PLAN_VERIFICATION_ATTEMPTS = 3;

// =============================================================================
// VERIFICATION THRESHOLDS
// =============================================================================

/**
 * Verification score thresholds for routing decisions.
 */
export const VERIFICATION_THRESHOLDS = {
  /** Score >= this passes */
  pass: 0.9,
  /** Score >= this AND < pass allows retry */
  retry: 0.6,
  /** Score < retry results in reject */
} as const;

/**
 * Maximum number of verification retries per work item.
 */
export const MAX_VERIFICATION_RETRIES = 3;

// =============================================================================
// PAYMENT RETRY LIMITS
// =============================================================================

/**
 * Maximum number of payment retry attempts.
 */
export const MAX_PAYMENT_RETRIES = 3;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if all TODOs in a plan are completed.
 *
 * @param plan - The plan with action items
 * @param completedWorkIds - IDs of completed work items
 * @returns True if all TODOs are done
 */
export function allTodosCompleted(
  plan: { action_items: Array<{ work_id: string | null }> } | undefined,
  completedWorkIds: string[]
): boolean {
  if (!plan) return false;

  const completedSet = new Set(completedWorkIds);

  return plan.action_items.every(
    (item) => item.work_id && completedSet.has(item.work_id)
  );
}

/**
 * Get action items that are ready for execution.
 * An item is actionable if:
 * - It's not already completed
 * - All its dependencies are completed
 *
 * @param plan - The plan with action items
 * @param completedWorkIds - IDs of completed work items
 * @returns Array of actionable action items
 */
export function getActionableTodos<
  T extends {
    id: number;
    work_id: string | null;
    depends_on: number[];
    status: string;
  }
>(
  plan: { action_items: T[] } | undefined,
  completedWorkIds: string[]
): T[] {
  if (!plan) return [];

  const completedSet = new Set(completedWorkIds);

  // Find which action item IDs are completed
  const completedItemIds = new Set(
    plan.action_items
      .filter((item) => item.work_id && completedSet.has(item.work_id))
      .map((item) => item.id)
  );

  // Return items that are not completed and have all dependencies satisfied
  return plan.action_items.filter((item) => {
    // Skip if already completed
    if (item.work_id && completedSet.has(item.work_id)) return false;

    // Skip if already in progress
    if (item.status === "in_progress") return false;

    // Check all dependencies are completed
    return item.depends_on.every((depId) => completedItemIds.has(depId));
  });
}

/**
 * Synthesize final output from completed work items.
 * This is a placeholder - actual implementation depends on output format.
 *
 * @param state - Current graph state
 * @returns Synthesized output
 */
export function synthesizeOutput(state: {
  completed_work_ids: string[];
  plan?: { action_items: Array<{ id: number; item: string }> };
}): Record<string, unknown> {
  return {
    completed_items: state.completed_work_ids.length,
    plan_items: state.plan?.action_items.length ?? 0,
    status: "completed",
  };
}
