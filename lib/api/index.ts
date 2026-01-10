/**
 * API Utilities
 *
 * Re-exports all API utilities for easy importing.
 * @see /docs/designs/api/TECH_DESIGN.md
 */

// SSE utilities
export {
  createSSEEncoder,
  formatSSEMessage,
  createSSEStream,
  createSSEHeaders,
} from "./sse";
export type { SSEEventType, SSEEvent } from "./sse";

// Rate limiting
export {
  createRateLimiter,
  rateLimiters,
  checkSSEConnectionLimit,
  trackSSEConnection,
  getSSEConnectionCount,
} from "./rate-limit";
export type { RateLimitConfig, RateLimitResult } from "./rate-limit";

// Validation
export {
  createJobSchema,
  continueJobSchema,
  agentCallbackSchema,
  validateCreateJobRequest,
  validateContinueJobRequest,
  validateAgentCallbackRequest,
} from "./validation";
export type { ValidationResult } from "./validation";
