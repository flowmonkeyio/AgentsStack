/**
 * Payment Retry Logic Module
 *
 * Implements retry with exponential backoff for payment failures.
 *
 * @see /docs/designs/payments/TECH_DESIGN.md
 */

import { RequestContext, createLogger } from "@/lib/logging";
import type { PaymentRequest, PaymentResponse, PaymentRetryConfig } from "./types";
import { executePayment } from "./x402";

const logger = createLogger("payments");

// =============================================================================
// ERROR CLASSIFICATION
// =============================================================================

/**
 * Errors that can be retried.
 */
export const RETRYABLE_ERRORS = [
  "NETWORK_ERROR",
  "TIMEOUT",
  "RATE_LIMITED",
  "NONCE_TOO_LOW",
  "Transaction not confirmed",
];

/**
 * Errors that should not be retried.
 */
export const FATAL_ERRORS = [
  "INSUFFICIENT_BALANCE",
  "INVALID_ADDRESS",
  "CONTRACT_REVERT",
  "SIGNATURE_INVALID",
  "Invalid wallet address",
  "Insufficient balance",
];

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: PaymentRetryConfig = {
  max_retries: 3,
  retry_delay_ms: 5000,
  backoff_multiplier: 2,
};

// =============================================================================
// ERROR CHECKING
// =============================================================================

/**
 * Check if an error is retryable.
 *
 * @param error - The error to check
 * @returns True if the error can be retried
 */
export function isRetryableError(error: Error): boolean {
  return RETRYABLE_ERRORS.some((code) => error.message.includes(code));
}

/**
 * Check if an error is fatal (should not be retried).
 *
 * @param error - The error to check
 * @returns True if the error is fatal
 */
export function isFatalError(error: Error): boolean {
  return FATAL_ERRORS.some((code) => error.message.includes(code));
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Sleep for a specified duration.
 *
 * @param ms - Duration in milliseconds
 * @returns Promise that resolves after the duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// RETRY LOGIC
// =============================================================================

/**
 * Execute a payment with retry logic.
 *
 * Uses exponential backoff between retries.
 * Will not retry if the error is marked as non-retryable.
 *
 * @param ctx - Request context for tracing
 * @param request - Payment request details
 * @param config - Retry configuration (optional, uses defaults)
 * @returns Payment response after all attempts
 */
export async function payWithRetry(
  ctx: RequestContext,
  request: PaymentRequest,
  config: PaymentRetryConfig = DEFAULT_RETRY_CONFIG
): Promise<PaymentResponse> {
  let lastError: string | undefined;
  let delay = config.retry_delay_ms;

  logger.info(
    ctx,
    `operation=pay_with_retry work_id=${request.work_id} max_retries=${config.max_retries} status=started`
  );

  for (let attempt = 1; attempt <= config.max_retries; attempt++) {
    logger.info(
      ctx,
      `operation=pay_with_retry work_id=${request.work_id} attempt=${attempt} max_retries=${config.max_retries}`
    );

    const result = await executePayment(ctx, request);

    if (result.success) {
      logger.info(
        ctx,
        `operation=pay_with_retry work_id=${request.work_id} attempt=${attempt} tx_hash=${result.tx_hash} status=success`
      );
      return result;
    }

    if (!result.retry_suggested) {
      // Non-retryable error
      logger.error(
        ctx,
        `operation=pay_with_retry work_id=${request.work_id} attempt=${attempt} status=failed reason=non_retryable error="${result.error}"`
      );
      return result;
    }

    lastError = result.error;
    logger.warn(
      ctx,
      `operation=pay_with_retry work_id=${request.work_id} attempt=${attempt} status=retry_scheduled delay=${delay} error="${lastError}"`
    );

    // Don't sleep after the last attempt
    if (attempt < config.max_retries) {
      await sleep(delay);
      delay *= config.backoff_multiplier;
    }
  }

  logger.error(
    ctx,
    `operation=pay_with_retry work_id=${request.work_id} status=exhausted max_retries=${config.max_retries} error="${lastError}"`
  );

  return {
    success: false,
    error: `Payment failed after ${config.max_retries} attempts: ${lastError}`,
  };
}
