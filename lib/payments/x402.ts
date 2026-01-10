/**
 * x402 Protocol Integration Module
 *
 * Handles payment execution and confirmation using CDP SDK.
 * Uses the CDP SDK for USDC transfers on Base network.
 *
 * @see /docs/designs/payments/TECH_DESIGN.md
 */

import { RequestContext, createLogger } from "@/lib/logging";
import { CdpClient, parseUnits } from "@coinbase/cdp-sdk";
import { createPublicClient, http } from "viem";
import { baseSepolia, base } from "viem/chains";
import type {
  PaymentRequest,
  PaymentResponse,
  X402Transfer,
  X402TransferResult,
} from "./types";
import { isValidAddress, getBalance, type Network } from "./wallet";
import { isRetryableError } from "./retry";

const logger = createLogger("payments");

/**
 * Default confirmation timeout in milliseconds (2 minutes).
 */
const DEFAULT_CONFIRMATION_TIMEOUT = 120000;

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

// =============================================================================
// CDP CLIENT SINGLETON
// =============================================================================

let cdpClient: CdpClient | null = null;

/**
 * Get or create CDP client singleton.
 */
function getCdpClient(ctx: RequestContext): CdpClient {
  if (!cdpClient) {
    const apiKeyId = process.env.CDP_API_KEY_ID;
    const apiKeySecret = process.env.CDP_API_KEY_SECRET;
    const walletSecret = process.env.CDP_WALLET_SECRET;

    if (!apiKeyId || !apiKeySecret || !walletSecret) {
      logger.error(ctx, `operation=get_cdp_client status=failed reason=missing_credentials`);
      throw new Error("CDP credentials not configured: CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET required");
    }

    cdpClient = new CdpClient({
      apiKeyId,
      apiKeySecret,
      walletSecret,
    });

    logger.info(ctx, `operation=get_cdp_client status=initialized`);
  }
  return cdpClient;
}

/**
 * Get viem public client for transaction confirmation.
 */
function getPublicClient(network: Network) {
  const chain = network === "base-mainnet" ? base : baseSepolia;
  return createPublicClient({
    chain,
    transport: http(),
  });
}

/**
 * CDP SDK network type (different from our wallet Network type).
 */
type CdpNetwork = "base" | "base-sepolia" | "ethereum" | "ethereum-sepolia";

/**
 * Get network from environment.
 */
function getNetwork(): Network {
  const network = process.env.CDP_NETWORK || "base-sepolia";
  if (network !== "base-sepolia" && network !== "base-mainnet") {
    throw new Error(`Invalid network: ${network}`);
  }
  return network;
}

/**
 * Map our network to CDP SDK network name.
 */
function getCdpNetwork(): CdpNetwork {
  const network = process.env.CDP_NETWORK || "base-sepolia";
  // CDP SDK uses "base" instead of "base-mainnet"
  if (network === "base-mainnet") {
    return "base";
  }
  if (network === "base-sepolia") {
    return "base-sepolia";
  }
  throw new Error(`Unsupported network for CDP: ${network}`);
}

/**
 * Execute a USDC transfer using CDP SDK.
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
    `operation=cdp_transfer from=${transfer.from} to=${transfer.to} amount=${transfer.amount} currency=${transfer.currency} status=started`
  );

  const cdp = getCdpClient(ctx);
  const cdpNetwork = getCdpNetwork();

  try {
    // Get or create the platform account (sender)
    // The platform wallet is managed by CDP and identified by name
    const platformWalletId = process.env.PLATFORM_WALLET_ID || "agentstack-platform";
    const sender = await cdp.evm.getOrCreateAccount({
      name: platformWalletId,
    });

    logger.info(ctx, `operation=cdp_transfer sender_address=${sender.address} platform_wallet=${platformWalletId} network=${cdpNetwork}`);

    // Verify sender address matches expected (if configured)
    const expectedAddress = process.env.PLATFORM_WALLET_ADDRESS;
    if (expectedAddress && sender.address.toLowerCase() !== expectedAddress.toLowerCase()) {
      logger.warn(ctx, `operation=cdp_transfer status=address_mismatch expected=${expectedAddress} actual=${sender.address}`);
    }

    // Execute the transfer
    // Amount is in USDC (6 decimals)
    const amountInMicroUnits = parseUnits(transfer.amount.toString(), 6);

    const { transactionHash } = await sender.transfer({
      to: transfer.to as `0x${string}`,
      amount: amountInMicroUnits,
      token: "usdc",
      network: cdpNetwork,
    });

    logger.info(ctx, `operation=cdp_transfer tx_hash=${transactionHash} amount=${transfer.amount} status=submitted`);

    return { hash: transactionHash };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(ctx, `operation=cdp_transfer status=failed error="${message}"`, error instanceof Error ? error : undefined);
    throw error;
  }
}

/**
 * Wait for transaction confirmation on-chain using viem.
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
  const { timeout, confirmations } = options;

  logger.info(
    ctx,
    `operation=wait_for_confirmation tx_hash=${txHash} timeout=${timeout} confirmations=${confirmations} status=started`
  );

  const network = getNetwork();
  const publicClient = getPublicClient(network);

  try {
    // Wait for transaction receipt with timeout
    const receipt = await Promise.race([
      publicClient.waitForTransactionReceipt({
        hash: txHash as `0x${string}`,
        confirmations,
      }),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error("Confirmation timeout")), timeout)
      ),
    ]);

    if (receipt && receipt.status === "success") {
      logger.info(
        ctx,
        `operation=wait_for_confirmation tx_hash=${txHash} block=${receipt.blockNumber} status=confirmed`
      );
      return true;
    }

    if (receipt && receipt.status === "reverted") {
      logger.error(ctx, `operation=wait_for_confirmation tx_hash=${txHash} status=reverted`);
      return false;
    }

    return false;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(ctx, `operation=wait_for_confirmation tx_hash=${txHash} status=failed error="${message}"`);
    return false;
  }
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

