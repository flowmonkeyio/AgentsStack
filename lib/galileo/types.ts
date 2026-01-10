/**
 * Galileo Module Types
 *
 * Type definitions for the Galileo verification and observability module.
 * Implements interfaces as specified in the technical design.
 *
 * @see /docs/designs/galileo/TECH_DESIGN.md
 */

import type { RequestContext } from "@/lib/logging";

// =============================================================================
// VERIFICATION TYPES
// =============================================================================

/**
 * Request for verifying agent output against instructions.
 */
export interface VerifyRequest {
  /** Agent's output (typed as unknown for type safety) */
  output: unknown;
  /** Requirements to check */
  instructions: string[];
  /** Optional context about the verification */
  context?: {
    /** What was asked */
    task: string;
    /** Which agent produced this */
    agent_id: string;
    /** Retry attempt number */
    attempt: number;
  };
}

/**
 * Result of evaluating a single criterion.
 */
export interface CriterionResult {
  /** The criterion being evaluated */
  criterion: string;
  /** Whether the criterion passed */
  passed: boolean;
  /** Explanation if failed */
  detail?: string;
}

/**
 * Response from verification.
 */
export interface VerifyResponse {
  /** 0-1 instruction adherence score */
  score: number;
  /** Why this score */
  reasoning: string;
  /** Results for each criterion */
  criteria_results: CriterionResult[];
  /** Summary of problems */
  issues: string[];
  /** How to fix (for retry) */
  suggestions: string[];
}

// =============================================================================
// TRACING / OBSERVABILITY TYPES
// =============================================================================

/**
 * Agent types that can be traced.
 */
export type TraceAgentType = "main" | "planning" | "plan_verifier" | "prompt";

/**
 * Event captured for observability.
 */
export interface TraceEvent {
  /** Unique trace ID */
  trace_id: string;
  /** Job ID this trace belongs to */
  job_id: string;
  /** When this event occurred */
  timestamp: Date;
  /** Which agent is being traced */
  agent: TraceAgentType;
  /** What step in the agent */
  step: string;
  /** What the agent received */
  input: unknown;
  /** What the agent returned */
  output: unknown;
  /** Agent's thinking (if available) */
  reasoning?: string;
  /** What decision was made */
  decision?: string;
  /** How long it took */
  duration_ms: number;
  /** Token usage for this operation */
  tokens_used?: {
    input: number;
    output: number;
  };
  /** Additional context */
  metadata?: Record<string, unknown>;
}

/**
 * Base interface for all traceable inputs.
 * Must have job_id for correlation.
 */
export interface TraceableInput {
  job_id: string;
}

// =============================================================================
// QUALITY METRICS TYPES
// =============================================================================

/**
 * Verification metrics for a job.
 */
export interface VerificationMetrics {
  total_verifications: number;
  pass_rate: number;
  average_score: number;
  retry_rate: number;
  rejection_rate: number;
}

/**
 * Performance metrics for a specific agent.
 */
export interface AgentPerformanceMetrics {
  agent_id: string;
  verifications: number;
  average_score: number;
  pass_rate: number;
}

/**
 * Timing metrics for a job.
 */
export interface TimingMetrics {
  total_duration_ms: number;
  planning_duration_ms: number;
  execution_duration_ms: number;
  verification_duration_ms: number;
}

/**
 * Token usage metrics for a job.
 */
export interface TokenMetrics {
  total_input: number;
  total_output: number;
  by_agent: Record<string, { input: number; output: number }>;
}

/**
 * Comprehensive quality metrics for a job.
 */
export interface QualityMetrics {
  job_id: string;
  /** Verification metrics */
  verification: VerificationMetrics;
  /** Agent performance metrics */
  agent_performance: Record<string, AgentPerformanceMetrics>;
  /** Timing metrics */
  timing: TimingMetrics;
  /** Token usage */
  tokens: TokenMetrics;
}

// =============================================================================
// CLIENT CONFIGURATION
// =============================================================================

/**
 * Environment for Galileo API.
 */
export type GalileoEnvironment = "development" | "production";

/**
 * Configuration for creating a Galileo client.
 */
export interface GalileoConfig {
  /** API key for Galileo */
  apiKey: string;
  /** Project ID in Galileo */
  projectId: string;
  /** Environment (defaults to production) */
  environment?: GalileoEnvironment;
}

// =============================================================================
// CLIENT INTERFACE
// =============================================================================

/**
 * Galileo client interface for verification and observability.
 */
export interface GalileoClient {
  /**
   * Verify agent output against instructions.
   * @param ctx - Request context for tracing
   * @param request - Verification request
   * @returns Verification response with score and feedback
   */
  verify(ctx: RequestContext, request: VerifyRequest): Promise<VerifyResponse>;

  /**
   * Record a trace event for observability.
   * @param ctx - Request context for tracing
   * @param event - Trace event to record
   */
  trace(ctx: RequestContext, event: TraceEvent): Promise<void>;

  /**
   * Record multiple trace events at once (for efficiency).
   * @param ctx - Request context for tracing
   * @param events - Array of trace events
   */
  traceBatch(ctx: RequestContext, events: TraceEvent[]): Promise<void>;

  /**
   * Get quality metrics for a job.
   * @param ctx - Request context for tracing
   * @param job_id - Job ID to get metrics for
   * @returns Quality metrics for the job
   */
  getJobMetrics(ctx: RequestContext, job_id: string): Promise<QualityMetrics>;
}

// =============================================================================
// ERROR TYPES
// =============================================================================

/**
 * Error codes from Galileo API.
 */
export type GalileoErrorCode =
  | "RATE_LIMITED"
  | "INVALID_INPUT"
  | "API_ERROR"
  | "NETWORK_ERROR"
  | "TIMEOUT";

/**
 * Error from Galileo operations.
 */
export interface GalileoError extends Error {
  code: GalileoErrorCode;
  statusCode?: number;
  retryable: boolean;
}
