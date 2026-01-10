/**
 * Payment Node
 *
 * Processes payment for completed and verified work items.
 * Calls the payment integration to execute USDC transfers via x402 protocol.
 *
 * Flow:
 * 1. Find work item in verified status
 * 2. Call payForWork() from integrations module
 * 3. Update state with payment result (confirmed, failed, retry_count)
 * 4. Return routing decision (success, retry, failed)
 *
 * @see /docs/designs/orchestration/graph/TECH_DESIGN.md
 */

import type { RequestContext } from "@/lib/logging";
import { createLogger } from "@/lib/logging";
import type { WorkItem } from "@/types";
import type { OrchestrationState, PaymentDecision } from "../types";
import { MAX_PAYMENT_RETRIES } from "../utils";
import type { PaymentResult } from "@/lib/orchestration/integrations";

const logger = createLogger("graph");

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Dependencies for payment processing.
 * Wraps the payForWork function from integrations/payments.ts
 *
 * Optional - if not provided, simulated payment is used for testing.
 */
export interface PaymentDependencies {
  /**
   * Execute payment for verified work.
   * This should be wired to payForWork from integrations/payments.ts
   *
   * @param ctx - Request context for tracing
   * @param work_id - Work item ID to pay for
   * @returns Payment result with success/failure and optional tx_hash
   */
  payForWork: (
    ctx: RequestContext,
    work_id: string
  ) => Promise<PaymentResult>;
}

/**
 * Payment state to update on work item.
 * Matches the payment field structure in WorkItem type.
 */
interface PaymentStateUpdate {
  status: "pending" | "processing" | "confirmed" | "failed" | "refunded";
  amount: number;
  tx_hash: string | null;
  original_price: number;
  negotiated_price: number;
  error: string | null;
  retry_count: number;
  initiated_at: Date | null;
  confirmed_at: Date | null;
}

// =============================================================================
// PAYMENT LOGIC
// =============================================================================

/**
 * Simulate payment for testing (when dependencies not provided).
 * In production, this would call the actual payment service.
 *
 * @param workItem - Work item to simulate payment for
 * @returns Simulated payment state update
 */
