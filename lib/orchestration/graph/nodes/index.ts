/**
 * Graph Nodes - Barrel Export
 *
 * This file exports all node implementations for the orchestration graph.
 * Node implementations are in separate files within this directory.
 *
 * Nodes:
 * - main_agent: Orchestrator that decides next action
 * - planning_agent: Creates plan, picks agents and templates
 * - plan_verifier: MANDATORY GATE - validates plan before execution
 * - prompt_agent: Generates final prompt from template + context
 * - dispatch_poll: Sends work to external agent and waits for completion
 * - galileo_verify: Verifies work output using Galileo API
 * - payment: Processes payment for verified work
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
// MAIN AGENT NODE
// =============================================================================

// Main Agent - Orchestrator that decides next action
export {
  mainAgentNode,
  mainAgentNodeImpl,
  createWorkItem,
} from "./main-agent";

// =============================================================================
// PLANNING AGENT NODE
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

// =============================================================================
// PLAN VERIFIER NODE
// =============================================================================

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

// =============================================================================
// PROMPT AGENT NODE
// =============================================================================

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

// =============================================================================
// DISPATCH AND POLL NODE
// =============================================================================

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

/**
 * Dispatch and Poll Node (alias for compatibility with graph.ts)
 */
export { dispatchPollNode as dispatchAndPollNode } from "./dispatch-poll";

// =============================================================================
// GALILEO VERIFY NODE
// =============================================================================

// Galileo Verify - Verifies work output against requirements
export {
  galileoVerifyNode,
  galileoVerifyNodeImpl,
  setGalileoVerifyDependencies,
  createGalileoVerifyNode,
} from "./galileo-verify";
export type { GalileoVerifyDependencies } from "./galileo-verify";

// =============================================================================
// PAYMENT NODE
// =============================================================================

// Payment - Processes payment for verified work
export {
  paymentNode,
  paymentNodeImpl,
  setPaymentDependencies,
  createPaymentNode,
} from "./payment";
export type { PaymentDependencies } from "./payment";
