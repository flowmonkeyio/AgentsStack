/**
 * CDP Wallet Client
 *
 * Placeholder - CDP SDK integration to be implemented.
 * For now, provides stub functions for wallet management.
 *
 * @see /docs/MODULE_PAYMENTS.md
 * @see /docs/reference/COINBASE_CDP.md
 */

/**
 * Wallet interface matching CDP Wallet structure.
 */
export interface Wallet {
  id: string;
  address: string;
  network: "base-sepolia" | "base-mainnet";
}

/**
 * Get the platform wallet for payments.
 *
 * TODO: Implement CDP SDK integration
 *
 * @returns Platform wallet
 */
export async function getPlatformWallet(): Promise<Wallet> {
  const walletId = process.env.PLATFORM_WALLET_ID;
  if (!walletId) {
    throw new Error("PLATFORM_WALLET_ID is not configured");
  }

  // Placeholder - will be implemented with CDP SDK
  return {
    id: walletId,
    address: process.env.PLATFORM_WALLET_ADDRESS ?? "",
    network: getNetwork(),
  };
}

/**
 * Create a new user wallet.
 *
 * TODO: Implement CDP SDK integration
 *
 * @returns New user wallet
 */
export async function createUserWallet(): Promise<Wallet> {
  // Placeholder - will be implemented with CDP SDK
  throw new Error("CDP SDK integration not implemented");
}

/**
 * Get the configured network.
 *
 * @returns Network ID
 */
export function getNetwork(): "base-sepolia" | "base-mainnet" {
  const network = process.env.CDP_NETWORK || "base-sepolia";
  if (network !== "base-sepolia" && network !== "base-mainnet") {
    throw new Error(`Invalid network: ${network}`);
  }
  return network;
}
