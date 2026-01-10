/**
 * External Agent Client
 *
 * Platform-side client for communicating with external agents.
 * Handles both synchronous and asynchronous execution patterns.
 *
 * @see /docs/designs/external-agents/TECH_DESIGN.md
 */

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

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface ExternalAgentClientConfig {
  /** Default timeout for sync requests in ms (default: 60000) */
  defaultTimeout?: number;

  /** Polling configuration for async requests */
  polling?: {
    initialIntervalMs?: number;    // Default: 3000
    maxIntervalMs?: number;        // Default: 15000
    backoffMultiplier?: number;    // Default: 1.5
    timeoutMs?: number;            // Default: 600000 (10 min)
  };
}

const DEFAULT_CONFIG: Required<ExternalAgentClientConfig> = {
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
  private config: Required<ExternalAgentClientConfig>;

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
    agentUrl: string,
    request: AgentExecuteRequest,
    options?: { timeout?: number }
  ): Promise<AgentExecuteResponse> {
    const timeout = options?.timeout ?? this.config.defaultTimeout;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

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
        throw new ExternalAgentError(
          `Agent returned status ${response.status}: ${errorText}`,
          'AGENT_HTTP_ERROR',
          true
        );
      }

      const data: AgentExecuteResponse = await response.json();

      // Validate response structure
      if (!data.status) {
        throw new ExternalAgentError(
          'Invalid agent response: missing status field',
          'INVALID_RESPONSE',
          false
        );
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ExternalAgentError) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new ExternalAgentError(
          `Execution timed out after ${timeout}ms`,
          'TIMEOUT',
          true
        );
      }

      throw new ExternalAgentError(
        error instanceof Error ? error.message : 'Unknown execution error',
        'UNKNOWN_ERROR',
        true
      );
    }
  }

  /**
   * Check status of an async task.
   */
  async checkStatus(statusUrl: string): Promise<AgentStatusResponse> {
    try {
      const response = await fetch(statusUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new ExternalAgentError(
          `Status check returned ${response.status}: ${errorText}`,
          'STATUS_HTTP_ERROR',
          true
        );
      }

      const data: AgentStatusResponse = await response.json();

      if (!data.status) {
        throw new ExternalAgentError(
          'Invalid status response: missing status field',
          'INVALID_RESPONSE',
          false
        );
      }

      return data;
    } catch (error) {
      if (error instanceof ExternalAgentError) {
        throw error;
      }

      throw new ExternalAgentError(
        error instanceof Error ? error.message : 'Unknown status check error',
        'UNKNOWN_ERROR',
        true
      );
    }
  }

  /**
   * Execute and wait for completion (handles async polling automatically).
   *
   * For sync agents: returns immediately after response.
   * For async agents: polls until completion or timeout.
   */
  async executeAndWait(
    agentUrl: string,
    request: AgentExecuteRequest,
    options?: {
      timeout?: number;
      onProgress?: (progress: AgentStatusResponseProgress) => void;
    }
  ): Promise<AgentExecuteResponseSync | AgentStatusResponseCompleted> {
    const response = await this.execute(agentUrl, request, options);

    // Sync response - return immediately
    if (isExecuteResponseSync(response)) {
      return response;
    }

    // Async response - poll until completion
    if (isExecuteResponseAsync(response)) {
      return this.pollUntilComplete(response.status_url, options?.onProgress);
    }

    throw new ExternalAgentError(
      `Unexpected response status: ${(response as { status: string }).status}`,
      'INVALID_RESPONSE',
      false
    );
  }

  /**
   * Poll status endpoint until task completes or fails.
   */
  private async pollUntilComplete(
    statusUrl: string,
    onProgress?: (progress: AgentStatusResponseProgress) => void
  ): Promise<AgentStatusResponseCompleted> {
    const { initialIntervalMs, maxIntervalMs, backoffMultiplier, timeoutMs } =
      this.config.polling;

    const startTime = Date.now();
    let currentInterval = initialIntervalMs;
    let pollCount = 0;

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

      const status = await this.checkStatus(statusUrl);

      if (isStatusCompleted(status)) {
        return status;
      }

      if (isStatusFailed(status)) {
        throw new ExternalAgentError(
          status.error,
          'AGENT_EXECUTION_FAILED',
          status.retryable
        );
      }

      // Still processing - notify progress callback
      if (onProgress) {
        onProgress(status as AgentStatusResponseProgress);
      }
    }

    throw new ExternalAgentError(
      `Polling timed out after ${timeoutMs}ms (${pollCount} polls)`,
      'POLLING_TIMEOUT',
      true
    );
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
  config?: ExternalAgentClientConfig
): ExternalAgentClient {
  return new ExternalAgentClient(config);
}
