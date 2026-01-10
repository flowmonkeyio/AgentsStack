/**
 * Cost Tracker
 *
 * Tracks and aggregates usage and costs for tasks.
 */

import type { AgentUsage, ModelUsage } from '../types/index.js';
import { logger } from '../lib/logger.js';

/**
 * Usage record
 */
interface UsageRecord {
  model: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost: number;
}

/**
 * Cost tracker
 */
export class CostTracker {
  private records: UsageRecord[] = [];

  /**
   * Record usage for a model call
   */
  recordUsage(usage: UsageRecord): void {
    this.records.push(usage);
    logger.debug({ usage }, 'Recorded usage');
  }

  /**
   * Get total cost
   */
  getTotalCost(): number {
    return this.records.reduce((sum, record) => sum + record.cost, 0);
  }

  /**
   * Get AgentUsage format for AgentsStack
   */
  getAgentUsage(): AgentUsage {
    const totalCost = this.getTotalCost();

    // Build per-model breakdown
    const modelUsage: ModelUsage[] = this.records.map((record) => ({
      model: record.model,
      native_tokens_prompt: record.prompt_tokens,
      native_tokens_completion: record.completion_tokens,
      total_cost: record.cost,
    }));

    return {
      total_cost: totalCost,
      model_usage: modelUsage.length > 0 ? modelUsage : undefined,
    };
  }

  /**
   * Reset tracker
   */
  reset(): void {
    this.records = [];
  }

  /**
   * Get usage summary
   */
  getSummary(): {
    total_cost: number;
    total_models: number;
    total_tokens: number;
  } {
    return {
      total_cost: this.getTotalCost(),
      total_models: this.records.length,
      total_tokens: this.records.reduce(
        (sum, record) => sum + (record.total_tokens ?? 0),
        0
      ),
    };
  }
}
