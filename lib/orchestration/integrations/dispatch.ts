/**
 * External Agent Dispatch Module
 *
 * Handles dispatching work to external agents and polling for results.
 * Supports both synchronous and asynchronous execution patterns.
 *
 * @see /docs/designs/orchestration/integrations/TECH_DESIGN.md
 */

import type { RequestContext } from "@/lib/logging";
import { createLogger } from "@/lib/logging";
import { nanoid } from "nanoid";
import type {
  ExternalAgentClient,
  AgentExecuteRequest,
} from "@/lib/external-agents";
import type { AgentCallbackRequest } from "./types";

const logger = createLogger("integrations");
import {
  isExecuteResponseSync,
  isExecuteResponseAsync,
  isStatusCompleted,
  isStatusFailed,
} from "@/lib/external-agents";
import type { DatabaseClient } from "@/lib/db/database-client";
import type { ExtendedDatabaseClient } from "@/lib/orchestration/work-lifecycle";
import type { IWorkLifecycle } from "@/lib/orchestration/work-lifecycle";
import type { WorkItem, LLMOperation, AgentUsage } from "@/types";
import type { DispatchResult, PollResult, IntegrationEvent } from "./types";
import { IntegrationError } from "./types";
import { verifyWebhookSignatureWithDetails } from "./security";

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Base URL for callback webhooks
 */
const BASE_URL = process.env.APP_URL ?? "http://localhost:3000";

/**
 * Polling configuration
 */
const POLLING_CONFIG = {
  INITIAL_INTERVAL_MS: 3000,
  MAX_INTERVAL_MS: 15000,
  TIMEOUT_MS: 600000, // 10 minutes
};

// =============================================================================
// OPERATION ID GENERATION
// =============================================================================

/**
 * Generates a unique operation ID for LLM operations.
 * Uses nanoid for URL-safe, unique identifiers.
 */
function generateOperationId(): string {
  return `op_${nanoid()}`;
}

// =============================================================================
// DISPATCH INTEGRATION
// =============================================================================

/**
 * Dependencies required for dispatch integration
 */
export interface DispatchDependencies {
  /** External agent client for HTTP calls */
  externalAgents: ExternalAgentClient;
  /** Database client for reading/updating work items */
  db: DatabaseClient & ExtendedDatabaseClient;
  /** Work lifecycle for state transitions */
  lifecycle: IWorkLifecycle;
  /** Event emitter function */
  emitEvent: (event: IntegrationEvent) => void;
}

/**
 * Dispatch work to an external agent.
 *
 * Flow:
 * 1. Fetch work item and agent
 * 2. Build execute request with callback URL
 * 3. Call external agent
 * 4. Handle sync response (immediate) or async response (polling)
 * 5. Store usage data for billing
 *
 * @param ctx - Request context for tracing
 * @param work_id - ID of the work item to dispatch
 * @param deps - Required dependencies
 * @returns Dispatch result (sync or async)
 */
