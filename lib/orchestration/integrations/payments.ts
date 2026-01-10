/**
 * Payments Integration Module
 *
 * Handles payment execution for completed work items.
 * Manages state transitions and retry logic with exponential backoff.
 *
 * @see /docs/designs/orchestration/integrations/TECH_DESIGN.md
 */

import type { PaymentClient } from "@/lib/payments";
import type { DatabaseClient } from "@/lib/db/database-client";
import type { IWorkLifecycle } from "@/lib/orchestration/work-lifecycle";
import type { WorkItem } from "@/types";
import type { PaymentResult, IntegrationEvent } from "./types";
import { IntegrationError } from "./types";
import { sleep } from "@/lib/utils";

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Base delay for payment retry (ms)
 */
const BASE_RETRY_DELAY_MS = 5000;

/**
 * Maximum number of payment retries
 */
const MAX_PAYMENT_RETRIES = 3;

// =============================================================================
// PAYMENT INTEGRATION
// =============================================================================

/**
 * Dependencies required for payment integration
 */
export interface PaymentDependencies {
  /** Payment client for executing transfers */
  payments: PaymentClient;
  /** Database client for reading work/job/agent data */
  db: DatabaseClient;
  /** Work lifecycle for state transitions */
  lifecycle: IWorkLifecycle;
  /** Event emitter function */
  emitEvent: (event: IntegrationEvent) => void;
}

/**
 * Execute payment for verified work.
 *
 * Flow:
 * 1. Fetch work item, job, and agent
 * 2. Transition to paying
 * 3. Build payment request
 * 4. Execute payment via PaymentClient
 * 5. Transition based on result (confirmed/failed)
 * 6. Emit appropriate event
 *
 * @param work_id - ID of the work item to pay for
 * @param deps - Required dependencies
 * @returns Payment result
 * @throws IntegrationError if data is missing or payment fails fatally
 */
export async function payForWork(
  work_id: string,
  deps: PaymentDependencies
): Promise<PaymentResult> {
  const { payments, db, lifecycle, emitEvent } = deps;

  // Fetch work item
  const work = await db.getWorkItem(work_id);
  if (!work) {
    throw new IntegrationError(
      `Work item not found: ${work_id}`,
      "payments",
      false,
      { work_id }
    );
  }

  // Validate work is in verified state
  if (work.status !== "verified") {
    throw new IntegrationError(
      `Work item not in verified state: ${work.status}`,
      "payments",
      false,
      { work_id, status: work.status }
    );
  }

  // Fetch job for user info
  const job = await db.getJob(work.job_id);
  if (!job) {
    throw new IntegrationError(
      `Job not found: ${work.job_id}`,
      "payments",
      false,
      { work_id, job_id: work.job_id }
    );
  }

  // Fetch agent for wallet address
  if (!work.agent) {
    throw new IntegrationError(
      `Work item has no agent assigned`,
      "payments",
      false,
      { work_id }
    );
  }

  const agent = await db.getAgent(work.agent.agent_id);
  if (!agent) {
    throw new IntegrationError(
      `Agent not found: ${work.agent.agent_id}`,
      "payments",
      false,
      { work_id, agent_id: work.agent.agent_id }
    );
  }

  // Transition to paying
  await lifecycle.transition(work_id, "start_payment");

  // Build payment request
  const paymentRequest = {
    work_id,
    job_id: work.job_id,
    user_id: job.user_id,
    agent_id: agent.agent_id,
    amount: work.agent.price,
    currency: "USDC" as const,
    from_address: "", // Will need to be fetched from user
    to_address: agent.wallet,
    reason: `Work completed, score ${work.verification?.score ?? "N/A"}`,
  };

  // Execute payment
  let paymentResponse: PaymentResult;
  try {
    paymentResponse = await payments.pay(paymentRequest);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    // Transition to failed state
    await lifecycle.transition(work_id, "payment_failed");
    return {
      success: false,
      error: message,
      retry_suggested: true,
    };
  }

  if (paymentResponse.success) {
    // Transition to completed
    await lifecycle.transition(work_id, "payment_confirmed", {
      amount: paymentRequest.amount,
      tx_hash: paymentResponse.tx_hash!,
    });

    emitEvent({
      type: "work:payment_confirmed",
      work_id,
      amount: paymentRequest.amount,
      tx_hash: paymentResponse.tx_hash!,
    });

    return paymentResponse;
  }

  // Payment failed
  if (paymentResponse.retry_suggested) {
    await lifecycle.transition(work_id, "payment_failed");
    // Will be retried by retry logic
  } else {
    await lifecycle.transition(work_id, "max_payment_retries");
  }

  return paymentResponse;
}

