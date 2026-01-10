import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createContext, createLogger } from "@/lib/logging";
import { getDatabaseClient } from "@/lib/db";
import { getWalletBalances, validateAddress, Network } from "@/lib/payments/wallet";

const logger = createLogger("api:wallet");

/**
 * GET /api/wallet
 * Fetch wallet information for the authenticated user
 */
export async function GET() {
  const ctx = createContext();

  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    logger.info(ctx, `operation=get_wallet user_id=${userId} status=started`);

    // Get user from database
    const db = getDatabaseClient();
    const user = await db.getUser(ctx, userId);

    if (!user || !user.wallet?.address) {
      logger.info(ctx, `operation=get_wallet user_id=${userId} status=no_wallet`);
      return NextResponse.json(
        { wallet: null, needsSetup: true },
        { status: 200 }
      );
    }

    const network = (process.env.CDP_NETWORK || "base-sepolia") as Network;

    // Get all balances from blockchain
    let walletBalances;
    try {
      walletBalances = await getWalletBalances(ctx, user.wallet.address, network);
    } catch (err) {
      logger.warn(ctx, `operation=get_wallet user_id=${userId} balance_fetch_failed error=${err}`);
      // Return empty balances on error
      walletBalances = {
        address: user.wallet.address,
        network,
        balances: [
          { asset: "ETH", symbol: "ETH", balance: 0, balanceRaw: "0", decimals: 18 },
          { asset: "USDC", symbol: "USDC", balance: 0, balanceRaw: "0", decimals: 6, usdValue: 0 },
        ],
        totalUsdValue: 0,
      };
    }

    // Find USDC balance for credits
    const usdcBalance = walletBalances.balances.find(b => b.asset === "USDC");
    const credits = usdcBalance?.balance || 0;

    const wallet = {
      address: user.wallet.address,
      type: user.wallet.provider === "coinbase" ? "embedded" : "external",
      provider: user.wallet.provider,
      verified: user.wallet.verified,
      network,
      balances: walletBalances.balances,
      credits, // USDC balance used for payments
      totalUsdValue: walletBalances.totalUsdValue,
      transactions: [], // TODO: Implement transaction history
    };

    logger.info(ctx, `operation=get_wallet user_id=${userId} credits=${credits} status=completed`);

    return NextResponse.json({ wallet });
  } catch (error) {
    logger.error(ctx, `operation=get_wallet status=failed error=${error}`);
    return NextResponse.json(
      { error: "Failed to fetch wallet" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/wallet
 * Create or update wallet for the authenticated user
 */
export async function POST(request: NextRequest) {
  const ctx = createContext();

  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { address, provider = "coinbase" } = body;

    logger.info(ctx, `operation=create_wallet user_id=${userId} provider=${provider} status=started`);

    // Validate address if provided
    if (address) {
      if (!validateAddress(ctx, address)) {
        return NextResponse.json(
          { error: "Invalid wallet address format" },
          { status: 400 }
        );
      }
    }

    const db = getDatabaseClient();
    let user = await db.getUser(ctx, userId);

    // Create user if doesn't exist
    if (!user) {
      user = await db.createUser(ctx, {
        user_id: userId,
        email: "", // Would come from Clerk
        auth_provider: "clerk",
        wallet: {
          address: address || "",
          provider: provider as "coinbase" | "metamask" | "walletconnect",
          verified: false,
        },
        stats: {
          total_jobs: 0,
          total_spent: 0,
          total_work_items: 0,
        },
      });
    } else {
      // Update existing user's wallet
      // TODO: Add updateUserWallet method to database client
    }

    const network = (process.env.CDP_NETWORK || "base-sepolia") as Network;

    // Get all balances
    let walletBalances;
    if (address) {
      try {
        walletBalances = await getWalletBalances(ctx, address, network);
      } catch (err) {
        logger.warn(ctx, `operation=create_wallet balance_fetch_failed error=${err}`);
        walletBalances = {
          address,
          network,
          balances: [
            { asset: "ETH", symbol: "ETH", balance: 0, balanceRaw: "0", decimals: 18 },
            { asset: "USDC", symbol: "USDC", balance: 0, balanceRaw: "0", decimals: 6, usdValue: 0 },
          ],
          totalUsdValue: 0,
        };
      }
    } else {
      walletBalances = {
        address: user.wallet.address,
        network,
        balances: [],
        totalUsdValue: 0,
      };
    }

    const usdcBalance = walletBalances.balances.find(b => b.asset === "USDC");
    const credits = usdcBalance?.balance || 0;

    const wallet = {
      address: address || user.wallet.address,
      type: provider === "coinbase" ? "embedded" : "external",
      provider,
      verified: false,
      network,
      balances: walletBalances.balances,
      credits,
      totalUsdValue: walletBalances.totalUsdValue,
      transactions: [],
    };

    logger.info(ctx, `operation=create_wallet user_id=${userId} address=${address} status=completed`);

    return NextResponse.json({ wallet, success: true });
  } catch (error) {
    logger.error(ctx, `operation=create_wallet status=failed error=${error}`);
    return NextResponse.json(
      { error: "Failed to create wallet" },
      { status: 500 }
    );
  }
}