export async function dispatchToAgent(
  ctx: RequestContext,
  work_id: string,
  deps: DispatchDependencies
): Promise<DispatchResult> {
  const { externalAgents, db, lifecycle, emitEvent } = deps;

  logger.debug(ctx, `operation=dispatch_start work_id=${work_id}`);

  // Fetch work item
  const work = await db.getWorkItem(ctx, work_id);
  if (!work) {
    logger.error(ctx, `operation=dispatch work_id=${work_id} error=work_not_found`);
    throw new IntegrationError(
      `Work item not found: ${work_id}`,
      "external_agents",
      false,
      { work_id }
    );
  }

  // Validate work has prompt and agent
  if (!work.prompt?.generated_prompt) {
    logger.error(ctx, `operation=dispatch work_id=${work_id} error=no_prompt status=${work.status}`);
    throw new IntegrationError(
      `Work item has no generated prompt`,
      "external_agents",
      false,
      { work_id, status: work.status }
    );
  }

  if (!work.agent) {
    logger.error(ctx, `operation=dispatch work_id=${work_id} error=no_agent`);
    throw new IntegrationError(
      `Work item has no agent assigned`,
      "external_agents",
      false,
      { work_id }
    );
  }

  // Build execute request
  const request: AgentExecuteRequest = {
    request_id: work_id,
    prompt: work.prompt.generated_prompt,
    requirements: work.action.requirements,
    callback_url: `${BASE_URL}/api/webhooks/work/${work_id}`,
  };

  // Add retry context if this is a retry
  if (work.retry_context) {
    request.adjustment = {
      is_retry: true,
      attempt: work.attempt,
      previous_output: work.retry_context.previous_output,
      issues: work.retry_context.verification_feedback.issues.map((i) => ({
        criterion: i.criterion,
        detail: i.detail,
      })),
      feedback: work.retry_context.verification_feedback.suggestions.join("\n"),
    };
  }

  logger.info(ctx, `operation=dispatch work_id=${work_id} agent_id=${work.agent.agent_id} is_retry=${!!work.retry_context}`);

  // Call external agent
  let response;
  try {
    response = await externalAgents.execute(work.agent.url, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error(ctx, `operation=dispatch_failed work_id=${work_id} agent_id=${work.agent.agent_id} reason=agent_error`, error instanceof Error ? error : undefined);
    throw new IntegrationError(
      `External agent execution failed: ${message}`,
      "external_agents",
      true,
      { work_id, agent_id: work.agent.agent_id, error: message }
    );
  }

  // Handle sync response
  if (isExecuteResponseSync(response)) {
    logger.info(ctx, `operation=dispatch work_id=${work_id} agent_id=${work.agent.agent_id} mode=sync`);

    // Transition to received state
    await lifecycle.transition(work_id, "sync_response", {
      output: {
        title: getOutputTitle(response.output),
        description: getOutputDescription(response.output),
        content: response.output,
      },
    });

    // Store external agent usage
    await storeExternalAgentUsage(ctx, work_id, response.usage, deps);

    emitEvent({
      type: "work:output_received",
      work_id,
      title: getOutputTitle(response.output),
      description: getOutputDescription(response.output),
      content: response.output,
    });

    return { type: "sync", output: response.output };
  }

  // Handle async response
  if (isExecuteResponseAsync(response)) {
    const callbackUrl = `${BASE_URL}/api/webhooks/work/${work_id}`;

    logger.info(ctx, `operation=dispatch work_id=${work_id} agent_id=${work.agent.agent_id} mode=async reference_id=${response.reference_id}`);

    await lifecycle.transition(work_id, "async_response", {
      reference_id: response.reference_id,
      status_url: response.status_url,
      callback_url: callbackUrl,
    });

    // Update polling configuration
    await db.updateWorkItemFields(ctx, work_id, {
      external_ref: {
        reference_id: response.reference_id,
        status_url: response.status_url,
        callback_url: callbackUrl,
        dispatched_at: new Date(),
        last_poll_at: null,
        next_poll_at: new Date(Date.now() + POLLING_CONFIG.INITIAL_INTERVAL_MS),
        polling: {
          initial_interval_ms: POLLING_CONFIG.INITIAL_INTERVAL_MS,
          current_interval_ms: POLLING_CONFIG.INITIAL_INTERVAL_MS,
          max_interval_ms: POLLING_CONFIG.MAX_INTERVAL_MS,
          backoff_multiplier: 1.5,
          poll_count: 0,
          timeout_at: new Date(Date.now() + POLLING_CONFIG.TIMEOUT_MS),
          timeout_ms: POLLING_CONFIG.TIMEOUT_MS,
        },
        last_response: null,
        last_error: null,
      },
    });

    return {
      type: "async",
      reference_id: response.reference_id,
      status_url: response.status_url,
    };
  }

  logger.error(ctx, `operation=dispatch work_id=${work_id} error=unexpected_response`);
  throw new IntegrationError(
    `Unexpected response status from agent`,
    "external_agents",
    false,
    { work_id, response }
  );
}

// =============================================================================
// POLLING
// =============================================================================

/**
 * Poll an external agent for task completion.
 *
 * @param ctx - Request context for tracing
 * @param work_id - ID of the work item to poll
 * @param deps - Required dependencies
 * @returns Poll result
 */
export async function pollAgent(
  ctx: RequestContext,
  work_id: string,
  deps: DispatchDependencies
): Promise<PollResult> {
  const { externalAgents, db, lifecycle, emitEvent } = deps;

  logger.debug(ctx, `operation=poll_agent_start work_id=${work_id}`);

  // Fetch work item
  const work = await db.getWorkItem(ctx, work_id);
  if (!work) {
    logger.error(ctx, `operation=poll_agent work_id=${work_id} error=work_not_found`);
    return { status: "failed", error: "Work item not found" };
  }

  // Validate external ref exists
  if (!work.external_ref) {
    logger.error(ctx, `operation=poll_agent work_id=${work_id} error=no_external_ref`);
    return { status: "failed", error: "No external reference" };
  }

  // Check timeout
  if (new Date() > work.external_ref.polling.timeout_at) {
    logger.warn(ctx, `operation=poll_agent work_id=${work_id} status=timeout`);
    await lifecycle.transition(work_id, "poll_timeout");
    return { status: "failed", error: "Polling timeout" };
  }

  // Poll external agent
  let response;
  try {
    response = await externalAgents.checkStatus(work.external_ref.status_url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.warn(ctx, `operation=poll_agent work_id=${work_id} status=poll_error error=${message}`);
    // Update last error but don't fail yet - could be transient
    await db.updateWorkItemFields(ctx, work_id, {
      external_ref: {
        ...work.external_ref,
        last_poll_at: new Date(),
        last_error: message,
      },
    });
    return { status: "pending", error: message };
  }

  // Handle completed
  if (isStatusCompleted(response)) {
    logger.info(ctx, `operation=poll_agent work_id=${work_id} status=completed`);

    await lifecycle.transition(work_id, "poll_completed", {
      output: {
        title: getOutputTitle(response.output),
        description: getOutputDescription(response.output),
        content: response.output,
      },
    });

    // Store usage
    await storeExternalAgentUsage(ctx, work_id, response.usage, deps);

    emitEvent({
      type: "work:output_received",
      work_id,
      title: getOutputTitle(response.output),
      description: getOutputDescription(response.output),
      content: response.output,
    });

    return { status: "completed", output: response.output };
  }

  // Handle failed
  if (isStatusFailed(response)) {
    logger.warn(ctx, `operation=poll_agent work_id=${work_id} status=failed error=${response.error}`);

    await db.updateWorkItemFields(ctx, work_id, {
      external_ref: {
        ...work.external_ref,
        last_poll_at: new Date(),
        last_error: response.error,
      },
    });

    // Transition based on retryability
    // For now, just mark the poll as failed
    return { status: "failed", error: response.error };
  }

  // Still pending - update next poll time
  logger.debug(ctx, `operation=poll_agent work_id=${work_id} status=pending progress=${response.progress ?? 0}`);
  await updateNextPollTime(ctx, work_id, work, deps.db);
  return { status: "pending", progress: response.progress };
}

// =============================================================================
// ADAPTIVE POLLING
// =============================================================================

/**
 * Calculate the next polling interval based on elapsed time.
 * Uses adaptive backoff to reduce load on agent servers.
 *
 * @param work - Work item with polling config
 * @returns Next interval in milliseconds
 */
export function calculateNextPollInterval(work: WorkItem): number {
  if (!work.external_ref?.polling) {
    return POLLING_CONFIG.INITIAL_INTERVAL_MS;
  }

  const polling = work.external_ref.polling;
  const startTime = work.external_ref.dispatched_at;
  const elapsed = Date.now() - new Date(startTime).getTime();

  // Adaptive intervals based on elapsed time
  if (elapsed < 30000) return 3000; // First 30s: every 3s
  if (elapsed < 120000) return 5000; // 30s-2min: every 5s
  if (elapsed < 300000) return 10000; // 2-5min: every 10s
  return 15000; // 5-10min: every 15s
}

/**
 * Update the next poll time for a work item.
 *
 * @param ctx - Request context for tracing
 * @param work_id - Work item ID
 * @param work - Current work item
 * @param db - Database client
 */
async function updateNextPollTime(
  ctx: RequestContext,
  work_id: string,
  work: WorkItem,
  db: ExtendedDatabaseClient
): Promise<void> {
  if (!work.external_ref) return;

  const nextInterval = calculateNextPollInterval(work);

  await db.updateWorkItemFields(ctx, work_id, {
    external_ref: {
      ...work.external_ref,
      last_poll_at: new Date(),
      next_poll_at: new Date(Date.now() + nextInterval),
      polling: {
        ...work.external_ref.polling,
        current_interval_ms: nextInterval,
        poll_count: work.external_ref.polling.poll_count + 1,
      },
    },
  });
}

// =============================================================================
// WEBHOOK CALLBACK HANDLER
// =============================================================================

/**
 * Handle callback from external agent when async task completes.
 *
 * @param ctx - Request context for tracing
 * @param work_id - Work item ID from URL
 * @param body - Parsed request body
 * @param rawBody - Raw request body for signature verification
 * @param signatureHeader - X-Webhook-Signature header value
 * @param deps - Required dependencies
 */
export async function handleAgentCallback(
  ctx: RequestContext,
  work_id: string,
  body: AgentCallbackRequest,
  rawBody: string,
  signatureHeader: string | undefined,
  deps: DispatchDependencies
): Promise<void> {
  const { db, lifecycle, emitEvent } = deps;

  logger.debug(ctx, `operation=webhook_received work_id=${work_id} status=${body.status}`);

  // Fetch work item
  const work = await db.getWorkItem(ctx, work_id);
  if (!work) {
    logger.error(ctx, `operation=webhook_received work_id=${work_id} error=work_not_found`);
    throw new IntegrationError(
      "Work item not found",
      "external_agents",
      false,
      { work_id }
    );
  }

  // Fetch agent for webhook secret
  if (!work.agent) {
    logger.error(ctx, `operation=webhook_received work_id=${work_id} error=no_agent`);
    throw new IntegrationError(
      "Work item has no agent",
      "external_agents",
      false,
      { work_id }
    );
  }

  const agent = await db.getAgent(ctx, work.agent.agent_id);

  // Verify signature
  const isProduction = process.env.NODE_ENV === "production";
  // Note: Agent interface doesn't have webhook_secret yet - this is a placeholder
  const webhookSecret = (agent as { webhook_secret?: string })?.webhook_secret;

  const verification = verifyWebhookSignatureWithDetails(
    rawBody,
    signatureHeader,
    webhookSecret,
    isProduction
  );

  if (!verification.valid) {
    logger.error(ctx, `operation=webhook_received work_id=${work_id} error=invalid_signature reason=${verification.error}`);
    throw new IntegrationError(
      verification.error ?? "Invalid webhook signature",
      "external_agents",
      false,
      { work_id }
    );
  }

  // Validate reference_id
  if (work.external_ref?.reference_id !== body.reference_id) {
    logger.error(ctx, `operation=webhook_received work_id=${work_id} error=invalid_reference_id expected=${work.external_ref?.reference_id} received=${body.reference_id}`);
    throw new IntegrationError(
      "Invalid reference_id",
      "external_agents",
      false,
      { work_id, expected: work.external_ref?.reference_id, received: body.reference_id }
    );
  }

  // Handle completed
  if (body.status === "completed" && body.output) {
    logger.info(ctx, `operation=webhook_completed work_id=${work_id} agent_id=${work.agent.agent_id}`);

    await lifecycle.transition(work_id, "poll_completed", {
      output: {
        title: body.output.title,
        description: body.output.description,
        content: body.output.content,
      },
    });

    // Store usage
    await storeExternalAgentUsage(ctx, work_id, body.usage, deps);

    emitEvent({
      type: "work:output_received",
      work_id,
      title: body.output.title,
      description: body.output.description,
      content: body.output.content,
    });
    return;
  }

  // Handle failed
  if (body.status === "failed") {
    logger.warn(ctx, `operation=webhook_failed work_id=${work_id} error=${body.error ?? "Unknown error"}`);

    await db.updateWorkItemFields(ctx, work_id, {
      external_ref: work.external_ref
        ? {
            ...work.external_ref,
            last_error: body.error ?? "Unknown error",
          }
        : null,
    });

    // Store partial usage if reported
    if (body.usage) {
      await storeExternalAgentUsage(ctx, work_id, body.usage, deps);
    }
    return;
  }

  // Handle progress update
  if (body.status === "progress" && work.external_ref) {
    logger.debug(ctx, `operation=webhook_progress work_id=${work_id} progress=${body.progress ?? 0}`);

    await db.updateWorkItemFields(ctx, work_id, {
      external_ref: {
        ...work.external_ref,
        last_response: { progress: body.progress },
      },
    });
  }
}

// =============================================================================
// USAGE STORAGE
// =============================================================================

/**
 * Store external agent usage data for billing and auditing.
 * Transforms ModelUsage to LLMOperation format.
 *
 * @param ctx - Request context for tracing
 * @param work_id - Work item ID
 * @param usage - Usage data from agent
 * @param deps - Required dependencies
 */
async function storeExternalAgentUsage(
  ctx: RequestContext,
  work_id: string,
  usage: AgentUsage,
  deps: DispatchDependencies
): Promise<void> {
  const { db, emitEvent } = deps;

  logger.debug(ctx, `operation=store_usage work_id=${work_id} total_cost=${usage.total_cost}`);

  const work = await db.getWorkItem(ctx, work_id);
  if (!work) return;

  const job_id = work.job_id;
  const agent_id = work.agent?.agent_id ?? "unknown";

  // Transform ModelUsage[] to LLMOperation[] if breakdown provided
  const operations: LLMOperation[] =
    usage.model_usage?.map((mu) => ({
      operation_id: generateOperationId(),
      timestamp: new Date(),
      operation_type: "external_agent" as const,
      model: mu.model,
      native_tokens_prompt: mu.native_tokens_prompt,
      native_tokens_completion: mu.native_tokens_completion,
      total_cost: mu.total_cost,
      metadata: {
        work_id,
        agent_id,
        source: "external_agent_response",
      },
    })) ?? [];

  // If no breakdown, create a single operation with total cost
  if (operations.length === 0 && usage.total_cost > 0) {
    operations.push({
      operation_id: generateOperationId(),
      timestamp: new Date(),
      operation_type: "external_agent" as const,
      model: "unknown",
      total_cost: usage.total_cost,
      metadata: {
        work_id,
        agent_id,
        source: "external_agent_response",
        note: "Agent returned total_cost without model breakdown",
      },
    });
  }

  // Update work item with external usage
  // Note: Using updateWorkItemFields since that's what's available
  // The actual token_usage update would need to be done via a specialized method
  // For now, we'll emit an event and let the caller handle storage

  emitEvent({
    type: "work:usage_recorded",
    work_id,
    agent_id,
    total_cost: usage.total_cost,
    has_breakdown: (usage.model_usage?.length ?? 0) > 0,
  });

  // Note: Full implementation would update work_items and jobs collections
  // with the operations array. This requires extended database methods.
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Extract a title from agent output.
 * Handles various output formats.
 */
function getOutputTitle(output: unknown): string {
  if (!output || typeof output !== "object") {
    return "Output";
  }

  const obj = output as Record<string, unknown>;

  if (typeof obj.title === "string") {
    return obj.title;
  }

  if (typeof obj.name === "string") {
    return obj.name;
  }

  return "Output";
}

/**
 * Extract a description from agent output.
 */
function getOutputDescription(output: unknown): string {
  if (!output || typeof output !== "object") {
    return "Work output";
  }

  const obj = output as Record<string, unknown>;

  if (typeof obj.description === "string") {
    return obj.description;
  }

  if (typeof obj.summary === "string") {
    return obj.summary;
  }

  return "Work output";
}
