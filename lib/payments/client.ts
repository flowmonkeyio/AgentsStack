/**
 * Payment Client Module
 *
 * Main PaymentClient implementation that wraps CDP and x402 SDKs.
 *
 * @see /docs/designs/payments/TECH_DESIGN.md
 */

import { RequestContext, createLogger } from "@/lib/logging";

// TODO: Import from @coinbase/cdp-sdk when available
// import { CoinbaseCDP } from '@coinbase/cdp-sdk';

import type {
  PaymentClient,
  PaymentClientConfig,
  PaymentRequest,
  PaymentResponse,
  PaymentStatus,
  UserWallet,
} from "./types";
import { executePayment } from "./x402";
import { validateAddress, getBalance as getWalletBalance } from "./wallet";

const logger = createLogger("payments");

/**
 * PaymentClient implementation that wraps the CDP and x402 SDKs.
 */
class PaymentClientImpl implements PaymentClient {
  private readonly config: PaymentClientConfig;
  // TODO: Add CDP SDK instance when available
  // private readonly cdp: CoinbaseCDP;

  constructor(config: PaymentClientConfig) {
    this.config = config;
    // TODO: Initialize CDP SDK when available
    // this.cdp = new CoinbaseCDP({
    //   apiKey: config.cdpApiKey,
    //   apiSecret: config.cdpApiSecret
    // });
  }

  /**
   * Execute a payment transfer.
   *
   * @param ctx - Request context for tracing
   * @param request - Payment request details
   * @returns Payment response with success status and tx_hash
   */
  async pay(ctx: RequestContext, request: PaymentRequest): Promise<PaymentResponse> {
    logger.info(
      ctx,
      `operation=pay work_id=${request.work_id} agent_id=${request.agent_id} amount=${request.amount} status=started`
    );
    const result = await executePayment(ctx, request);
    if (result.success) {
      logger.info(
        ctx,
        `operation=pay work_id=${request.work_id} tx_hash=${result.tx_hash} status=success`
      );
    } else {
      logger.error(
        ctx,
        `operation=pay work_id=${request.work_id} status=failed reason="${result.error}"`
      );
    }
    return result;
  }

  /**
   * Check the status of a payment by transaction hash.
   *
   * @param ctx - Request context for tracing
   * @param tx_hash - Blockchain transaction hash
   * @returns Current payment status
   */
  async getPaymentStatus(ctx: RequestContext, tx_hash: string): Promise<PaymentStatus> {
    logger.info(ctx, `operation=get_payment_status tx_hash=${tx_hash} status=started`);
    try {
      // TODO: Implement actual CDP SDK call
      // const status = await this.cdp.getTransactionStatus(tx_hash);
      // // Map CDP status to our PaymentStatus
      // if (status.confirmed) return "confirmed";
      // if (status.failed) return "failed";
      // return "processing";

      // Placeholder: Return simulated status for development
      logger.warn(ctx, `operation=get_payment_status tx_hash=${tx_hash} status=placeholder`);

      // For development, return confirmed if hash looks valid
      let result: PaymentStatus;
      if (tx_hash.startsWith("0x") && tx_hash.length === 66) {
        result = "confirmed";
      } else {
        result = "pending";
      }
      logger.info(ctx, `operation=get_payment_status tx_hash=${tx_hash} result=${result} status=completed`);
      return result;
    } catch (error: unknown) {
      // Transaction not found or network error
      logger.error(
        ctx,
        `operation=get_payment_status tx_hash=${tx_hash} status=error`,
        error instanceof Error ? error : undefined
      );
      return "pending";
    }
  }

  /**
   * Get the USDC balance for a wallet address.
   *
   * @param ctx - Request context for tracing
   * @param address - Wallet address
   * @returns Balance in USDC
   */
  async getBalance(ctx: RequestContext, address: string): Promise<number> {
    logger.info(ctx, `operation=client_get_balance address=${address} status=started`);
    // TODO: Implement actual CDP SDK call
    // const balance = await this.cdp.getBalance({
    //   address,
    //   currency: "USDC",
    //   network: this.config.network
    // });
    // return balance.amount;

    const balance = await getWalletBalance(ctx, address, this.config.network);
    logger.info(ctx, `operation=client_get_balance address=${address} balance=${balance} status=completed`);
    return balance;
  }

