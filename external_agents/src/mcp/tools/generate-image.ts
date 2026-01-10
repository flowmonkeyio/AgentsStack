/**
 * Generate Image MCP Tool
 *
 * MCP tool for generating images using OpenRouter API.
 */

import type { MCPTool, GenerateImageInput, GenerateImageOutput } from '../types.js';
import type { ImageGenerationOptions } from '../../types/index.js';

/**
 * Generate image tool definition
 */
export function createGenerateImageTool(
  imageGenerator: {
    generateImage: (
      prompt: string,
      options?: ImageGenerationOptions
    ) => Promise<{
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
    }>;
  }
): MCPTool<GenerateImageInput, GenerateImageOutput> {
  return {
    definition: {
      name: 'generate_image',
      description:
        'Generate an image from a text prompt using OpenRouter. Supports multiple image generation models including Gemini Image and FLUX.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Text description of the image to generate',
          },
          width: {
            type: 'number',
            description: 'Image width in pixels (default: 1024)',
            minimum: 256,
            maximum: 2048,
          },
          height: {
            type: 'number',
            description: 'Image height in pixels (default: 1024)',
            minimum: 256,
            maximum: 2048,
          },
          model: {
            type: 'string',
            description: 'OpenRouter image model to use',
            enum: [
              'google/gemini-2.0-flash-exp:image',
              'flux/flux-1.1-pro',
            ],
          },
        },
        required: ['prompt'],
      },
    },

    handler: async (input: GenerateImageInput): Promise<GenerateImageOutput> => {
      try {
        // Validate input
        if (!input.prompt || input.prompt.trim().length === 0) {
          return {
            success: false,
            error: 'Prompt is required and cannot be empty',
          };
        }

        // Call image generator
        const result = await imageGenerator.generateImage(input.prompt, {
          width: input.width,
          height: input.height,
          model: input.model,
        });

        // Return successful result
        return {
          success: true,
          image_url: result.image_url,
          width: result.width,
          height: result.height,
          format: result.format,
          model_used: result.model_used,
          cost_usd: result.cost_usd,
          usage: result.usage,
        };
      } catch (error) {
        // Handle errors
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';

        return {
          success: false,
          error: errorMessage,
        };
      }
    },
  };
}
