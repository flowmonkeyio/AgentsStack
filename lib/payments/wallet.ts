/**
 * Wallet Utilities Module
 *
 * Provides wallet validation and balance checking utilities.
 *
 * @see /docs/designs/payments/TECH_DESIGN.md
 */

import { RequestContext, createLogger } from "@/lib/logging";

const logger = createLogger("payments");

// TODO: Import from @coinbase/cdp-sdk when available
// import { CoinbaseCDP } from '@coinbase/cdp-sdk';

/**
 * Network type for wallet operations.
 */
export type Network = "base-mainnet" | "base-sepolia";

/**
 * Validate an Ethereum wallet address.
 * Checks for proper hex format and length.
 *
 * @param ctx - Request context for tracing
 * @param address - The address to validate
 * @returns True if the address is valid
 */
export function validateAddress(ctx: RequestContext, address: string): boolean {
  const isValid = /^0x[a-fA-F0-9]{40}$/.test(address);
  logger.debug(ctx, `operation=validate_address address=${address} valid=${isValid}`);
  return isValid;
}

/**
 * Alias for validateAddress for consistency with the design.
 *
 * @param ctx - Request context for tracing
 * @param address - The address to validate
 * @returns True if the address is valid
 */
export function isValidAddress(ctx: RequestContext, address: string): boolean {
  return validateAddress(ctx, address);
}

/**
 * Get the USDC balance for a wallet address.
 *
 * TODO: Implement actual CDP SDK integration
 *
 * @param ctx - Request context for tracing
 * @param address - The wallet address
 * @param network - The network to check balance on
 * @returns The balance in USDC
 */
export async function getBalance(
  ctx: RequestContext,
  address: string,
  network: Network = "base-sepolia"
): Promise<number> {
  logger.info(ctx, `operation=get_balance address=${address} network=${network} status=started`);

  // Validate address first
  if (!validateAddress(ctx, address)) {
    logger.error(ctx, `operation=get_balance address=${address} status=failed reason=invalid_address`);
    throw new Error(`Invalid wallet address: ${address}`);
  }

  // TODO: Implement actual CDP SDK call
  // const cdp = new CoinbaseCDP({
  //   apiKey: process.env.CDP_API_KEY,
  //   apiSecret: process.env.CDP_API_SECRET
  // });
  //
  // const balance = await cdp.getBalance({
  //   address,
  //   currency: "USDC",
  //   network
  // });
  // return balance.amount;

  // Placeholder: Return simulated balance for development
  // In production, this will call the CDP SDK
  logger.warn(ctx, `operation=get_balance address=${address} network=${network} status=placeholder`);
  const balance = 1000.0; // Simulated balance for development
  logger.info(ctx, `operation=get_balance address=${address} balance=${balance} status=completed`);
  return balance;
}

/**
 * Get the current network from environment configuration.
 *
 * @param ctx - Request context for tracing
 * @returns The configured network
 */
export function getConfiguredNetwork(ctx: RequestContext): Network {
  const network = process.env.CDP_NETWORK || "base-sepolia";
  if (network !== "base-sepolia" && network !== "base-mainnet") {
    logger.error(ctx, `operation=get_configured_network status=failed reason=invalid_network network=${network}`);
    throw new Error(`Invalid network configuration: ${network}`);
  }
  logger.debug(ctx, `operation=get_configured_network network=${network}`);
  return network;
}

/**
 * Determine network based on environment.
 *
 * @param ctx - Request context for tracing
 * @returns Network based on NODE_ENV
 */
export function getNetworkForEnvironment(ctx: RequestContext): Network {
  const network = process.env.NODE_ENV === "production" ? "base-mainnet" : "base-sepolia";
  logger.debug(ctx, `operation=get_network_for_environment network=${network} node_env=${process.env.NODE_ENV}`);
  return network;
}
