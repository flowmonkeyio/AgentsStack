/**
 * Payment Client Module
 *
 * Main PaymentClient implementation that wraps CDP and x402 SDKs.
 *
 * @see /docs/designs/payments/TECH_DESIGN.md
 */

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
   * @param request - Payment request details
   * @returns Payment response with success status and tx_hash
   */
  async pay(request: PaymentRequest): Promise<PaymentResponse> {
    return executePayment(request);
  }

  /**
   * Check the status of a payment by transaction hash.
   *
   * @param tx_hash - Blockchain transaction hash
   * @returns Current payment status
   */
  async getPaymentStatus(tx_hash: string): Promise<PaymentStatus> {
    try {
      // TODO: Implement actual CDP SDK call
      // const status = await this.cdp.getTransactionStatus(tx_hash);
      // // Map CDP status to our PaymentStatus
      // if (status.confirmed) return "confirmed";
      // if (status.failed) return "failed";
      // return "processing";

      // Placeholder: Return simulated status for development
      console.warn(
        `[client.ts] getPaymentStatus called for ${tx_hash} - using placeholder`
      );

      // For development, return confirmed if hash looks valid
      if (tx_hash.startsWith("0x") && tx_hash.length === 66) {
        return "confirmed";
      }
      return "pending";
    } catch (error: unknown) {
      // Transaction not found or network error
      console.error("[client.ts] getPaymentStatus error:", error);
      return "pending";
    }
  }

  /**
   * Get the USDC balance for a wallet address.
   *
   * @param address - Wallet address
   * @returns Balance in USDC
   */
  async getBalance(address: string): Promise<number> {
    // TODO: Implement actual CDP SDK call
    // const balance = await this.cdp.getBalance({
    //   address,
    //   currency: "USDC",
    //   network: this.config.network
    // });
    // return balance.amount;

    return getWalletBalance(address, this.config.network);
  }

  /**
   * Validate an Ethereum wallet address.
   *
   * @param address - Address to validate
   * @returns True if valid
   */
  validateAddress(address: string): boolean {
    return validateAddress(address);
  }

  /**
   * Create an embedded wallet for a user.
   *
   * @param user_id - User ID to create wallet for
   * @returns Created user wallet
   */
  async createEmbeddedWallet(user_id: string): Promise<UserWallet> {
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
    console.warn(
      `[client.ts] createEmbeddedWallet called for user ${user_id} - using placeholder`
    );

    // Generate a simulated wallet address
    const simulatedAddress = `0x${generateSimulatedAddress()}`;
    const simulatedWalletId = `wallet_${user_id}_${Date.now()}`;

    return {
      type: "embedded",
      cdp_wallet_id: simulatedWalletId,
      address: simulatedAddress,
      verified: true, // CDP wallets are auto-verified
    };
  }
}

/**
 * Create a new PaymentClient instance.
 *
 * @param config - Payment client configuration
 * @returns Configured PaymentClient
 */
export function createPaymentClient(config: PaymentClientConfig): PaymentClient {
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
 * @returns Default PaymentClient instance
 */
export function getPaymentClient(): PaymentClient {
  if (!defaultClient) {
    const cdpApiKey = process.env.CDP_API_KEY;
    const cdpApiSecret = process.env.CDP_API_SECRET;
    const cdpNetwork = process.env.CDP_NETWORK as "base-mainnet" | "base-sepolia";

    if (!cdpApiKey || !cdpApiSecret) {
      console.warn(
        "[client.ts] CDP_API_KEY or CDP_API_SECRET not configured - using placeholder mode"
      );
    }

    defaultClient = createPaymentClient({
      cdpApiKey: cdpApiKey || "",
      cdpApiSecret: cdpApiSecret || "",
      network: cdpNetwork || "base-sepolia",
    });
  }
  return defaultClient;
}

/**
 * Set the default PaymentClient instance.
 * Useful for testing - allows injecting mock client.
 *
 * @param client - Client to set as default
 */
export function setPaymentClient(client: PaymentClient): void {
  defaultClient = client;
}

/**
 * Reset the default PaymentClient instance.
 * Useful for testing - clears the singleton.
 */
export function resetPaymentClient(): void {
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
