/**
 * OpenRouter API Client
 *
 * Client for OpenRouter's image generation API.
 */

import type {
  OpenRouterConfig,
  OpenRouterImageRequest,
  OpenRouterImageResponse,
  OpenRouterErrorResponse,
  ImageGenerationOptions,
} from '../types/index.js';
import { logger } from './logger.js';
import { retryWithBackoff } from './utils.js';

/**
 * OpenRouter client for image generation
 */
export class OpenRouterClient {
  private config: Required<OpenRouterConfig>;

  constructor(config: OpenRouterConfig) {
    this.config = {
      baseUrl: 'https://openrouter.ai/api/v1',
      defaultModel: 'google/gemini-2.0-flash-exp:image',
      fallbackModel: 'flux/flux-1.1-pro',
      timeout: 300000, // 5 minutes
      ...config,
    };
  }

  /**
   * Generate an image from a text prompt
   */
  async generateImage(
    prompt: string,
    options?: ImageGenerationOptions
  ): Promise<{
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
  }> {
    const model = options?.model ?? this.config.defaultModel;
    const width = options?.width ?? 1024;
    const height = options?.height ?? 1024;

    logger.info({ prompt, model, width, height }, 'Generating image via OpenRouter');

    try {
      // Try primary model
      return await this.callImageGeneration(prompt, model, width, height, options);
    } catch (error) {
      logger.warn(
        {
          model,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Primary model failed, trying fallback'
      );

      // Try fallback model if allowed
      if (options?.allowFallbacks !== false && this.config.fallbackModel) {
        return await this.callImageGeneration(
          prompt,
          this.config.fallbackModel,
          width,
          height,
          options
        );
      }

      throw error;
    }
  }

  /**
   * Internal method to call image generation
   */
  private async callImageGeneration(
    prompt: string,
    model: string,
    width: number,
    height: number,
    options?: ImageGenerationOptions
  ): Promise<{
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
  }> {
    const request: OpenRouterImageRequest = {
      model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
      modalities: ['image'], // Required for image generation
      temperature: options?.temperature,
    };

    // Call OpenRouter API with retry logic
    const response = await retryWithBackoff(
      () => this.makeRequest<OpenRouterImageResponse>(request),
      {
        maxAttempts: 3,
        initialDelay: 2000,
        maxDelay: 10000,
      }
    );

    // Extract image URL from response
    const imageContent = response.choices[0]?.message?.content[0];
    if (!imageContent || imageContent.type !== 'image') {
      throw new Error('No image returned from OpenRouter');
    }

    const imageUrl = imageContent.source.url;

    // Calculate cost (use reported cost or default)
    const costUsd = response.usage.total_cost ?? parseFloat(process.env.DEFAULT_IMAGE_COST ?? '0.08');

    logger.info(
      {
        model: response.model,
        cost: costUsd,
        tokens: response.usage.total_tokens,
      },
      'Image generated successfully'
    );

    return {
      image_url: imageUrl,
      width,
      height,
      format: 'png', // OpenRouter typically returns PNG
      model_used: response.model,
      cost_usd: costUsd,
      usage: {
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens,
        total_tokens: response.usage.total_tokens,
      },
    };
  }

  /**
   * Make HTTP request to OpenRouter API
   */
  private async makeRequest<T>(body: OpenRouterImageRequest): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          'HTTP-Referer': 'https://agentstack.dev',
          'X-Title': 'AgentsStack External Agent',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = (await response.json()) as OpenRouterErrorResponse;
        const errorMessage = errorData.error?.message ?? `HTTP ${response.status}`;
        throw new Error(`OpenRouter API error: ${errorMessage}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('OpenRouter API request timed out');
        }
        throw error;
      }

      throw new Error('Unknown error calling OpenRouter API');
    }
  }
}
