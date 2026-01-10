/**
 * Integrations Module Types
 *
 * Type definitions for the integrations module including:
 * - Verification types
 * - Payment types
 * - Dispatch/Polling types
 * - Context types
 * - Event types
 *
 * @see /docs/designs/orchestration/integrations/TECH_DESIGN.md
 */

import type { CriteriaResult, LLMOperation, AgentUsage } from "@/types";

// =============================================================================
// VERIFICATION TYPES
// =============================================================================

/**
 * Result of verifying work output with Galileo
 */
export interface VerificationResult {
  /** 0-1 instruction adherence score */
  score: number;
  /** Whether verification passed (score >= 0.90) */
  passed: boolean;
  /** Decision: pass, retry, or reject */
  decision: "pass" | "retry" | "reject";
  /** Results for each verification criterion */
  criteria_results: CriteriaResult[];
  /** Summary of problems found */
  issues: string[];
  /** Suggestions for improvement (for retry) */
  suggestions: string[];
}

// =============================================================================
// PAYMENT TYPES
// =============================================================================

/**
 * Result of payment execution
 */
export interface PaymentResult {
  /** Whether the payment succeeded */
  success: boolean;
  /** Transaction hash (on success) */
  tx_hash?: string;
  /** Error message (on failure) */
  error?: string;
  /** Whether a retry is suggested */
  retry_suggested?: boolean;
}

// =============================================================================
// DISPATCH TYPES
// =============================================================================

/**
 * Result of dispatching work to an external agent.
 * Can be either sync (immediate) or async (polling required).
 */
export interface DispatchResult {
  /** Type of response */
  type: "sync" | "async";
  /** Agent output for sync responses - heterogeneous agent output */
  output?: unknown;
  /** Reference ID for async responses */
  reference_id?: string;
  /** Status URL for async responses */
  status_url?: string;
}

/**
 * Result of polling an async agent task
 */
export interface PollResult {
  /** Current status */
  status: "pending" | "completed" | "failed";
  /** Output if completed - heterogeneous agent output */
  output?: unknown;
  /** Error message if failed */
  error?: string;
  /** Progress percentage (0-1) */
  progress?: number;
}

// =============================================================================
// CONTEXT TYPES
// =============================================================================

/**
 * Reference to a completed work item's output.
 * Contains metadata but not full content (lazy loading).
 */
export interface ContextRef {
  /** Work item ID */
  work_id: string;
  /** Short title of the output */
  title: string;
  /** Brief description of content */
  description: string;
}

/**
 * Context prepared for prompt generation.
 * Includes summary, references, and selectively loaded content.
 */
export interface PreparedContext {
  /** Rolling summary (~100 words) */
  summary: string;
  /** References to all completed work items */
  refs: ContextRef[];
  /** Pre-loaded dependency outputs (keyed by work_id) */
  loaded_content: Record<string, unknown>;
}

// =============================================================================
// EVENT TYPES
// =============================================================================

/**
 * Base event type with required type field
 */
interface BaseIntegrationEvent {
  type: string;
}

/**
 * Event: Work output verified
 */
export interface WorkVerifiedEvent extends BaseIntegrationEvent {
  type: "work:verified";
  work_id: string;
  score: number;
  passed: boolean;
}

/**
 * Event: Work needs retry
 */
export interface WorkRetryEvent extends BaseIntegrationEvent {
  type: "work:retry";
  work_id: string;
  attempt: number;
  reason: string;
  issues: string[];
}

/**
 * Event: Work failed permanently
 */
export interface WorkFailedEvent extends BaseIntegrationEvent {
  type: "work:failed";
  work_id: string;
  reason: string;
}

/**
 * Event: Payment confirmed
 */
export interface WorkPaymentConfirmedEvent extends BaseIntegrationEvent {
  type: "work:payment_confirmed";
  work_id: string;
  amount: number;
  tx_hash: string;
}

/**
 * Event: Output received from agent
 */
export interface WorkOutputReceivedEvent extends BaseIntegrationEvent {
  type: "work:output_received";
  work_id: string;
  title: string;
  description: string;
  content: unknown;
}

/**
 * Event: Usage recorded for billing
 */
export interface WorkUsageRecordedEvent extends BaseIntegrationEvent {
  type: "work:usage_recorded";
  work_id: string;
  agent_id: string;
  total_cost: number;
  has_breakdown: boolean;
}

/**
 * Union type of all integration events
 */
export type IntegrationEvent =
  | WorkVerifiedEvent
  | WorkRetryEvent
  | WorkFailedEvent
  | WorkPaymentConfirmedEvent
  | WorkOutputReceivedEvent
  | WorkUsageRecordedEvent;

// =============================================================================
// AGENT CALLBACK TYPES
// =============================================================================

/**
 * Request body for agent callback webhook
 */
export interface AgentCallbackRequest {
  /** Reference ID from original dispatch */
  reference_id: string;
  /** Status of the task */
  status: "completed" | "failed" | "progress";
  /** Output if completed */
  output?: {
    title: string;
    description: string;
    content: unknown;
  };
  /** Error message if failed */
  error?: string;
  /** Usage data for billing (required even on failure for partial cost) */
  usage: AgentUsage;
  /** Progress percentage (for progress updates) */
  progress?: number;
  /** Processing time in milliseconds */
  processing_time_ms?: number;
}

// =============================================================================
// ERROR TYPES
// =============================================================================

/**
 * Integration type identifier
 */
export type IntegrationType = "galileo" | "payments" | "external_agents";

/**
 * Error thrown by integration operations
 */
export class IntegrationError extends Error {
  constructor(
    message: string,
    public readonly integration: IntegrationType,
    public readonly retryable: boolean,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "IntegrationError";
  }
}

// =============================================================================
// SUMMARIZATION TYPES
// =============================================================================

/**
 * Result of summarization operation with usage tracking
 */
export interface SummarizationResult<T> {
  /** The summarized data */
  data: T;
  /** LLM operation record for billing */
  operation: LLMOperation;
}

/**
 * Title and description generated for work output
 */
export interface TitleAndDescription {
  title: string;
  description: string;
}

// =============================================================================
// CONFIGURATION TYPES
// =============================================================================

/**
 * Configuration for poll manager
 */
export interface PollManagerConfig {
  /** Interval between poll manager runs (ms) */
  pollIntervalMs: number;
  /** Default polling timeout for async tasks (ms) */
  defaultTimeoutMs: number;
}

/**
 * Default poll manager configuration
 */
export const DEFAULT_POLL_MANAGER_CONFIG: PollManagerConfig = {
  pollIntervalMs: 5000,
  defaultTimeoutMs: 600000, // 10 minutes
};
