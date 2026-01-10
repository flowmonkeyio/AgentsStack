/**
 * Orchestration Module - Public Exports
 *
 * This is the main entry point for the orchestration system.
 * The OrchestrationEngine is the primary interface for job execution.
 *
 * @see /docs/designs/orchestration/TECH_DESIGN.md
 */

// =============================================================================
// MAIN ENGINE (Primary API)
// =============================================================================

export {
  OrchestrationEngine,
  getOrchestrationEngine,
  type StartJobInput,
  type StartJobResult,
  type ContinueJobInput,
  type ContinueJobResult,
  type OrchestrationEvent,
  type OrchestrationEventCallback,
} from "./engine";

// =============================================================================
// GRAPH (LangGraph state machine)
// =============================================================================

export {
  // State
  OrchestrationStateAnnotation,
  createInitialOrchestrationState,
  createContinuationState,
  createRecoveryState,
  type OrchestrationState,
  type GraphState,

  // Graph builders
  buildOrchestrationGraph,
  buildOrchestrationGraphWithCheckpointing,
  createMongoCheckpointer,

  // Types
  type GraphTrigger,
  type GraphEvent,
  type GraphRunner,
  type OrchestrationGraph,
  type OrchestrationGraphWithCheckpointing,

  // Constants
  MODEL_CONFIG,
  MODEL_ALTERNATIVES,
  OPENROUTER_PRICING,

  // Utilities
  generateOperationId,
  appendOperation,
  appendOperations,
  calculateCostFromUsage,
  computeTokenUsageTotals,
  createLLMOperation,
  allTodosCompleted,
  getActionableTodos,

  // Thresholds
  MAX_PLAN_VERIFICATION_ATTEMPTS,
  VERIFICATION_THRESHOLDS,
  MAX_VERIFICATION_RETRIES,
  MAX_PAYMENT_RETRIES,
} from "./graph";

// =============================================================================
// DISCOVERY (Agent search via Voyage AI + MongoDB)
// =============================================================================

export {
  // Main service
  getDiscoveryService,
  createDiscoveryService,
  discoverAgentsWithEvents,
  discoverAgentsWithRetry,

  // Individual functions
  embedQuery,
  embedCapabilities,
  embedBatch,
  vectorSearch,
  vectorSearchWithFilter,
  rerankCandidates,
  simpleRerank,
  healthCheck,
  quickHealthCheck,

  // Types
  type DiscoveryRequest,
  type DiscoveryResult,
  type DiscoveryService,
  type VectorSearchResult,
  type RerankResult,
  type EmbeddingResult,
  type HealthCheckResult,
} from "./discovery";

// =============================================================================
// WORK LIFECYCLE (16-state machine)
// =============================================================================

export {
  // Main class
  createWorkLifecycle,
  type IWorkLifecycle,

  // Transitions
  TRANSITIONS,
  SPAWN_TRIGGERS,
  findTransition,
  getValidTriggers,
  isValidTransition,

  // Parallel execution (use alias to avoid conflict with graph's getActionableTodos)
  getActionableTodos as getActionableTodosFromPlan,
  getCompletedActionItemIds,
  executeParallel,
  executeReadyWorkItems,
  findAlternativeAgent,
  canReassign,
  buildReassignmentCriteria,
  createContinuationWorkItem,
  checkDependencyCascade,

  // Types
  type TransitionTrigger,
  type Transition,
  type TransitionResult,
  type WorkLifecycleEvent,
  type RetryLimits,
  type SpawnRequest,
  type SpawnResult,
  type ContinuationActionType,
  type ContinuationActionItem,
} from "./work-lifecycle";

// =============================================================================
// INTEGRATIONS (External services)
// =============================================================================

export {
  // Event bus
  emitEvent,
  subscribeToEvents,
  subscribeToEventType,
  subscribeOnce,

  // Galileo verification
  verifyWork,
  getVerificationDecision,
  isReadyForVerification,
  formatVerificationFeedback,
  VERIFICATION_THRESHOLDS as GALILEO_THRESHOLDS,
  MAX_VERIFICATION_RETRIES as GALILEO_MAX_RETRIES,

  // Payments
  payForWork,
  retryPayment,
  checkPaymentStatus,
  isReadyForPayment,
  calculatePaymentAmount,

  // External agent dispatch
  dispatchToAgent,
  pollAgent,
  handleAgentCallback,

  // Context management
  getContextSummary,
  getContextRefs,
  loadFullContent,
  prepareContextForPrompt,
  loadContextForTask,
  updateContextSummary,
  updateContextAfterWork,

  // Recovery
  startPollManager,
  stopPollManager,
  isPollManagerRunning,
  recoverInFlightWork,
  needsRecovery,
  getRecoveryPriority,
  getRecoveryHealthStatus,

  // Security
  verifyWebhookSignature,
  generateWebhookSignature,
  generateWebhookSecret,

  // Types
  type VerificationResult,
  type PaymentResult,
  type DispatchResult,
  type PollResult,
  type ContextRef as IntegrationContextRef,
  type IntegrationEvent,
} from "./integrations";

// =============================================================================
// LEGACY EXPORTS (for backwards compatibility with old graph.ts)
// =============================================================================

// The old graph.ts (lib/orchestration/graph.ts) exported these names
// Keep them for any existing code that might use them
export { OrchestrationStateAnnotation as JobStateAnnotation } from "./graph";
export { createInitialOrchestrationState as createInitialState } from "./graph";
export { buildOrchestrationGraph as buildJobGraph } from "./graph";
export type { OrchestrationState as JobState } from "./graph";
export type { OrchestrationGraph as JobGraph } from "./graph";
