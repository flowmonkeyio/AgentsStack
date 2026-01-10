/**
 * External Agent Client
 *
 * Platform-side client for communicating with external agents.
 * Handles both synchronous and asynchronous execution patterns.
 *
 * @see /docs/designs/external-agents/TECH_DESIGN.md
 */

import { RequestContext, createLogger } from '@/lib/logging';
import type {
  AgentExecuteRequest,
  AgentExecuteResponse,
  AgentExecuteResponseSync,
  AgentExecuteResponseAsync,
  AgentStatusResponse,
  AgentStatusResponseCompleted,
  AgentStatusResponseProgress,
} from './types';
import {
  isExecuteResponseSync,
  isExecuteResponseAsync,
  isStatusCompleted,
  isStatusFailed,
} from './types';

const logger = createLogger('external-agents');

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface PollingConfig {
  initialIntervalMs?: number;    // Default: 3000
  maxIntervalMs?: number;        // Default: 15000
  backoffMultiplier?: number;    // Default: 1.5
  timeoutMs?: number;            // Default: 600000 (10 min)
}

export interface ExternalAgentClientConfig {
  /** Default timeout for sync requests in ms (default: 60000) */
  defaultTimeout?: number;

  /** Polling configuration for async requests */
  polling?: PollingConfig;
}

/** Resolved config with all values guaranteed */
interface ResolvedConfig {
  defaultTimeout: number;
  polling: Required<PollingConfig>;
}

const DEFAULT_CONFIG: ResolvedConfig = {
  defaultTimeout: 60000,
  polling: {
    initialIntervalMs: 3000,
    maxIntervalMs: 15000,
    backoffMultiplier: 1.5,
    timeoutMs: 600000,
  },
};

// =============================================================================
// CLIENT IMPLEMENTATION
// =============================================================================

/**
 * Client for executing tasks on external agents.
 *
 * Usage:
 * ```typescript
 * const client = new ExternalAgentClient();
 *
 * // Sync execution
 * const response = await client.execute(agent.url, {
 *   request_id: 'req_123',
 *   prompt: 'Write 3 headlines...',
 *   requirements: ['Under 10 words'],
 * });
 *
 * // Check async status
 * const status = await client.checkStatus(statusUrl);
 * ```
 */
export class ExternalAgentClient {
  private config: ResolvedConfig;

  constructor(config: ExternalAgentClientConfig = {}) {
    this.config = {
      defaultTimeout: config.defaultTimeout ?? DEFAULT_CONFIG.defaultTimeout,
      polling: {
        ...DEFAULT_CONFIG.polling,
        ...config.polling,
      },
    };
  }

