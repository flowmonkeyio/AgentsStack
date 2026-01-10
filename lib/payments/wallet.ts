/**
 * Wallet Utilities Module
 *
 * Provides wallet validation and balance checking utilities.
 *
 * @see /docs/designs/payments/TECH_DESIGN.md
 */

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
 * @param address - The address to validate
 * @returns True if the address is valid
 */
export function validateAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Alias for validateAddress for consistency with the design.
 *
 * @param address - The address to validate
 * @returns True if the address is valid
 */
export function isValidAddress(address: string): boolean {
  return validateAddress(address);
}

/**
 * Get the USDC balance for a wallet address.
 *
 * TODO: Implement actual CDP SDK integration
 *
 * @param address - The wallet address
 * @param network - The network to check balance on
 * @returns The balance in USDC
 */
export async function getBalance(
  address: string,
  network: Network = "base-sepolia"
): Promise<number> {
  // Validate address first
  if (!validateAddress(address)) {
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
  console.warn(
    `[wallet.ts] getBalance called for ${address} on ${network} - using placeholder`
  );
  return 1000.0; // Simulated balance for development
}

/**
 * Get the current network from environment configuration.
 *
 * @returns The configured network
 */
export function getConfiguredNetwork(): Network {
  const network = process.env.CDP_NETWORK || "base-sepolia";
  if (network !== "base-sepolia" && network !== "base-mainnet") {
    throw new Error(`Invalid network configuration: ${network}`);
  }
  return network;
}

/**
 * Determine network based on environment.
 *
 * @returns Network based on NODE_ENV
 */
export function getNetworkForEnvironment(): Network {
  return process.env.NODE_ENV === "production" ? "base-mainnet" : "base-sepolia";
}
