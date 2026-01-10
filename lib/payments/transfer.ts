import { getPlatformWallet, getNetwork } from "./client";
import { getTransactionsCollection } from "@/lib/db";
import type { CreateTransactionInput } from "@/types/transaction";
import { ObjectId } from "mongodb";

const USDC_CONTRACT: Record<string, string> = {
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  "base-mainnet": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
};

export interface TransferParams {
  toAddress: string;
  amountUsd: number;
  jobId?: string;
  workItemId?: string;
  agentId?: string;
}

export async function transferUsdc(params: TransferParams): Promise<{
  transactionId: ObjectId;
  txHash: string;
}> {
  const { toAddress, amountUsd, jobId, workItemId, agentId } = params;
  const network = getNetwork();
  const wallet = await getPlatformWallet();

  // USDC has 6 decimals
  const amountUsdc = (amountUsd * 1_000_000).toString();

  // Create transaction record
  const transactions = await getTransactionsCollection();
  const txInput: CreateTransactionInput = {
    type: "agent_payment",
    fromAddress: process.env.PLATFORM_WALLET_ADDRESS!,
    toAddress,
    amountUsd,
    amountUsdc,
    network,
    ...(jobId && { jobId: new ObjectId(jobId) }),
    ...(workItemId && { workItemId: new ObjectId(workItemId) }),
    ...(agentId && { agentId: new ObjectId(agentId) }),
  };

  const result = await transactions.insertOne({
    ...txInput,
    status: "pending",
    createdAt: new Date(),
  } as never);

  const transactionId = result.insertedId;

  try {
    // Execute transfer
    const transfer = await wallet.transfer({
      to: toAddress,
      amount: amountUsdc,
      assetId: USDC_CONTRACT[network],
    });

    // Wait for confirmation
    await transfer.wait();

    // Update transaction with hash
    const txHash = transfer.getTransactionHash()!;
    await transactions.updateOne(
      { _id: transactionId },
      {
        $set: {
          status: "confirmed",
          txHash,
          confirmedAt: new Date(),
        },
      }
    );

    return { transactionId, txHash };
  } catch (error) {
    // Update transaction with error
    await transactions.updateOne(
      { _id: transactionId },
      {
        $set: {
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
        },
      }
    );
    throw error;
  }
}