  /**
   * Execute a task on an external agent.
   * Returns either a sync response (completed) or async response (accepted).
   */
  async execute(
    ctx: RequestContext,
    agentUrl: string,
    request: AgentExecuteRequest,
    options?: { timeout?: number }
  ): Promise<AgentExecuteResponse> {
    const timeout = options?.timeout ?? this.config.defaultTimeout;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const startTime = Date.now();

    logger.info(ctx, `operation=execute agent_url=${agentUrl} request_id=${request.request_id} mode=pending`);

    try {
      const response = await fetch(`${agentUrl}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        const error = new ExternalAgentError(
          `Agent returned status ${response.status}: ${errorText}`,
          'AGENT_HTTP_ERROR',
          true
        );
        logger.error(ctx, `operation=execute_failed agent_url=${agentUrl} request_id=${request.request_id} error_code=AGENT_HTTP_ERROR`, error);
        throw error;
      }

      const data: AgentExecuteResponse = await response.json();

      // Validate response structure
      if (!data.status) {
        const error = new ExternalAgentError(
          'Invalid agent response: missing status field',
          'INVALID_RESPONSE',
          false
        );
        logger.error(ctx, `operation=execute_failed agent_url=${agentUrl} request_id=${request.request_id} error_code=INVALID_RESPONSE`, error);
        throw error;
      }

      const durationMs = Date.now() - startTime;
      logger.debug(ctx, `operation=execute_complete agent_url=${agentUrl} request_id=${request.request_id} status=${data.status} duration_ms=${durationMs}`);

      return data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ExternalAgentError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        const timeoutError = new ExternalAgentError(
          `Execution timed out after ${timeout}ms`,
          'TIMEOUT',
          true
        );
        logger.error(ctx, `operation=execute_failed agent_url=${agentUrl} request_id=${request.request_id} error_code=TIMEOUT`, timeoutError);
        throw timeoutError;
      }

      const unknownError = new ExternalAgentError(
        error instanceof Error ? error.message : 'Unknown execution error',
        'UNKNOWN_ERROR',
        true
      );
      logger.error(ctx, `operation=execute_failed agent_url=${agentUrl} request_id=${request.request_id} error_code=UNKNOWN_ERROR`, unknownError);
      throw unknownError;
    }
  }

  /**
   * Check status of an async task.
   */
  async checkStatus(ctx: RequestContext, statusUrl: string): Promise<AgentStatusResponse> {
    logger.debug(ctx, `operation=check_status status_url=${statusUrl}`);

    try {
      const response = await fetch(statusUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        const error = new ExternalAgentError(
          `Status check returned ${response.status}: ${errorText}`,
          'STATUS_HTTP_ERROR',
          true
        );
        logger.error(ctx, `operation=check_status_failed status_url=${statusUrl} error_code=STATUS_HTTP_ERROR`, error);
        throw error;
      }

      const data: AgentStatusResponse = await response.json();

      if (!data.status) {
        const error = new ExternalAgentError(
          'Invalid status response: missing status field',
          'INVALID_RESPONSE',
          false
        );
        logger.error(ctx, `operation=check_status_failed status_url=${statusUrl} error_code=INVALID_RESPONSE`, error);
        throw error;
      }

      logger.debug(ctx, `operation=check_status_complete status_url=${statusUrl} status=${data.status}`);

      return data;
    } catch (error) {
      if (error instanceof ExternalAgentError) {
        throw error;
      }

      const unknownError = new ExternalAgentError(
        error instanceof Error ? error.message : 'Unknown status check error',
        'UNKNOWN_ERROR',
        true
      );
      logger.error(ctx, `operation=check_status_failed status_url=${statusUrl} error_code=UNKNOWN_ERROR`, unknownError);
      throw unknownError;
    }
  }

  /**
   * Execute and wait for completion (handles async polling automatically).
   *
   * For sync agents: returns immediately after response.
   * For async agents: polls until completion or timeout.
   */
  async executeAndWait(
    ctx: RequestContext,
    agentUrl: string,
    request: AgentExecuteRequest,
    options?: {
      timeout?: number;
      onProgress?: (progress: AgentStatusResponseProgress) => void;
    }
  ): Promise<AgentExecuteResponseSync | AgentStatusResponseCompleted> {
    logger.info(ctx, `operation=execute_and_wait agent_url=${agentUrl} request_id=${request.request_id}`);

    const response = await this.execute(ctx, agentUrl, request, options);

    // Sync response - return immediately
    if (isExecuteResponseSync(response)) {
      logger.debug(ctx, `operation=execute_and_wait_complete agent_url=${agentUrl} request_id=${request.request_id} mode=sync`);
      return response;
    }

    // Async response - poll until completion
    if (isExecuteResponseAsync(response)) {
      logger.info(ctx, `operation=execute_and_wait agent_url=${agentUrl} request_id=${request.request_id} mode=async reference_id=${response.reference_id}`);
      return this.pollUntilComplete(ctx, response.status_url, options?.onProgress);
    }

    const error = new ExternalAgentError(
      `Unexpected response status: ${(response as { status: string }).status}`,
      'INVALID_RESPONSE',
      false
    );
    logger.error(ctx, `operation=execute_and_wait_failed agent_url=${agentUrl} request_id=${request.request_id} error_code=INVALID_RESPONSE`, error);
    throw error;
  }

  /**
   * Poll status endpoint until task completes or fails.
   */
  private async pollUntilComplete(
    ctx: RequestContext,
    statusUrl: string,
    onProgress?: (progress: AgentStatusResponseProgress) => void
  ): Promise<AgentStatusResponseCompleted> {
    const { initialIntervalMs, maxIntervalMs, backoffMultiplier, timeoutMs } = this.config.polling;

    const startTime = Date.now();
    let currentInterval = initialIntervalMs;
    let pollCount = 0;

    logger.info(ctx, `operation=poll_start status_url=${statusUrl} timeout_ms=${timeoutMs}`);

    while (Date.now() - startTime < timeoutMs) {
      // Wait before polling (except first poll)
      if (pollCount > 0) {
        await this.sleep(currentInterval);
        currentInterval = Math.min(
          currentInterval * backoffMultiplier,
          maxIntervalMs
        );
      }
      pollCount++;

      const status = await this.checkStatus(ctx, statusUrl);

      logger.info(ctx, `operation=poll status_url=${statusUrl} poll_count=${pollCount} status=${status.status}`);

      if (isStatusCompleted(status)) {
        const durationMs = Date.now() - startTime;
        logger.debug(ctx, `operation=poll_complete status_url=${statusUrl} poll_count=${pollCount} duration_ms=${durationMs}`);
        return status;
      }

      if (isStatusFailed(status)) {
        const error = new ExternalAgentError(
          status.error,
          'AGENT_EXECUTION_FAILED',
          status.retryable
        );
        logger.error(ctx, `operation=poll_failed status_url=${statusUrl} poll_count=${pollCount} error_code=AGENT_EXECUTION_FAILED`, error);
        throw error;
      }

      // Still processing - notify progress callback
      if (onProgress) {
        onProgress(status as AgentStatusResponseProgress);
      }
    }

    const error = new ExternalAgentError(
      `Polling timed out after ${timeoutMs}ms (${pollCount} polls)`,
      'POLLING_TIMEOUT',
      true
    );
    logger.error(ctx, `operation=poll_failed status_url=${statusUrl} poll_count=${pollCount} error_code=POLLING_TIMEOUT`, error);
    throw error;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// =============================================================================
// ERROR TYPES
// =============================================================================

export type ExternalAgentErrorCode =
  | 'AGENT_HTTP_ERROR'
  | 'STATUS_HTTP_ERROR'
  | 'INVALID_RESPONSE'
  | 'TIMEOUT'
  | 'POLLING_TIMEOUT'
  | 'AGENT_EXECUTION_FAILED'
  | 'UNKNOWN_ERROR';

/**
 * Error thrown by ExternalAgentClient.
 */
export class ExternalAgentError extends Error {
  constructor(
    message: string,
    public readonly code: ExternalAgentErrorCode,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'ExternalAgentError';
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a new ExternalAgentClient with default configuration.
 */
export function createExternalAgentClient(
  ctx: RequestContext,
  config?: ExternalAgentClientConfig
): ExternalAgentClient {
  logger.debug(ctx, `operation=create_client config_timeout=${config?.defaultTimeout ?? 'default'}`);
  return new ExternalAgentClient(config);
}
