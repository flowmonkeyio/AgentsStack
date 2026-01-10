/**
 * Payment Module Type Definitions
 *
 * All interfaces and types for the payments module.
 * Implements x402 protocol + CDP wallet integration.
 *
 * @see /docs/designs/payments/TECH_DESIGN.md
 */

import type { RequestContext } from "@/lib/logging";

// =============================================================================
// WALLET TYPES
// =============================================================================

/**
 * User wallet configuration.
 * Can be either embedded (CDP-managed) or external (user-managed).
 */
export interface UserWallet {
  type: "embedded" | "external";

  /** CDP wallet ID (for embedded wallets) */
  cdp_wallet_id?: string;

  /** Wallet address */
  address: string;

  /** External wallet provider (for external wallets) */
  provider?: "metamask" | "walletconnect" | "coinbase_wallet";

  /** Whether the wallet has been verified */
  verified: boolean;
}

/**
 * Agent wallet configuration.
 * Agents always use external wallets.
 */
export interface AgentWallet {
  /** Wallet address */
  address: string;

  /** Whether the wallet has been verified */
  verified: boolean;
}

/**
 * Platform wallet configuration.
 * Platform uses server-side CDP wallet.
 */
export interface PlatformWallet {
  type: "cdp_server";

  /** CDP wallet ID */
  cdp_wallet_id: string;

  /** Wallet address */
  address: string;
}

// =============================================================================
// PAYMENT REQUEST/RESPONSE
// =============================================================================

/**
 * Payment request for executing a transfer.
 */
export interface PaymentRequest {
  /** Work item ID */
  work_id: string;

  /** Job ID */
  job_id: string;

  /** User ID (payer) */
  user_id: string;

  /** Agent ID (payee) */
  agent_id: string;

  /** Amount in USDC */
  amount: number;

  /** Currency (always USDC) */
  currency: "USDC";

  /** User's wallet address (source) */
  from_address: string;

  /** Agent's wallet address (destination) */
  to_address: string;

  /** Reason for payment (e.g., "Work completed, score 0.94") */
  reason: string;
}

/**
 * Payment response after execution attempt.
 */
export interface PaymentResponse {
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
// PAYMENT STATUS
// =============================================================================

/**
 * Payment transaction status.
 */
export type PaymentStatus =
  | "pending" // Payment initiated
  | "processing" // Transaction submitted
  | "confirmed" // Transaction confirmed on-chain
  | "failed" // Transaction failed
  | "refunded"; // Payment reversed (rare)

// =============================================================================
// RETRY CONFIGURATION
// =============================================================================

/**
 * Configuration for payment retry logic.
 */
export interface PaymentRetryConfig {
  /** Maximum number of retry attempts */
  max_retries: number;

  /** Initial delay between retries in milliseconds */
  retry_delay_ms: number;

  /** Multiplier for exponential backoff */
  backoff_multiplier: number;
}

// =============================================================================
// X402 TRANSFER
// =============================================================================

/**
 * x402 transfer request structure.
 */
export interface X402Transfer {
  /** Payer address */
  from: string;

  /** Payee address */
  to: string;

  /** Amount in USDC */
  amount: number;

  /** Currency (always USDC) */
  currency: "USDC";

  /** Optional reference memo */
  memo?: string;
}

/**
 * x402 transfer result.
 */
export interface X402TransferResult {
  /** Transaction hash */
  hash: string;
}

// =============================================================================
// PAYMENT CLIENT
// =============================================================================

/**
 * PaymentClient interface for executing payments.
 */
export interface PaymentClient {
  /**
   * Execute a payment transfer.
   * @param ctx - Request context for tracing
   * @param request - Payment request details
   * @returns Payment response with success status and tx_hash
   */
  pay(ctx: RequestContext, request: PaymentRequest): Promise<PaymentResponse>;

  /**
   * Check the status of a payment by transaction hash.
   * @param ctx - Request context for tracing
   * @param tx_hash - Blockchain transaction hash
   * @returns Current payment status
   */
  getPaymentStatus(ctx: RequestContext, tx_hash: string): Promise<PaymentStatus>;

  /**
   * Get the USDC balance for a wallet address.
   * @param ctx - Request context for tracing
   * @param address - Wallet address
   * @returns Balance in USDC
   */
  getBalance(ctx: RequestContext, address: string): Promise<number>;

  /**
   * Validate an Ethereum wallet address.
   * @param ctx - Request context for tracing
   * @param address - Address to validate
   * @returns True if valid
   */
  validateAddress(ctx: RequestContext, address: string): boolean;

  /**
   * Create an embedded wallet for a user.
   * @param ctx - Request context for tracing
   * @param user_id - User ID to create wallet for
   * @returns Created user wallet
   */
  createEmbeddedWallet(ctx: RequestContext, user_id: string): Promise<UserWallet>;
}

/**
 * Configuration for creating a PaymentClient.
 */
export interface PaymentClientConfig {
  /** CDP API key */
  cdpApiKey: string;

  /** CDP API secret */
  cdpApiSecret: string;

  /** Network to use */
  network: "base-mainnet" | "base-sepolia";
}

// =============================================================================
// LIFECYCLE PARAMS
// =============================================================================

/**
 * Parameters for initiating a payment.
 */
export interface InitiatePaymentParams {
  /** Work item ID */
  work_id: string;

  /** Job ID */
  job_id: string;

  /** User ID */
  user_id: string;

  /** Agent ID */
  agent_id: string;

  /** Amount in USDC */
  amount: number;

  /** Reason for payment */
  reason: string;
}

/**
 * Parameters for confirming a payment.
 */
export interface PaymentConfirmationParams {
  /** Transaction ID from initiatePayment() */
  tx_id: string;

  /** Blockchain transaction hash from executePayment() */
  tx_hash: string;

  /** Work item ID */
  work_id: string;

  /** Job ID */
  job_id: string;

  /** Agent ID */
  agent_id: string;

  /** Amount in USDC */
  amount: number;
}

/**
 * Parameters for handling payment failure.
 */
export interface PaymentFailureParams {
  /** Transaction ID from initiatePayment() */
  tx_id: string;

  /** Work item ID */
  work_id: string;

  /** Error message */
  error: string;
}