  /**
   * Validate an Ethereum wallet address.
   *
   * @param ctx - Request context for tracing
   * @param address - Address to validate
   * @returns True if valid
   */
  validateAddress(ctx: RequestContext, address: string): boolean {
    const isValid = validateAddress(ctx, address);
    logger.debug(ctx, `operation=client_validate_address address=${address} valid=${isValid}`);
    return isValid;
  }

  /**
   * Create an embedded wallet for a user.
   *
   * @param ctx - Request context for tracing
   * @param user_id - User ID to create wallet for
   * @returns Created user wallet
   */
  async createEmbeddedWallet(ctx: RequestContext, user_id: string): Promise<UserWallet> {
    logger.info(ctx, `operation=create_embedded_wallet user_id=${user_id} status=started`);
    // TODO: Implement actual CDP SDK call
    // const wallet = await this.cdp.createEmbeddedWallet({
    //   userId: user_id,
    //   network: this.config.network
    // });
    // return {
    //   type: "embedded",
    //   cdp_wallet_id: wallet.id,
    //   address: wallet.address,
    //   verified: true  // CDP wallets are auto-verified
    // };

    // Placeholder: Return simulated wallet for development
    logger.warn(ctx, `operation=create_embedded_wallet user_id=${user_id} status=placeholder`);

    // Generate a simulated wallet address
    const simulatedAddress = `0x${generateSimulatedAddress()}`;
    const simulatedWalletId = `wallet_${user_id}_${Date.now()}`;

    const wallet: UserWallet = {
      type: "embedded",
      cdp_wallet_id: simulatedWalletId,
      address: simulatedAddress,
      verified: true, // CDP wallets are auto-verified
    };

    logger.info(
      ctx,
      `operation=create_embedded_wallet user_id=${user_id} wallet_id=${simulatedWalletId} address=${simulatedAddress} status=completed`
    );

    return wallet;
  }
}

/**
 * Create a new PaymentClient instance.
 *
 * @param ctx - Request context for tracing
 * @param config - Payment client configuration
 * @returns Configured PaymentClient
 */
export function createPaymentClient(ctx: RequestContext, config: PaymentClientConfig): PaymentClient {
  logger.info(ctx, `operation=create_payment_client network=${config.network} status=created`);
  return new PaymentClientImpl(config);
}

// =============================================================================
// SINGLETON CLIENT
// =============================================================================

let defaultClient: PaymentClient | null = null;

/**
 * Get the default PaymentClient instance.
 * Creates a new instance if one doesn't exist.
 *
 * Uses environment variables for configuration:
 * - CDP_API_KEY
 * - CDP_API_SECRET
 * - CDP_NETWORK
 *
 * @param ctx - Request context for tracing
 * @returns Default PaymentClient instance
 */
export function getPaymentClient(ctx: RequestContext): PaymentClient {
  if (!defaultClient) {
    const cdpApiKey = process.env.CDP_API_KEY;
    const cdpApiSecret = process.env.CDP_API_SECRET;
    const cdpNetwork = process.env.CDP_NETWORK as "base-mainnet" | "base-sepolia";

    if (!cdpApiKey || !cdpApiSecret) {
      logger.warn(ctx, "operation=get_payment_client status=placeholder_mode reason=missing_credentials");
    }

    defaultClient = createPaymentClient(ctx, {
      cdpApiKey: cdpApiKey || "",
      cdpApiSecret: cdpApiSecret || "",
      network: cdpNetwork || "base-sepolia",
    });

    logger.info(ctx, `operation=get_payment_client network=${cdpNetwork || "base-sepolia"} status=initialized`);
  }
  return defaultClient;
}

/**
 * Set the default PaymentClient instance.
 * Useful for testing - allows injecting mock client.
 *
 * @param ctx - Request context for tracing
 * @param client - Client to set as default
 */
export function setPaymentClient(ctx: RequestContext, client: PaymentClient): void {
  logger.info(ctx, "operation=set_payment_client status=set");
  defaultClient = client;
}

/**
 * Reset the default PaymentClient instance.
 * Useful for testing - clears the singleton.
 *
 * @param ctx - Request context for tracing
 */
export function resetPaymentClient(ctx: RequestContext): void {
  logger.info(ctx, "operation=reset_payment_client status=reset");
  defaultClient = null;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Generate a simulated wallet address for development.
 *
 * @returns 40-character hex string (without 0x prefix)
 */
function generateSimulatedAddress(): string {
  const chars = "0123456789abcdef";
  let result = "";
  for (let i = 0; i < 40; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
