/**
 * Image Generator
 *
 * Core business logic for image generation using OpenRouter.
 */

import { OpenRouterClient } from '../lib/openrouter.js';
import { PromptOptimizer } from './prompt-optimizer.js';
import { CostTracker } from './cost-tracker.js';
import type { ImageGenerationOptions } from '../types/index.js';
import { logger } from '../lib/logger.js';
import { OPENROUTER_CONFIG } from './config.js';

/**
 * Image generation result
 */
export interface ImageGenerationResult {
  image_url: string;
  width: number;
  height: number;
  format: string;
  model_used: string;
  cost_usd: number;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/**
 * Image generator
 */
export class ImageGenerator {
  private openrouter: OpenRouterClient;
  private promptOptimizer: PromptOptimizer;

  constructor() {
    this.openrouter = new OpenRouterClient(OPENROUTER_CONFIG);
    this.promptOptimizer = new PromptOptimizer();
  }

  /**
   * Generate an image from a prompt
   */
  async generateImage(
    prompt: string,
    options?: ImageGenerationOptions
  ): Promise<ImageGenerationResult> {
    logger.info({ prompt, options }, 'Starting image generation');

    const startTime = Date.now();

    try {
      // Optimize prompt
      const optimizedPrompt = await this.promptOptimizer.optimize(prompt);

      // Generate image via OpenRouter
      const result = await this.openrouter.generateImage(optimizedPrompt, {
        ...options,
        allowFallbacks: true,
      });

      const duration = Date.now() - startTime;

      logger.info(
        {
          duration,
          model: result.model_used,
          cost: result.cost_usd,
        },
        'Image generation completed'
      );

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error(
        {
          duration,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Image generation failed'
      );

      throw error;
    }
  }

  /**
   * Generate image with cost tracking
   */
  async generateImageWithTracking(
    prompt: string,
    costTracker: CostTracker,
    options?: ImageGenerationOptions
  ): Promise<ImageGenerationResult> {
    const result = await this.generateImage(prompt, options);

    // Record usage in cost tracker
    costTracker.recordUsage({
      model: result.model_used,
      prompt_tokens: result.usage?.prompt_tokens,
      completion_tokens: result.usage?.completion_tokens,
      total_tokens: result.usage?.total_tokens,
      cost: result.cost_usd,
    });

    return result;
  }
}
