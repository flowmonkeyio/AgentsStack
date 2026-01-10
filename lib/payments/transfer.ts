/**
 * USDC Transfer Module
 *
 * Handles USDC transfers using x402 protocol.
 *
 * @see /docs/MODULE_PAYMENTS.md
 * @see /docs/reference/X402_PROTOCOL.md
 * @see /docs/designs/core-data-structure/TECH_DESIGN.md
 */

import { getPlatformWallet, getNetwork } from "./client";
import { getDatabaseClient } from "@/lib/db";
import type { Transaction } from "@/types";
import { nanoid } from "nanoid";

const USDC_CONTRACT: Record<string, string> = {
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "base-mainnet": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};

export interface TransferParams {
  agent_wallet: string;
  amount: number;
  job_id: string;
  work_id: string;
  user_id: string;
  agent_id: string;
  reason: string;
  budget_before: number;
  budget_after: number;
}

export interface TransferResult {
  tx_id: string;
  tx_hash: string;
}

/**
 * Transfer USDC to an agent wallet.
 *
 * @param params - Transfer parameters
 * @returns Transaction ID and hash
 */
export async function transferUsdc(params: TransferParams): Promise<TransferResult> {
  const {
    agent_wallet,
    amount,
    job_id,
    work_id,
    user_id,
    agent_id,
    reason,
    budget_before,
    budget_after,
  } = params;

  const db = getDatabaseClient();
  const tx_id = nanoid();

  // Create transaction record (pending)
  await db.createTransaction({
    tx_id,
    job_id,
    work_id,
    user_id,
    agent_id,
    amount,
    currency: "USDC",
    protocol: "x402",
    tx_hash: "", // Will be updated after execution
    status: "pending",
    audit: {
      reason,
      approved_by: "system",
      budget_before,
      budget_after,
    },
    confirmed_at: null,
  });

  try {
    // TODO: Implement actual USDC transfer via CDP SDK
    // For now, simulate a successful transfer
    const tx_hash = `0x${nanoid(64)}`;

    // Update transaction with hash and confirmed status
    await db.updateTransactionStatus(tx_id, "confirmed");

    return { tx_id, tx_hash };
  } catch (error) {
    // Update transaction with failed status
    await db.updateTransactionStatus(tx_id, "failed");
    throw error;
  }
}

/**
 * Get USDC contract address for the current network.
 *
 * @returns USDC contract address
 */
export function getUsdcContract(): string {
  const network = getNetwork();
  return USDC_CONTRACT[network];
}
