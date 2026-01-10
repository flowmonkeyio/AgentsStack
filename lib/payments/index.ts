/**
 * Payments Module
 *
 * x402 protocol + CDP wallet integration for USDC payments.
 *
 * @see /docs/designs/payments/TECH_DESIGN.md
 */

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type {
  // Wallet types
  UserWallet,
  AgentWallet,
  PlatformWallet,
  // Payment types
  PaymentRequest,
  PaymentResponse,
  PaymentStatus,
  PaymentRetryConfig,
  // x402 types
  X402Transfer,
  X402TransferResult,
  // Client types
  PaymentClient,
  PaymentClientConfig,
  // Lifecycle param types
  InitiatePaymentParams,
  PaymentConfirmationParams,
  PaymentFailureParams,
} from "./types";

// =============================================================================
// CLIENT EXPORTS
// =============================================================================

export {
  createPaymentClient,
  getPaymentClient,
  setPaymentClient,
  resetPaymentClient,
} from "./client";

// =============================================================================
// WALLET EXPORTS
// =============================================================================

export {
  validateAddress,
  isValidAddress,
  getBalance,
  getConfiguredNetwork,
  getNetworkForEnvironment,
} from "./wallet";

export type { Network } from "./wallet";

// =============================================================================
// X402 EXPORTS
// =============================================================================

export { executePayment } from "./x402";

// =============================================================================
// RETRY EXPORTS
// =============================================================================

export {
  payWithRetry,
  isRetryableError,
  isFatalError,
  RETRYABLE_ERRORS,
  FATAL_ERRORS,
  DEFAULT_RETRY_CONFIG,
} from "./retry";

// =============================================================================
// LIFECYCLE EXPORTS
// =============================================================================

export {
  initiatePayment,
  onPaymentConfirmed,
  onPaymentFailed,
} from "./lifecycle";
