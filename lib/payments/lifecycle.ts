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
import { RequestContext, createLogger } from "@/lib/logging";
import type { DatabaseClient } from "@/lib/db";
import type {
  InitiatePaymentParams,
  PaymentConfirmationParams,
  PaymentFailureParams,
} from "./types";

const logger = createLogger("payments");

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
 * @param ctx - Request context for tracing
 * @param db - Database client
 * @param params - Payment initiation parameters
 * @returns Object containing the transaction ID
 */
export async function initiatePayment(
  ctx: RequestContext,
  db: DatabaseClient,
  params: InitiatePaymentParams
): Promise<{ tx_id: string }> {
  logger.info(
    ctx,
    `operation=initiate_payment work_id=${params.work_id} job_id=${params.job_id} agent_id=${params.agent_id} amount=${params.amount} status=started`
  );

  // 1. Get current budget for audit
  const job = await db.getJob(ctx, params.job_id);
  if (!job) {
    logger.error(
      ctx,
      `operation=initiate_payment work_id=${params.work_id} job_id=${params.job_id} status=failed reason=job_not_found`
    );
    throw new Error(`Job not found: ${params.job_id}`);
  }

  // 2. Create transaction record (pending)
  const tx_id = generateTxId();
  logger.info(ctx, `operation=initiate_payment work_id=${params.work_id} tx_id=${tx_id} status=creating_transaction`);

  await db.createTransaction(ctx, {
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
  await db.updateWorkItemPayment(ctx, params.work_id, {
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

  logger.info(
    ctx,
    `operation=initiate_payment work_id=${params.work_id} tx_id=${tx_id} amount=${params.amount} status=initiated`
  );

  return { tx_id };
}

/**
 * Handle successful payment confirmation.
 *
 * Called after executePayment() succeeds.
 * Updates the existing transaction - does NOT create a new one.
 *
 * @param ctx - Request context for tracing
 * @param db - Database client
 * @param params - Payment confirmation parameters
 */
export async function onPaymentConfirmed(
  ctx: RequestContext,
  db: DatabaseClient,
  params: PaymentConfirmationParams
): Promise<void> {
  logger.info(
    ctx,
    `operation=payment_confirmed tx_id=${params.tx_id} tx_hash=${params.tx_hash} work_id=${params.work_id} amount=${params.amount} status=started`
  );

  const now = new Date();

  // 1. UPDATE existing transaction (not create new)
  await db.updateTransactionStatus(ctx, params.tx_id, "confirmed");
  await db.updateTransactionTxHash(ctx, params.tx_id, params.tx_hash);

  // 2. Update work item payment
  await db.updateWorkItemPayment(ctx, params.work_id, {
    status: "confirmed",
    tx_hash: params.tx_hash,
    confirmed_at: now,
    error: null,
  });

  // 3. Update job budget
  const job = await db.getJob(ctx, params.job_id);
  if (job) {
    await db.updateJobBudget(ctx, params.job_id, {
      ...job.budget,
      spent: job.budget.spent + params.amount,
      remaining: job.budget.remaining - params.amount,
    });
    logger.info(
      ctx,
      `operation=payment_confirmed job_id=${params.job_id} budget_spent=${job.budget.spent + params.amount} budget_remaining=${job.budget.remaining - params.amount}`
    );
  }

  // 4. Update agent stats
  await db.updateAgentStats(ctx, params.agent_id, {
    jobs_completed: 1, // Incremented via $inc internally
  });

  // 5. Update work item status to completed
  await db.updateWorkItemStatus(ctx, params.work_id, "completed");

  logger.info(
    ctx,
    `operation=payment_confirmed tx_id=${params.tx_id} tx_hash=${params.tx_hash} work_id=${params.work_id} agent_id=${params.agent_id} status=completed`
  );
}

/**
 * Handle payment failure.
 *
 * Called when executePayment() fails after all retries.
 *
 * @param ctx - Request context for tracing
 * @param db - Database client
 * @param params - Payment failure parameters
 */
export async function onPaymentFailed(
  ctx: RequestContext,
  db: DatabaseClient,
  params: PaymentFailureParams
): Promise<void> {
  logger.info(
    ctx,
    `operation=payment_failed tx_id=${params.tx_id} work_id=${params.work_id} status=started`
  );

  // 1. Update transaction status
  await db.updateTransactionStatus(ctx, params.tx_id, "failed");

  // 2. Update work item payment
  await db.updateWorkItemPayment(ctx, params.work_id, {
    status: "failed",
    error: params.error,
  });

  // 3. Update work item status
  await db.updateWorkItemStatus(ctx, params.work_id, "failed");

  logger.error(
    ctx,
    `operation=payment_failed tx_id=${params.tx_id} work_id=${params.work_id} reason="${params.error}" status=completed`
  );
}
