/**
 * Payment Client Module
 *
 * Main PaymentClient implementation that wraps CDP SDK.
 *
 * @see /docs/designs/payments/TECH_DESIGN.md
 */

import { RequestContext, createLogger } from "@/lib/logging";
import { CdpClient } from "@coinbase/cdp-sdk";
import { createPublicClient, http } from "viem";
import { baseSepolia, base } from "viem/chains";

import type {
  PaymentClient,
  PaymentClientConfig,
  PaymentRequest,
  PaymentResponse,
  PaymentStatus,
  UserWallet,
} from "./types";
import { executePayment } from "./x402";
import { validateAddress, getBalance as getWalletBalance, type Network } from "./wallet";

const logger = createLogger("payments");

/**
 * Get viem public client for the network.
 */
function getPublicClient(network: Network) {
  const chain = network === "base-mainnet" ? base : baseSepolia;
  return createPublicClient({
    chain,
    transport: http(),
  });
}

/**
 * PaymentClient implementation that wraps the CDP SDK.
 */
class PaymentClientImpl implements PaymentClient {
  private readonly config: PaymentClientConfig;
  private cdp: CdpClient | null = null;

  constructor(config: PaymentClientConfig) {
    this.config = config;
  }

  /**
   * Get or initialize CDP client.
   */
  private getCdpClient(ctx: RequestContext): CdpClient {
    if (!this.cdp) {
      const apiKeyId = process.env.CDP_API_KEY_ID;
      const apiKeySecret = process.env.CDP_API_KEY_SECRET;
      const walletSecret = process.env.CDP_WALLET_SECRET;

      if (!apiKeyId || !apiKeySecret || !walletSecret) {
        logger.error(ctx, `operation=get_cdp_client status=failed reason=missing_credentials`);
        throw new Error("CDP credentials not configured");
      }

      this.cdp = new CdpClient({
        apiKeyId,
        apiKeySecret,
        walletSecret,
      });

      logger.info(ctx, `operation=get_cdp_client status=initialized`);
    }
    return this.cdp;
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
   * Uses viem to check transaction receipt on-chain.
   *
   * @param ctx - Request context for tracing
   * @param tx_hash - Blockchain transaction hash
   * @returns Current payment status
   */
  async getPaymentStatus(ctx: RequestContext, tx_hash: string): Promise<PaymentStatus> {
    logger.info(ctx, `operation=get_payment_status tx_hash=${tx_hash} status=started`);

    // Validate hash format
    if (!tx_hash.startsWith("0x") || tx_hash.length !== 66) {
      logger.warn(ctx, `operation=get_payment_status tx_hash=${tx_hash} status=invalid_hash`);
      return "pending";
    }

    try {
      const publicClient = getPublicClient(this.config.network);

      // Try to get the transaction receipt
      const receipt = await publicClient.getTransactionReceipt({
        hash: tx_hash as `0x${string}`,
      });

      if (receipt) {
        if (receipt.status === "success") {
          logger.info(ctx, `operation=get_payment_status tx_hash=${tx_hash} block=${receipt.blockNumber} result=confirmed`);
          return "confirmed";
        } else if (receipt.status === "reverted") {
          logger.warn(ctx, `operation=get_payment_status tx_hash=${tx_hash} result=failed reason=reverted`);
          return "failed";
        }
      }

      // If no receipt yet, transaction is still pending
      logger.info(ctx, `operation=get_payment_status tx_hash=${tx_hash} result=pending`);
      return "pending";
    } catch (error: unknown) {
      // Transaction not found (not yet mined) or network error
      const message = error instanceof Error ? error.message : String(error);

      // If transaction not found, it's still pending/processing
      if (message.includes("could not be found") || message.includes("not found")) {
        logger.info(ctx, `operation=get_payment_status tx_hash=${tx_hash} result=processing reason=not_mined_yet`);
        return "processing";
      }

      logger.error(
        ctx,
        `operation=get_payment_status tx_hash=${tx_hash} status=error error="${message}"`,
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
   * Create an embedded wallet for a user using CDP SDK.
   *
   * @param ctx - Request context for tracing
   * @param user_id - User ID to create wallet for
   * @returns Created user wallet
   */
  async createEmbeddedWallet(ctx: RequestContext, user_id: string): Promise<UserWallet> {
    logger.info(ctx, `operation=create_embedded_wallet user_id=${user_id} status=started`);

    try {
      const cdp = this.getCdpClient(ctx);

      // Create a CDP account with the user ID as the name
      // CDP SDK manages the wallet creation and key management
      const account = await cdp.evm.getOrCreateAccount({
        name: `user_${user_id}`,
      });

      const wallet: UserWallet = {
        type: "embedded",
        cdp_wallet_id: `user_${user_id}`,
        address: account.address,
        verified: true, // CDP wallets are auto-verified
      };

      logger.info(
        ctx,
        `operation=create_embedded_wallet user_id=${user_id} address=${account.address} status=completed`
      );

      return wallet;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        ctx,
        `operation=create_embedded_wallet user_id=${user_id} status=failed error="${message}"`,
        error instanceof Error ? error : undefined
      );
      throw error;
    }
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

