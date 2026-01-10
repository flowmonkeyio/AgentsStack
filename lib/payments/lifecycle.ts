/**
 * Transaction Lifecycle Module
 *
 * Manages the payment transaction lifecycle:
 * 1. initiatePayment() - Creates transaction record (pending)
 * 2. onPaymentConfirmed() - Updates existing transaction (confirmed)
 * 3. onPaymentFailed() - Updates existing transaction (failed)
 *
 * @see /docs/designs/payments/TECH_DESIGN.md
 */

import { nanoid } from "nanoid";
import type { DatabaseClient } from "@/lib/db";
import type {
  InitiatePaymentParams,
  PaymentConfirmationParams,
  PaymentFailureParams,
} from "./types";

/**
 * Generate a unique transaction ID.
 *
 * @returns Unique transaction ID
 */
function generateTxId(): string {
  return `tx_${nanoid()}`;
}

/**
 * Initiate a payment by creating a transaction record.
 *
 * Called before executing the actual payment.
 * Creates the transaction record in pending state.
 *
 * @param db - Database client
 * @param params - Payment initiation parameters
 * @returns Object containing the transaction ID
 */
export async function initiatePayment(
  db: DatabaseClient,
  params: InitiatePaymentParams
): Promise<{ tx_id: string }> {
  // 1. Get current budget for audit
  const job = await db.getJob(params.job_id);
  if (!job) {
    throw new Error(`Job not found: ${params.job_id}`);
  }

  // 2. Create transaction record (pending)
  const tx_id = generateTxId();
  await db.createTransaction({
    tx_id,
    job_id: params.job_id,
    work_id: params.work_id,
    user_id: params.user_id,
    agent_id: params.agent_id,
    amount: params.amount,
    currency: "USDC",
    protocol: "x402",
    tx_hash: "", // Empty until confirmed
    status: "pending",
    audit: {
      reason: params.reason,
      approved_by: "main_agent",
      budget_before: job.budget.spent,
      budget_after: job.budget.spent + params.amount,
    },
    confirmed_at: null,
  });

  // 3. Update work item payment status to processing
  await db.updateWorkItemPayment(params.work_id, {
    status: "processing",
    amount: params.amount,
    tx_hash: null,
    original_price: params.amount,
    negotiated_price: params.amount,
    error: null,
    retry_count: 0,
    initiated_at: new Date(),
    confirmed_at: null,
  });

  return { tx_id };
}

/**
 * Handle successful payment confirmation.
 *
 * Called after executePayment() succeeds.
 * Updates the existing transaction - does NOT create a new one.
 *
 * @param db - Database client
 * @param params - Payment confirmation parameters
 */
export async function onPaymentConfirmed(
  db: DatabaseClient,
  params: PaymentConfirmationParams
): Promise<void> {
  const now = new Date();

  // 1. UPDATE existing transaction (not create new)
  await db.updateTransactionStatus(params.tx_id, "confirmed");
  await db.updateTransactionTxHash(params.tx_id, params.tx_hash);

  // 2. Update work item payment
  await db.updateWorkItemPayment(params.work_id, {
    status: "confirmed",
    tx_hash: params.tx_hash,
    confirmed_at: now,
    error: null,
  });

  // 3. Update job budget
  const job = await db.getJob(params.job_id);
  if (job) {
    await db.updateJobBudget(params.job_id, {
      ...job.budget,
      spent: job.budget.spent + params.amount,
      remaining: job.budget.remaining - params.amount,
    });
  }

  // 4. Update agent stats
  await db.updateAgentStats(params.agent_id, {
    jobs_completed: 1, // Incremented via $inc internally
  });

  // 5. Update work item status to completed
  await db.updateWorkItemStatus(params.work_id, "completed");
}

/**
 * Handle payment failure.
 *
 * Called when executePayment() fails after all retries.
 *
 * @param db - Database client
 * @param params - Payment failure parameters
 */
export async function onPaymentFailed(
  db: DatabaseClient,
  params: PaymentFailureParams
): Promise<void> {
  // 1. Update transaction status
  await db.updateTransactionStatus(params.tx_id, "failed");

  // 2. Update work item payment
  await db.updateWorkItemPayment(params.work_id, {
    status: "failed",
    error: params.error,
  });

  // 3. Update work item status
  await db.updateWorkItemStatus(params.work_id, "failed");
}
