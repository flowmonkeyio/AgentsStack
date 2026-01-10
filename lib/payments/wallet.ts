/**
 * Wallet Utilities Module
 *
 * Provides wallet validation and balance checking utilities.
 * Supports multiple assets (ETH, USDC) on Base network.
 *
 * @see /docs/designs/payments/TECH_DESIGN.md
 */

import { RequestContext, createLogger } from "@/lib/logging";
import { createPublicClient, http, formatUnits, formatEther } from "viem";
import { baseSepolia, base } from "viem/chains";

const logger = createLogger("payments:wallet");

/**
 * Network type for wallet operations.
 */
export type Network = "base-mainnet" | "base-sepolia";

/**
 * Asset balance information
 */
export interface AssetBalance {
  asset: "ETH" | "USDC";
  symbol: string;
  balance: number;
  balanceRaw: string;
  decimals: number;
  usdValue?: number;
}

/**
 * Wallet balances response
 */
export interface WalletBalances {
  address: string;
  network: Network;
  balances: AssetBalance[];
  totalUsdValue: number;
}

// USDC contract addresses
const USDC_CONTRACTS: Record<Network, `0x${string}`> = {
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "base-mainnet": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};

// ERC20 ABI for balanceOf
const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

/**
 * Get viem public client for the network
 */
function getPublicClient(network: Network) {
  const chain = network === "base-mainnet" ? base : baseSepolia;
  return createPublicClient({
    chain,
    transport: http(),
  });
}

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
 * Get the ETH balance for a wallet address.
 *
 * @param ctx - Request context for tracing
 * @param address - The wallet address
 * @param network - The network to check balance on
 * @returns The ETH balance
 */
export async function getEthBalance(
  ctx: RequestContext,
  address: string,
  network: Network = "base-sepolia"
): Promise<AssetBalance> {
  logger.info(ctx, `operation=get_eth_balance address=${address} network=${network} status=started`);

  if (!validateAddress(ctx, address)) {
    throw new Error(`Invalid wallet address: ${address}`);
  }

  try {
    const client = getPublicClient(network);
    const balanceWei = await client.getBalance({
      address: address as `0x${string}`,
    });

    const balance = parseFloat(formatEther(balanceWei));

    logger.info(ctx, `operation=get_eth_balance address=${address} balance=${balance} status=completed`);

    return {
      asset: "ETH",
      symbol: "ETH",
      balance,
      balanceRaw: balanceWei.toString(),
      decimals: 18,
    };
  } catch (error) {
    logger.error(ctx, `operation=get_eth_balance address=${address} status=failed error=${error}`);
    // Return zero balance on error
    return {
      asset: "ETH",
      symbol: "ETH",
      balance: 0,
      balanceRaw: "0",
      decimals: 18,
    };
  }
}

/**
 * Get the USDC balance for a wallet address.
 *
 * @param ctx - Request context for tracing
 * @param address - The wallet address
 * @param network - The network to check balance on
 * @returns The USDC balance
 */
export async function getUsdcBalance(
  ctx: RequestContext,
  address: string,
  network: Network = "base-sepolia"
): Promise<AssetBalance> {
  logger.info(ctx, `operation=get_usdc_balance address=${address} network=${network} status=started`);

  if (!validateAddress(ctx, address)) {
    throw new Error(`Invalid wallet address: ${address}`);
  }

  try {
    const client = getPublicClient(network);
    const usdcContract = USDC_CONTRACTS[network];

    const balanceRaw = await client.readContract({
      address: usdcContract,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address as `0x${string}`],
    });

    // USDC has 6 decimals
    const balance = parseFloat(formatUnits(balanceRaw, 6));

    logger.info(ctx, `operation=get_usdc_balance address=${address} balance=${balance} status=completed`);

    return {
      asset: "USDC",
      symbol: "USDC",
      balance,
      balanceRaw: balanceRaw.toString(),
      decimals: 6,
      usdValue: balance, // USDC is 1:1 with USD
    };
  } catch (error) {
    logger.error(ctx, `operation=get_usdc_balance address=${address} status=failed error=${error}`);
    // Return zero balance on error
    return {
      asset: "USDC",
      symbol: "USDC",
      balance: 0,
      balanceRaw: "0",
      decimals: 6,
      usdValue: 0,
    };
  }
}

/**
 * Get all balances for a wallet address (ETH + USDC).
 *
 * @param ctx - Request context for tracing
 * @param address - The wallet address
 * @param network - The network to check balance on
 * @returns All wallet balances
 */
export async function getWalletBalances(
  ctx: RequestContext,
  address: string,
  network: Network = "base-sepolia"
): Promise<WalletBalances> {
  logger.info(ctx, `operation=get_wallet_balances address=${address} network=${network} status=started`);

  if (!validateAddress(ctx, address)) {
    throw new Error(`Invalid wallet address: ${address}`);
  }

  // Fetch both balances in parallel
  const [ethBalance, usdcBalance] = await Promise.all([
    getEthBalance(ctx, address, network),
    getUsdcBalance(ctx, address, network),
  ]);

  // Calculate total USD value (ETH price would need to be fetched in production)
  // For now, we only count USDC as USD value
  const totalUsdValue = usdcBalance.usdValue || 0;

  const result: WalletBalances = {
    address,
    network,
    balances: [ethBalance, usdcBalance],
    totalUsdValue,
  };

  logger.info(
    ctx,
    `operation=get_wallet_balances address=${address} eth=${ethBalance.balance} usdc=${usdcBalance.balance} status=completed`
  );

  return result;
}

/**
 * Get the USDC balance only (for backwards compatibility).
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
  const usdcBalance = await getUsdcBalance(ctx, address, network);
  return usdcBalance.balance;
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
