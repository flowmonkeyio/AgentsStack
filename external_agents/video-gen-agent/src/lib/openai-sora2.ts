/**
 * OpenAI Sora 2 Client
 *
 * Wrapper for OpenAI Sora 2 video generation API
 */

import OpenAI from 'openai';
import type { VideoGenerationOptions, VideoGenerationResult } from '../types/index.js';
import { logger } from './logger.js';
import { sleep } from './utils.js';

export interface SoraVideoJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  video_url?: string;
  error?: string;
  progress?: number;
}

export class OpenAISoraClient {
  private client: OpenAI;
  private model: string;
  private timeout: number;
  private pollingInterval: number = 5000; // 5 seconds

  constructor(config: { apiKey: string; model: string; timeout: number }) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
    });
    this.model = config.model;
    this.timeout = config.timeout;
  }

  /**
   * Generate a video using OpenAI Sora 2
   */
  async generateVideo(
    prompt: string,
    options?: VideoGenerationOptions
  ): Promise<VideoGenerationResult> {
    logger.info({ prompt, options }, 'Starting Sora 2 video generation');

    try {
      // Validate and normalize duration to allowed values (4, 8, or 12 seconds)
      const duration = this.normalizeDuration(options?.duration || 5);

      // Create video generation job
      const job = await this.createVideoJob(prompt, {
        prompt,
        ...options,
        duration,
      });

      logger.info({ jobId: job.id }, 'Video generation job created');

      // Poll for completion
      const completedJob = await this.pollJobStatus(job.id);

      if (completedJob.status === 'failed') {
        throw new Error(completedJob.error || 'Video generation failed');
      }

      if (!completedJob.video_url) {
        throw new Error('Video generation completed but no URL returned');
      }

      // Calculate dimensions based on aspect ratio
      const { width, height } = this.getWidthFromAspectRatio(
        options?.aspect_ratio || '16:9',
        options?.resolution || '1080p'
      );

      // Calculate cost
      const cost_usd = this.calculateCost(duration, this.model);

      return {
        video_url: completedJob.video_url,
        duration,
        width,
        height,
        format: 'mp4',
        model_used: this.model,
        cost_usd,
      };
    } catch (error) {
      logger.error({ error, prompt }, 'Sora 2 video generation failed');
      throw error;
    }
  }

  /**
   * Create a video generation job
   */
  private async createVideoJob(
    prompt: string,
    options: VideoGenerationOptions
  ): Promise<SoraVideoJob> {
    try {
      // Call OpenAI Sora 2 API to create video generation job
      // Using the videos endpoint via fetch since OpenAI SDK doesn't expose this yet
      const response = await fetch('https://api.openai.com/v1/videos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.client.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          prompt: options.prompt,
          duration: options.duration,
          aspect_ratio: options.aspect_ratio || '16:9',
          resolution: options.resolution || '1080p',
        }),
      });

      if (!response.ok) {
        if (response.status === 404) {
          logger.warn('Sora 2 API endpoint not available');
          throw new Error(
            'OpenAI Sora 2 API is not yet publicly available. ' +
            'This is a placeholder implementation. ' +
            'When the API becomes available, this will make actual API calls.'
          );
        }
        const errorData = await response.json().catch(() => ({})) as any;
        throw new Error(errorData.error?.message || `API request failed with status ${response.status}`);
      }

      const data = await response.json() as any;

      return {
        id: data.id,
        status: data.status || 'pending',
        progress: 0,
      };
    } catch (error: any) {
      if (error?.message?.includes('not yet publicly available')) {
        throw error;
      }
      logger.error({ error }, 'Failed to create video job');
      throw error;
    }
  }

  /**
   * Poll job status until completion
   */
  private async pollJobStatus(jobId: string): Promise<SoraVideoJob> {
    const startTime = Date.now();

    while (true) {
      // Check timeout
      if (Date.now() - startTime > this.timeout) {
        throw new Error(`Video generation timed out after ${this.timeout}ms`);
      }

      try {
        // Get job status via fetch
        const response = await fetch(`https://api.openai.com/v1/videos/${jobId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.client.apiKey}`,
          },
        });

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Video generation job not found');
          }
          throw new Error(`Failed to get job status: ${response.status}`);
        }

        const data = await response.json() as any;

        const job: SoraVideoJob = {
          id: data.id,
          status: data.status,
          video_url: data.video_url,
          error: data.error,
          progress: data.progress,
        };

        logger.info({ jobId, status: job.status, progress: job.progress }, 'Job status update');

        // Check if job is complete
        if (job.status === 'completed' || job.status === 'failed') {
          return job;
        }

        // Wait before polling again
        await sleep(this.pollingInterval);
      } catch (error: any) {
        if (error?.message?.includes('not found')) {
          throw error;
        }
        logger.error({ error, jobId }, 'Error polling job status');
        throw error;
      }
    }
  }

  /**
   * Normalize duration to allowed values (4, 8, or 12 seconds)
   */
  private normalizeDuration(requestedDuration: number): number {
    if (requestedDuration <= 4) return 4;
    if (requestedDuration <= 8) return 8;
    return 12;
  }

  /**
   * Calculate cost based on duration and model
   */
  private calculateCost(duration: number, model: string): number {
    // Sora 2 pricing (these are estimates until official pricing is announced)
    const baseCost = 0.50;
    const costPerSecond = model.includes('pro') ? 0.08 : 0.05;
    return baseCost + (duration * costPerSecond);
  }

  /**
   * Get video dimensions based on aspect ratio and resolution
   */
  private getWidthFromAspectRatio(
    aspectRatio: string,
    resolution: string
  ): { width: number; height: number } {
    const is1080p = resolution === '1080p';
    const baseHeight = is1080p ? 1080 : 720;

    switch (aspectRatio) {
      case '16:9':
        return {
          width: Math.round((baseHeight * 16) / 9),
          height: baseHeight,
        };
      case '9:16':
        return {
          width: Math.round((baseHeight * 9) / 16),
          height: baseHeight,
        };
      case '1:1':
        return {
          width: baseHeight,
          height: baseHeight,
        };
      default:
        return {
          width: Math.round((baseHeight * 16) / 9),
          height: baseHeight,
        };
    }
  }
}
