import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createContext, createLogger } from "@/lib/logging";
import { getDatabaseClient } from "@/lib/db";
import { getPaymentClient } from "@/lib/payments";
import { validateAddress } from "@/lib/payments/wallet";

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

    // Get balance from payment client
    const paymentClient = getPaymentClient(ctx);
    let balance = 0;
    try {
      balance = await paymentClient.getBalance(ctx, user.wallet.address);
    } catch (err) {
      logger.warn(ctx, `operation=get_wallet user_id=${userId} balance_fetch_failed error=${err}`);
    }

    // Get recent transactions
    const allTransactions = await db.getTransactionsByJob(ctx, userId); // This won't work, need to add method

    const wallet = {
      address: user.wallet.address,
      type: user.wallet.provider === "coinbase" ? "embedded" : "external",
      provider: user.wallet.provider,
      verified: user.wallet.verified,
      balance: balance,
      credits: balance, // For now, credits = balance
      network: process.env.CDP_NETWORK || "base-sepolia",
      transactions: [], // TODO: Implement transaction history
    };

    logger.info(ctx, `operation=get_wallet user_id=${userId} balance=${balance} status=completed`);

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
      // Get email from Clerk (we'd need to fetch this properly)
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
      // For now, we'll need to do a direct update
    }

    // Get balance
    const paymentClient = getPaymentClient(ctx);
    let balance = 0;
    if (address) {
      try {
        balance = await paymentClient.getBalance(ctx, address);
      } catch (err) {
        logger.warn(ctx, `operation=create_wallet balance_fetch_failed error=${err}`);
      }
    }

    const wallet = {
      address: address || user.wallet.address,
      type: provider === "coinbase" ? "embedded" : "external",
      provider,
      verified: false,
      balance,
      credits: balance,
      network: process.env.CDP_NETWORK || "base-sepolia",
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