function simulatePayment(workItem: WorkItem): PaymentStateUpdate {
  const amount = workItem.agent?.price ?? 0;

  return {
    status: "confirmed",
    amount,
    tx_hash: `tx_sim_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    original_price: amount,
    negotiated_price: amount,
    error: null,
    retry_count: workItem.payment?.retry_count ?? 0,
    initiated_at: workItem.payment?.initiated_at ?? new Date(),
    confirmed_at: new Date(),
  };
}

/**
 * Determine the routing decision based on payment result.
 *
 * @param paymentResult - Payment state update
 * @returns Payment routing decision
 */
function determinePaymentDecision(paymentResult: PaymentStateUpdate): PaymentDecision {
  if (paymentResult.status === "confirmed") {
    return "success";
  }
  if (paymentResult.retry_count < MAX_PAYMENT_RETRIES) {
    return "retry";
  }
  return "failed";
}

// =============================================================================
// NODE IMPLEMENTATION
// =============================================================================

/**
 * Payment Node - Dependencies holder for dependency injection.
 * This allows the graph to inject the actual payment integration.
 */
let paymentDeps: PaymentDependencies | null = null;

/**
 * Set payment dependencies.
 * Called during graph initialization to inject the actual integration.
 *
 * @param deps - Payment dependencies
 */
export function setPaymentDependencies(deps: PaymentDependencies): void {
  paymentDeps = deps;
}

/**
 * Payment Node Implementation
 *
 * Processes payment for completed and verified work items.
 * This node is called after galileo_verify passes.
 *
 * Flow:
 * 1. Find work item in verified/paying/payment_retry status
 * 2. Validate work has agent assigned
 * 3. Call payForWork via dependencies (or simulate)
 * 4. Update work item with payment result
 * 5. Return routing decision (success/retry/failed)
 *
 * Routing (per TECH_DESIGN paymentRouter):
 * - success: Payment confirmed, work completed
 * - retry: Payment failed but retries remain (< 3)
 * - failed: Payment failed after max retries
 *
 * @param ctx - Request context for logging
 * @param state - Current graph state
 * @returns Partial state update with payment result
 */
async function paymentNodeImpl(
  ctx: RequestContext,
  state: OrchestrationState
): Promise<Partial<OrchestrationState>> {
  // Get current work item that needs payment
  // Accept: verified (initial), paying (in progress), payment_retry (retrying)
  const currentWork = state.current_work_items.find(
    (w) => w.status === "verified" || w.status === "paying" || w.status === "payment_retry"
  );

  if (!currentWork) {
    logger.warn(ctx, `operation=payment job_id=${state.job_id} result=fail reason=no_work_item`);
    return {
      error: "No work item ready for payment",
      reasoning: "No work item in verified, paying, or payment_retry status",
      decision: "failed",
    };
  }

  const workId = currentWork.work_id;
  const agentId = currentWork.agent?.agent_id ?? "unknown";
  const amount = currentWork.agent?.price ?? 0;
  const retryCount = currentWork.payment?.retry_count ?? 0;

  logger.info(ctx, `operation=payment work_id=${workId} job_id=${state.job_id} agent_id=${agentId} amount=${amount} retry_count=${retryCount}`);

  // Validate work has agent for payment
  if (!currentWork.agent) {
    logger.warn(ctx, `operation=payment work_id=${workId} result=fail reason=no_agent`);
    return {
      error: "Work item has no agent for payment",
      reasoning: "Cannot process payment without agent information",
      decision: "failed",
    };
  }

  let paymentStateUpdate: PaymentStateUpdate;

  // Use injected dependencies if available, otherwise simulate
  if (paymentDeps) {
    try {
      const result = await paymentDeps.payForWork(ctx, workId);

      if (result.success) {
        paymentStateUpdate = {
          status: "confirmed",
          amount,
          tx_hash: result.tx_hash ?? null,
          original_price: amount,
          negotiated_price: currentWork.payment?.negotiated_price ?? amount,
          error: null,
          retry_count: retryCount,
          initiated_at: currentWork.payment?.initiated_at ?? new Date(),
          confirmed_at: new Date(),
        };
      } else {
        // Payment failed - increment retry count
        const newRetryCount = retryCount + 1;
        paymentStateUpdate = {
          status: "failed",
          amount,
          tx_hash: null,
          original_price: amount,
          negotiated_price: currentWork.payment?.negotiated_price ?? amount,
          error: result.error ?? "Payment failed",
          retry_count: newRetryCount,
          initiated_at: currentWork.payment?.initiated_at ?? new Date(),
          confirmed_at: null,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error(ctx, `operation=payment work_id=${workId} status=exception`, error instanceof Error ? error : undefined);

      // Exception counts as a failed attempt
      const newRetryCount = retryCount + 1;
      paymentStateUpdate = {
        status: "failed",
        amount,
        tx_hash: null,
        original_price: amount,
        negotiated_price: currentWork.payment?.negotiated_price ?? amount,
        error: errorMessage,
        retry_count: newRetryCount,
        initiated_at: currentWork.payment?.initiated_at ?? new Date(),
        confirmed_at: null,
      };
    }
  } else {
    // Simulate payment for testing
    logger.debug(ctx, `operation=payment work_id=${workId} mode=simulated`);
    paymentStateUpdate = simulatePayment(currentWork);
  }

  // Determine routing decision
  const decision = determinePaymentDecision(paymentStateUpdate);

  // Build response based on decision
  if (decision === "success") {
    // Payment confirmed - mark work as completed and add to completed list
    const updatedWorkItems = state.current_work_items.map((w) =>
      w.work_id === workId
        ? { ...w, payment: paymentStateUpdate, status: "completed" as const }
        : w
    );
    const completedWorkIds = [...state.completed_work_ids, workId];

    logger.info(ctx, `operation=payment work_id=${workId} status=confirmed tx_hash=${paymentStateUpdate.tx_hash} amount=${amount}`);

    return {
      current_work_items: updatedWorkItems,
      completed_work_ids: completedWorkIds,
      reasoning: `Payment confirmed for $${amount.toFixed(2)}, tx: ${paymentStateUpdate.tx_hash}`,
      decision: "success",
    };
  }

  if (decision === "retry") {
    // Payment failed but retries remain
    const retryWorkItems = state.current_work_items.map((w) =>
      w.work_id === workId
        ? { ...w, payment: paymentStateUpdate, status: "payment_retry" as const }
        : w
    );

    logger.warn(ctx, `operation=payment work_id=${workId} status=failed retry_count=${paymentStateUpdate.retry_count} max=${MAX_PAYMENT_RETRIES} error=${paymentStateUpdate.error}`);

    return {
      current_work_items: retryWorkItems,
      reasoning: `Payment failed: ${paymentStateUpdate.error}. Retry ${paymentStateUpdate.retry_count}/${MAX_PAYMENT_RETRIES}`,
      decision: "retry",
    };
  }

  // Max retries exceeded - mark as failed
  const failedWorkItems = state.current_work_items.map((w) =>
    w.work_id === workId
      ? { ...w, payment: paymentStateUpdate, status: "failed" as const }
      : w
  );

  logger.error(ctx, `operation=payment work_id=${workId} status=max_retries_exceeded retry_count=${paymentStateUpdate.retry_count}`);

  return {
    current_work_items: failedWorkItems,
    reasoning: `Payment failed after ${paymentStateUpdate.retry_count} retries: ${paymentStateUpdate.error}`,
    decision: "failed",
  };
}

/**
 * Exported payment node (without tracing wrapper - tracing applied in graph.ts)
 */
export const paymentNode = paymentNodeImpl;

/**
 * Re-export for direct use
 */
export { paymentNodeImpl };

/**
 * Create a payment node with injected dependencies.
 *
 * @param deps - Payment dependencies
 * @returns Node function with ctx as first parameter
 */
export function createPaymentNode(
  deps: PaymentDependencies
): (ctx: RequestContext, state: OrchestrationState) => Promise<Partial<OrchestrationState>> {
  return async (ctx: RequestContext, state: OrchestrationState) => {
    // Temporarily set dependencies for this invocation
    const prevDeps = paymentDeps;
    paymentDeps = deps;
    try {
      return await paymentNodeImpl(ctx, state);
    } finally {
      paymentDeps = prevDeps;
    }
  };
}
