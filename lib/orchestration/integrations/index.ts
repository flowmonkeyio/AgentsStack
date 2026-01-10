/**
 * Integrations Module
 *
 * External module calls: Galileo verify, Payments, External Agents, Recovery.
 *
 * This module provides integration adapters for:
 * - Galileo verification (instruction adherence)
 * - Payment execution (x402 protocol)
 * - External agent dispatch and polling
 * - Context management (lazy loading)
 * - Recovery mechanisms (poll manager, system restart)
 *
 * @see /docs/designs/orchestration/integrations/TECH_DESIGN.md
 */

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type {
  // Result types
  VerificationResult,
  PaymentResult,
  DispatchResult,
  PollResult,

  // Context types
  ContextRef,
  PreparedContext,

  // Event types
  IntegrationEvent,
  WorkVerifiedEvent,
  WorkRetryEvent,
  WorkFailedEvent,
  WorkPaymentConfirmedEvent,
  WorkOutputReceivedEvent,
  WorkUsageRecordedEvent,

  // Callback types
  AgentCallbackRequest,

  // Configuration types
  PollManagerConfig,

  // Summarization types
  SummarizationResult,
  TitleAndDescription,

  // Error types
  IntegrationType,
} from "./types";

export { IntegrationError, DEFAULT_POLL_MANAGER_CONFIG } from "./types";

// =============================================================================
// EVENT EXPORTS
// =============================================================================

export type { IntegrationEventHandler } from "./events";

export {
  // Event emission
  emitEvent,

  // Event subscription
  subscribeToEvents,
  subscribeToEventType,
  subscribeOnce,

  // Event bus utilities
  getListenerCount,
  removeAllListeners,
  getEventBus,
} from "./events";

// =============================================================================
// SECURITY EXPORTS
// =============================================================================

export type { SignatureVerificationResult } from "./security";

export {
  // HMAC verification
  verifyWebhookSignature,
  verifyWebhookSignatureWithDetails,

  // Signature generation
  generateWebhookSignature,

  // Validation helpers
  isValidWebhookSecret,
  generateWebhookSecret,
} from "./security";

// =============================================================================
// GALILEO INTEGRATION EXPORTS
// =============================================================================

export type { VerificationDependencies } from "./galileo";

export {
  // Verification
  verifyWork,

  // Decision logic
  getVerificationDecision,
  VERIFICATION_THRESHOLDS,
  MAX_VERIFICATION_RETRIES,

  // Helpers
  isReadyForVerification,
  formatVerificationFeedback,
} from "./galileo";

// =============================================================================
// PAYMENTS INTEGRATION EXPORTS
// =============================================================================

export type { PaymentDependencies } from "./payments";

export {
  // Payment execution
  payForWork,
  retryPayment,
  checkPaymentStatus,

  // Helpers
  isReadyForPayment,
  calculatePaymentAmount,
  formatPaymentDetails,
} from "./payments";

// =============================================================================
// DISPATCH INTEGRATION EXPORTS
// =============================================================================

export type { DispatchDependencies } from "./dispatch";

export {
  // Dispatch and polling
  dispatchToAgent,
  pollAgent,

  // Polling utilities
  calculateNextPollInterval,

  // Webhook handler
  handleAgentCallback,
} from "./dispatch";

// =============================================================================
// CONTEXT EXPORTS
// =============================================================================

export {
  // Context retrieval
  getContextSummary,
  getContextRefs,
  loadFullContent,

  // Context preparation
  prepareContextForPrompt,
  loadContextForTask,

  // Summarization
  generateTitleAndDescription,
  updateContextSummary,
  shouldUpdateSummary,

  // Context update
  updateContextAfterWork,
} from "./context";

// =============================================================================
// RECOVERY EXPORTS
// =============================================================================

export type { RecoveryDependencies, RecoveryHealthStatus } from "./recovery";

export {
  // Poll manager
  startPollManager,
  stopPollManager,
  isPollManagerRunning,

  // System restart recovery
  recoverInFlightWork,

  // Recovery utilities
  needsRecovery,
  getRecoveryPriority,
  sortByRecoveryPriority,

  // Health check
  getRecoveryHealthStatus,
} from "./recovery";
