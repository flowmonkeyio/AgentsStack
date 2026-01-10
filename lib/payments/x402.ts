/**
 * x402 Protocol Integration Module
 *
 * Handles x402 payment execution and confirmation.
 * Uses the x402 protocol for machine-to-machine payments on Base network.
 *
 * NOTE: We use x402 for direct transfers AFTER verification (not the HTTP 402 flow).
 *
 * @see /docs/designs/payments/TECH_DESIGN.md
 */

import { RequestContext, createLogger } from "@/lib/logging";
import type {
  PaymentRequest,
  PaymentResponse,
  X402Transfer,
  X402TransferResult,
} from "./types";
import { isValidAddress, getBalance } from "./wallet";
import { isRetryableError } from "./retry";

const logger = createLogger("payments");

// TODO: Import from @coinbase/x402 when available
// import { x402 } from '@coinbase/x402';

/**
 * Default confirmation timeout in milliseconds (1 minute).
 */
const DEFAULT_CONFIRMATION_TIMEOUT = 60000;

/**
 * Default number of confirmations to wait for.
 */
const DEFAULT_CONFIRMATIONS = 1;

/**
 * Wait for transaction confirmation options.
 */
interface ConfirmationOptions {
  /** Timeout in milliseconds */
  timeout: number;

  /** Number of confirmations required */
  confirmations: number;
}

/**
 * Execute an x402 transfer.
 *
 * TODO: Implement actual x402 SDK integration
 *
 * @param ctx - Request context for tracing
 * @param transfer - Transfer details
 * @returns Transfer result with transaction hash
 */
async function x402Transfer(
  ctx: RequestContext,
  transfer: X402Transfer
): Promise<X402TransferResult> {
  logger.info(
    ctx,
    `operation=x402_transfer from=${transfer.from} to=${transfer.to} amount=${transfer.amount} currency=${transfer.currency} status=started`
  );

  // TODO: Implement actual x402 SDK call
  // const result = await x402.transfer({
  //   from: transfer.from,
  //   to: transfer.to,
  //   amount: transfer.amount,
  //   currency: transfer.currency,
  //   memo: transfer.memo
  // });
  // return { hash: result.hash };

  // Placeholder: Return simulated transaction hash for development
  logger.warn(
    ctx,
    `operation=x402_transfer amount=${transfer.amount} from=${transfer.from} to=${transfer.to} status=placeholder`
  );

  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Generate a simulated transaction hash
  const hash = `0x${generateSimulatedHash()}`;

  logger.info(ctx, `operation=x402_transfer tx_hash=${hash} status=completed`);
  return { hash };
}

/**
 * Wait for transaction confirmation on-chain.
 *
 * TODO: Implement actual confirmation checking
 *
 * @param ctx - Request context for tracing
 * @param txHash - Transaction hash to check
 * @param options - Confirmation options
 * @returns True if confirmed, false if timed out
 */
async function waitForConfirmation(
  ctx: RequestContext,
  txHash: string,
  options: ConfirmationOptions
): Promise<boolean> {
  const { timeout } = options;
  const startTime = Date.now();

  logger.info(
    ctx,
    `operation=wait_for_confirmation tx_hash=${txHash} timeout=${timeout} confirmations=${options.confirmations} status=started`
  );

  // TODO: Implement actual confirmation polling
  // while (Date.now() - startTime < timeout) {
  //   const status = await getTransactionStatus(txHash);
  //   if (status.confirmations >= options.confirmations) {
  //     return true;
  //   }
  //   await sleep(1000);
  // }
  // return false;

  // Placeholder: Simulate confirmation delay
  logger.warn(ctx, `operation=wait_for_confirmation tx_hash=${txHash} status=placeholder`);

  // Simulate a short wait (10% of timeout for development)
  const waitTime = Math.min(timeout * 0.1, 500);
  await new Promise((resolve) => setTimeout(resolve, waitTime));

  // Check if we're within timeout
  const confirmed = Date.now() - startTime < timeout;
  logger.info(
    ctx,
    `operation=wait_for_confirmation tx_hash=${txHash} confirmed=${confirmed} status=completed`
  );
  return confirmed;
}

/**
 * Execute a payment using the x402 protocol.
 *
 * This is the main payment execution function that:
 * 1. Validates addresses
 * 2. Checks balance
 * 3. Executes the x402 transfer
 * 4. Waits for confirmation
 *
 * @param ctx - Request context for tracing
 * @param request - Payment request details
 * @returns Payment response with success status and tx_hash
 */
export async function executePayment(
  ctx: RequestContext,
  request: PaymentRequest
): Promise<PaymentResponse> {
  logger.info(
    ctx,
    `operation=execute_payment work_id=${request.work_id} agent_id=${request.agent_id} amount=${request.amount} status=started`
  );

  try {
    // 1. Validate addresses
    if (
      !isValidAddress(ctx, request.from_address) ||
      !isValidAddress(ctx, request.to_address)
    ) {
      logger.error(
        ctx,
        `operation=execute_payment work_id=${request.work_id} status=failed reason=invalid_address`
      );
      return { success: false, error: "Invalid wallet address" };
    }

    // 2. Check balance
    const balance = await getBalance(ctx, request.from_address);
    if (balance < request.amount) {
      logger.error(
        ctx,
        `operation=execute_payment work_id=${request.work_id} status=failed reason=insufficient_balance balance=${balance} required=${request.amount}`
      );
      return { success: false, error: "Insufficient balance" };
    }

    // 3. Execute x402 payment
    const tx = await x402Transfer(ctx, {
      from: request.from_address,
      to: request.to_address,
      amount: request.amount,
      currency: request.currency,
      memo: `AgentStack: ${request.work_id}`,
    });

    // 4. Wait for confirmation
    const confirmed = await waitForConfirmation(ctx, tx.hash, {
      timeout: DEFAULT_CONFIRMATION_TIMEOUT,
      confirmations: DEFAULT_CONFIRMATIONS,
    });

    if (!confirmed) {
      logger.error(
        ctx,
        `operation=execute_payment work_id=${request.work_id} tx_hash=${tx.hash} status=failed reason=not_confirmed`
      );
      return {
        success: false,
        error: "Transaction not confirmed",
        retry_suggested: true,
      };
    }

    logger.info(
      ctx,
      `operation=execute_payment work_id=${request.work_id} tx_hash=${tx.hash} amount=${request.amount} status=confirmed`
    );
    return {
      success: true,
      tx_hash: tx.hash,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const isRetryable = error instanceof Error && isRetryableError(error);
    logger.error(
      ctx,
      `operation=execute_payment work_id=${request.work_id} status=failed reason=${message} retryable=${isRetryable}`,
      error instanceof Error ? error : undefined
    );
    return {
      success: false,
      error: message,
      retry_suggested: isRetryable,
    };
  }
}

/**
 * Generate a simulated transaction hash for development.
 * In production, this comes from the actual blockchain transaction.
 *
 * @returns 64-character hex string
 */
function generateSimulatedHash(): string {
  const chars = "0123456789abcdef";
  let result = "";
  for (let i = 0; i < 64; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
