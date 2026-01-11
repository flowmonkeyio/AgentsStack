/**
 * Video Generator
 *
 * Core business logic for video generation using OpenAI Sora 2
 */

import { OpenAISoraClient } from '../lib/openai-sora2.js';
import type { VideoGenerationOptions, VideoGenerationResult } from '../types/index.js';
import { logger } from '../lib/logger.js';
import { OPENAI_CONFIG, COST_CONFIG } from './config.js';

export class VideoGenerator {
  private soraClient: OpenAISoraClient;

  constructor() {
    this.soraClient = new OpenAISoraClient(OPENAI_CONFIG);
  }

  /**
   * Generate a video from a prompt
   */
  async generateVideo(
    prompt: string,
    options?: VideoGenerationOptions
  ): Promise<VideoGenerationResult> {
    logger.info({ prompt, options }, 'Starting video generation');

    const startTime = Date.now();

    try {
      // Validate duration
      const duration = Math.min(
        options?.duration || 5,
        OPENAI_CONFIG.maxDuration
      );

      // Generate the video
      const result = await this.soraClient.generateVideo(prompt, {
        prompt,
        ...options,
        duration,
      });

      const generationTime = Date.now() - startTime;

      logger.info(
        {
          duration: result.duration,
          cost: result.cost_usd,
          generationTime,
        },
        'Video generation completed'
      );

      return result;
    } catch (error) {
      logger.error({ error, prompt }, 'Video generation failed');
      throw error;
    }
  }

  /**
   * Estimate cost for a video generation request
   */
  estimateCost(options?: VideoGenerationOptions): number {
    const duration = Math.min(
      options?.duration || 5,
      OPENAI_CONFIG.maxDuration
    );
    return COST_CONFIG.costPerSecond * duration;
  }

  /**
   * Estimate time to complete (in milliseconds)
   */
  estimateTime(options?: VideoGenerationOptions): number {
    const duration = options?.duration || 5;
    // Rough estimate: ~30 seconds per second of video
    return duration * 30 * 1000;
  }
}
