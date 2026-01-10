/**
 * Galileo Module
 *
 * Verification (Instruction Adherence) + Observability (Tracing).
 *
 * @see /docs/designs/galileo/TECH_DESIGN.md
 */

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type {
  // Verification types
  VerifyRequest,
  VerifyResponse,
  CriterionResult,

  // Tracing types
  TraceEvent,
  TraceableInput,
  TraceAgentType,

  // Quality metrics types
  QualityMetrics,
  VerificationMetrics,
  AgentPerformanceMetrics,
  TimingMetrics,
  TokenMetrics,

  // Configuration types
  GalileoConfig,
  GalileoEnvironment,

  // Client interface
  GalileoClient,

  // Error types
  GalileoError,
  GalileoErrorCode,
} from "./types";

// =============================================================================
// CLIENT EXPORTS
// =============================================================================

export {
  // Factory functions
  createGalileoClient,
  createGalileoClientFromEnv,

  // Tracing wrapper
  withTracing,

  // Utility functions
  generateTraceId,
  sanitize,

  // Verification helpers
  VERIFICATION_THRESHOLDS,
  getVerificationDecision,
  isVerificationPassing,
  shouldRetryVerification,
  extractFailedCriteria,
} from "./client";

export type { VerificationDecision } from "./client";
