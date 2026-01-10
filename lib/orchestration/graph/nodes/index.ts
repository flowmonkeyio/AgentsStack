/**
 * Graph Nodes - Barrel Export
 *
 * This file exports all node implementations for the orchestration graph.
 * Node implementations are in separate files within this directory.
 *
 * @see /docs/designs/orchestration/graph/TECH_DESIGN.md
 */

import type { RequestContext } from "@/lib/logging";
import type { OrchestrationState } from "../types";

// =============================================================================
// NODE TYPE DEFINITIONS
// =============================================================================

/**
 * Type for a graph node function.
 * Takes ctx as first parameter and full state, returns partial state update.
 */
export type NodeFunction = (
  ctx: RequestContext,
  state: OrchestrationState
) => Promise<Partial<OrchestrationState>>;

// =============================================================================
// NODE EXPORTS - IMPLEMENTED
// =============================================================================

// Planning Agent - Creates plan with TODOs, agent picks, template picks
export {
  planningAgentNode,
  planningAgentNodeImpl,
  selectBestAgent,
} from "./planning-agent";
export type {
  PlanningAgentInput,
  PlanningAgentOutput,
  AgentSelectionReasoning,
} from "./planning-agent";

// Plan Verifier - MANDATORY GATE that validates plan before execution
export {
  planVerifierNode,
  planVerifierNodeImpl,
  MAX_PLAN_VERIFICATION_ATTEMPTS,
  validateCompleteness,
  validateDependencies,
  validateAgentPicks,
  validateTemplatePicks,
  validateBudget,
  detectCycles,
  verifyPlan,
} from "./plan-verifier";
export type { PlanVerifierInput } from "./plan-verifier";

// Prompt Agent - Generates final prompt from template + context
export {
  promptAgentNode,
  promptAgentNodeImpl,
  formatContext,
  formatRequirements,
  addRetryFeedback,
  substituteTemplate,
} from "./prompt-agent";
export type { PromptAgentInput, PromptAgentOutput } from "./prompt-agent";

// Dispatch and Poll - Sends work to external agent and waits for completion
export {
  dispatchPollNode,
  dispatchPollNodeImpl,
  createDispatchPollNode,
  pollUntilComplete,
  agentUsageToOperation,
  MAX_POLL_ATTEMPTS,
  DEFAULT_POLL_INTERVAL_MS,
  POLLING_TIMEOUT_MS,
} from "./dispatch-poll";
export type {
  DispatchPollDependencies,
  DispatchPollResult,
} from "./dispatch-poll";

// =============================================================================
// PLACEHOLDER NODE IMPLEMENTATIONS
// =============================================================================

// These are placeholder implementations for nodes not yet implemented.
// They will be implemented in separate files.

/**
 * Main Agent Node - Orchestrator that decides next action.
 *
 * Decisions:
 * - call_planning: Need to create/update plan
 * - execute_work: Execute actionable TODOs
 * - job_completed: All TODOs done
 * - job_failed: Error state
 *
 * @param ctx - Request context for logging
 * @param state - Current graph state
 * @returns Partial state update with decision
 */
export async function mainAgentNode(
  ctx: RequestContext,
  state: OrchestrationState
): Promise<Partial<OrchestrationState>> {
  // Placeholder - to be implemented
  throw new Error("mainAgentNode not implemented - see nodes/main-agent.ts");
}

/**
 * Galileo Verify Node - Verifies work output against requirements.
 *
 * Uses Galileo API for instruction adherence scoring.
 *
 * @param ctx - Request context for logging
 * @param state - Current graph state
 * @returns Partial state update with verification result
 */
export async function galileoVerifyNode(
  ctx: RequestContext,
  state: OrchestrationState
): Promise<Partial<OrchestrationState>> {
  // Placeholder - to be implemented
  throw new Error("galileoVerifyNode not implemented - see nodes/galileo-verify.ts");
}

/**
 * Payment Node - Processes payment for verified work.
 *
 * Uses x402 protocol for USDC payments.
 *
 * @param ctx - Request context for logging
 * @param state - Current graph state
 * @returns Partial state update with payment status
 */
export async function paymentNode(
  ctx: RequestContext,
  state: OrchestrationState
): Promise<Partial<OrchestrationState>> {
  // Placeholder - to be implemented
  throw new Error("paymentNode not implemented - see nodes/payment.ts");
}

/**
 * Dispatch and Poll Node (alias for compatibility)
 *
 * This is an alias for dispatchPollNode for backward compatibility.
 */
export { dispatchPollNode as dispatchAndPollNode } from "./dispatch-poll";
