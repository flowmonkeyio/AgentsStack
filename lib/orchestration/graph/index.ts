/**
 * Graph Module - Public Exports
 *
 * LangGraph graph definition, state schema, and utilities for the orchestration workflow.
 *
 * @see /docs/designs/orchestration/graph/TECH_DESIGN.md
 */

// =============================================================================
// TYPES
// =============================================================================

export type {
  // Graph trigger and state
  GraphTrigger,
  OrchestrationState,
  ContextRef,

  // Plan verification
  PlanVerifierOutput,

  // Planning agent
  PlanningAgentInput,
  PlanningAgentOutput,
  AgentSelectionReasoning,

  // Prompt agent
  PromptAgentInput,
  PromptAgentOutput,
  RetryContext,

  // Decisions and routing
  MainAgentDecision,
  PlanVerifierDecision,
  VerificationDecision,
  PaymentDecision,

  // Node types
  NodeOutput,
  LLMInvokeResult,
  TokenUsageTotals,

  // GraphRunner interface
  GraphRunner,
  StartJobInput,
  StartJobResult,
  ContinueJobInput,
  ContinueJobResult,

  // Events
  GraphEvent,

  // Checkpointing
  GraphCheckpoint,
  GraphCheckpointMetadata,

  // Tracing
  TracedNodeName,
  ApiNodeName,

  // Model configuration
  AgentType,
} from "./types";

// =============================================================================
// CONSTANTS
// =============================================================================

export { MODEL_CONFIG, MODEL_ALTERNATIVES, OPENROUTER_PRICING } from "./types";

// =============================================================================
// STATE
// =============================================================================

export {
  OrchestrationStateAnnotation,
  createInitialOrchestrationState,
  createContinuationState,
  createRecoveryState,
} from "./state";

// Re-export the state type for convenience
export type { OrchestrationState as GraphState } from "./state";

// =============================================================================
// UTILITIES
// =============================================================================

export {
  // Operation ID
  generateOperationId,

  // Token usage tracking
  appendOperation,
  appendOperations,

  // Cost calculation
  calculateCostFromUsage,
  computeTokenUsageTotals,

  // Operation creation
  createLLMOperation,

  // Plan helpers
  allTodosCompleted,
  getActionableTodos,
  synthesizeOutput,

  // Constants
  MAX_PLAN_VERIFICATION_ATTEMPTS,
  VERIFICATION_THRESHOLDS,
  MAX_VERIFICATION_RETRIES,
  MAX_PAYMENT_RETRIES,
} from "./utils";

// =============================================================================
// GRAPH
// =============================================================================

export {
  // Graph builders
  buildOrchestrationGraph,
  buildOrchestrationGraphWithCheckpointing,

  // Checkpointer
  createMongoCheckpointer,

  // Event handling
  setEventBus,
  emitEvent,

  // Tracing wrappers
  withTracing,
  withApiTracing,

  // Routers
  mainAgentRouter,
  planVerifierRouter,
  verificationRouter,
  paymentRouter,
} from "./graph";

export type {
  OrchestrationGraph,
  OrchestrationGraphWithCheckpointing,
  DispatchDependencies,
} from "./graph";

// =============================================================================
// NODES (re-exported for convenience)
// =============================================================================

// Node functions are implemented in ./nodes/ directory
// They are imported by graph.ts - export types for external use

export type { NodeFunction } from "./nodes";

// Note: Node implementations are NOT exported here because they are internal
// to the graph. External code should use the GraphRunner interface.
