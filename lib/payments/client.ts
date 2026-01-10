import { Cdp, Wallet } from "@coinbase/cdp-sdk";

let cdpClient: Cdp | null = null;

export function getCdpClient(): Cdp {
  if (!cdpClient) {
    cdpClient = new Cdp({
      apiKeyId: process.env.CDP_API_KEY_ID!,
      apiKeySecret: process.env.CDP_API_KEY_SECRET!,
      walletSecret: process.env.CDP_WALLET_SECRET,
    });
  }
  return cdpClient;
}

export async function getPlatformWallet(): Promise<Wallet> {
  const walletId = process.env.PLATFORM_WALLET_ID;
  if (!walletId) {
    throw new Error("PLATFORM_WALLET_ID is not configured");
  }
  return Wallet.fetch(walletId);
}

export async function createUserWallet(): Promise<Wallet> {
  const network = process.env.CDP_NETWORK || "base-sepolia";
  return Wallet.create({ networkId: network });
}

export function getNetwork(): "base-sepolia" | "base-mainnet" {
  const network = process.env.CDP_NETWORK || "base-sepolia";
  if (network !== "base-sepolia" && network !== "base-mainnet") {
    throw new Error(`Invalid network: ${network}`);
  }
  return network;
}
