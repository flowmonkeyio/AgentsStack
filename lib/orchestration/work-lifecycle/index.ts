/**
 * Work Lifecycle Module
 *
 * 16-state work item machine, transitions, parallel execution, and dynamic spawning.
 *
 * @see /docs/designs/orchestration/work-lifecycle/TECH_DESIGN.md
 */

// =============================================================================
// TYPES
// =============================================================================

export type {
  // Transition types
  TransitionTrigger,
  TransitionPayloadMap,
  PayloadFor,
  Transition,
  TransitionResult,

  // Payload types
  PromptGeneratedPayload,
  AsyncResponsePayload,
  SyncResponsePayload,
  PollCompletedPayload,
  VerificationPayload,
  VerificationRetryPayload,
  TryNewAgentPayload,
  AgentReassignedPayload,
  PaymentConfirmedPayload,

  // Event types
  WorkLifecycleEvent,

  // Retry types
  RetryLimits,
  RetryType,

  // Parallel execution types
  WorkExecutionResult,

  // Spawn types
  SpawnRequest,
  SpawnResult,
  SpawnableOutput,
  SpawnedTodoDefinition,
  SpawnTrigger,

  // Continuation types
  ContinuationActionType,
  ContinuationWorkItemData,
  ContinuationActionItem,
  ContinuationEvent,

  // Cascade types
  CascadeAnalysisResult,
  CascadeDecisionInput,

  // Reassignment types
  ReassignmentCriteria,

  // Interface
  IWorkLifecycle,
} from "./types";

export { DEFAULT_RETRY_LIMITS, MAX_REASSIGNMENTS } from "./types";

// =============================================================================
// TRANSITIONS
// =============================================================================

export { TRANSITIONS, SPAWN_TRIGGERS, findTransition, getValidTriggers, isValidTransition } from "./transitions";

// =============================================================================
// STATE MACHINE
// =============================================================================

export type { ExtendedDatabaseClient, EventEmitter } from "./state-machine";
export { WorkLifecycle, createWorkLifecycle } from "./state-machine";

// =============================================================================
// PARALLEL EXECUTION
// =============================================================================

export type { ExecuteWorkItemFn } from "./parallel";

export {
  // Dependency resolution
  getActionableTodos,
  getCompletedActionItemIds,

  // Parallel execution
  executeParallel,
  executeReadyWorkItems,

  // Agent reassignment
  findAlternativeAgent,
  canReassign,
  buildReassignmentCriteria,

  // Continuation
  createContinuationWorkItem,
  checkDependencyCascade,
  CONTINUATION_LOADING_PATTERNS,
} from "./parallel";
