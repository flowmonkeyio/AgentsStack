/**
 * Callback Service
 *
 * Handles callback notifications to AgentsStack platform.
 */

import type { AgentCallbackRequest, AgentUsage } from '../types/index.js';
import { logger } from '../lib/logger.js';
import { retryWithBackoff } from '../lib/utils.js';
import { CALLBACK_CONFIG } from '../agent/config.js';

/**
 * Callback service
 */
export class CallbackService {
  /**
   * Send callback notification
   */
  async sendCallback(
    callbackUrl: string,
    referenceId: string,
    status: 'completed' | 'failed',
    data: {
      output?: unknown;
      error?: string;
      usage: AgentUsage;
      processing_time_ms?: number;
    }
  ): Promise<void> {
    const request: AgentCallbackRequest = {
      reference_id: referenceId,
      status,
      output: data.output,
      error: data.error,
      usage: data.usage,
      processing_time_ms: data.processing_time_ms,
    };

    logger.info({ callbackUrl, referenceId, status }, 'Sending callback');

    try {
      await retryWithBackoff(
        () => this.makeCallbackRequest(callbackUrl, request),
        {
          maxAttempts: CALLBACK_CONFIG.retryAttempts,
          initialDelay: CALLBACK_CONFIG.retryDelay,
        }
      );

      logger.info({ callbackUrl, referenceId }, 'Callback sent successfully');
    } catch (error) {
      logger.error(
        {
          callbackUrl,
          referenceId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Callback failed after retries'
      );

      // Don't throw - callback failures shouldn't fail the task
    }
  }

  /**
   * Make HTTP callback request
   */
  private async makeCallbackRequest(
    url: string,
    request: AgentCallbackRequest
  ): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CALLBACK_CONFIG.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Callback HTTP error: ${response.status}`);
      }
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Callback request timed out');
        }
        throw error;
      }

      throw new Error('Unknown error sending callback');
    }
  }
}
