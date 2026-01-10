import { ObjectId } from "mongodb";

export type TransactionType = "agent_payment" | "user_deposit" | "user_withdrawal" | "refund";
export type TransactionStatus = "pending" | "confirmed" | "failed";

export interface Transaction {
  _id: ObjectId;
  type: TransactionType;
  status: TransactionStatus;
  fromAddress: string;
  toAddress: string;
  amountUsd: number;
  amountUsdc: string;
  network: "base-sepolia" | "base-mainnet";
  txHash?: string;
  jobId?: ObjectId;
  workItemId?: ObjectId;
  agentId?: ObjectId;
  userId?: ObjectId;
  error?: string;
  createdAt: Date;
  confirmedAt?: Date;
}

export type CreateTransactionInput = Omit<
  Transaction,
  "_id" | "status" | "txHash" | "error" | "createdAt" | "confirmedAt"
>;