// =============================================================================
// PAYMENT RETRY
// =============================================================================

/**
 * Retry a failed payment with exponential backoff.
 *
 * @param work_id - ID of the work item
 * @param deps - Required dependencies
 */
export async function retryPayment(
  work_id: string,
  deps: PaymentDependencies
): Promise<void> {
  const { db, lifecycle } = deps;

  // Fetch work item to get retry count
  const work = await db.getWorkItem(work_id);
  if (!work) {
    throw new IntegrationError(
      `Work item not found: ${work_id}`,
      "payments",
      false,
      { work_id }
    );
  }

  const retryCount = work.payment?.retry_count ?? 0;

  // Check if max retries exceeded
  if (retryCount >= MAX_PAYMENT_RETRIES) {
    await lifecycle.transition(work_id, "max_payment_retries");
    return;
  }

  // Exponential backoff: 5s, 10s, 20s
  const backoffMs = BASE_RETRY_DELAY_MS * Math.pow(2, retryCount);
  await sleep(backoffMs);

  // Transition back to paying state
  await lifecycle.transition(work_id, "retry_payment");

  // Retry payment
  await payForWork(work_id, deps);
}

// =============================================================================
// PAYMENT STATUS CHECK
// =============================================================================

/**
 * Check the on-chain status of a payment.
 * Used during recovery to verify pending payments.
 *
 * @param work_id - ID of the work item
 * @param deps - Required dependencies
 */
export async function checkPaymentStatus(
  work_id: string,
  deps: PaymentDependencies
): Promise<void> {
  const { payments, db, lifecycle, emitEvent } = deps;

  const work = await db.getWorkItem(work_id);
  if (!work) {
    throw new IntegrationError(
      `Work item not found: ${work_id}`,
      "payments",
      false,
      { work_id }
    );
  }

  // If no transaction started, retry payment
  if (!work.payment?.tx_hash) {
    await payForWork(work_id, deps);
    return;
  }

  // Check on-chain status
  const status = await payments.getPaymentStatus(work.payment.tx_hash);

  if (status === "confirmed") {
    await lifecycle.transition(work_id, "payment_confirmed", {
      amount: work.payment.amount,
      tx_hash: work.payment.tx_hash,
    });

    emitEvent({
      type: "work:payment_confirmed",
      work_id,
      amount: work.payment.amount,
      tx_hash: work.payment.tx_hash,
    });
  } else if (status === "failed") {
    await lifecycle.transition(work_id, "payment_failed");
  }
  // If pending, wait for next check (no action needed)
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if a work item is ready for payment.
 * Must be in "verified" status.
 *
 * @param work - Work item to check
 * @returns true if ready for payment
 */
export function isReadyForPayment(work: WorkItem): boolean {
  return work.status === "verified" && work.agent !== null;
}

/**
 * Calculate the payment amount for a work item.
 * Takes into account negotiated price if available.
 *
 * @param work - Work item
 * @returns Payment amount in USDC
 */
export function calculatePaymentAmount(work: WorkItem): number {
  if (!work.agent) {
    return 0;
  }

  // Use negotiated price if available, otherwise agent's set price
  if (work.payment?.negotiated_price) {
    return work.payment.negotiated_price;
  }

  return work.agent.price;
}

/**
 * Format payment details for logging/display.
 *
 * @param work - Work item
 * @param result - Payment result
 * @returns Formatted string
 */
export function formatPaymentDetails(
  work: WorkItem,
  result: PaymentResult
): string {
  const lines: string[] = [
    `Work ID: ${work.work_id}`,
    `Agent: ${work.agent?.name ?? "Unknown"}`,
    `Amount: ${work.agent?.price ?? 0} USDC`,
  ];

  if (result.success) {
    lines.push(`Status: Confirmed`);
    lines.push(`Transaction: ${result.tx_hash}`);
  } else {
    lines.push(`Status: Failed`);
    lines.push(`Error: ${result.error}`);
    if (result.retry_suggested) {
      lines.push(`Retry: Suggested`);
    }
  }

  return lines.join("\n");
}
