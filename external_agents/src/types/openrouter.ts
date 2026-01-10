/**
 * OpenRouter API Types
 *
 * Type definitions for OpenRouter's image generation API.
 * Reference: https://openrouter.ai/docs/guides/overview/multimodal/image-generation
 */

// =============================================================================
// Request Types
// =============================================================================

/**
 * Message content for image generation
 */
export interface OpenRouterImageMessageContent {
  type: 'text';
  text: string;
}

/**
 * Message in chat format
 */
export interface OpenRouterImageMessage {
  role: 'user' | 'assistant' | 'system';
  content: OpenRouterImageMessageContent[];
}

/**
 * Image generation request
 */
export interface OpenRouterImageRequest {
  /** Model identifier */
  model: string;

  /** Messages in chat format */
  messages: OpenRouterImageMessage[];

  /** REQUIRED for image generation */
  modalities: ['image'];

  /** Maximum tokens for generation (optional) */
  max_tokens?: number;

  /** Temperature for generation (0-2) */
  temperature?: number;

  /** Top P sampling (0-1) */
  top_p?: number;

  /** Provider-specific parameters */
  provider?: {
    /** Provider to route to (optional) */
    order?: string[];

    /** Allow fallbacks */
    allow_fallbacks?: boolean;
  };
}

// =============================================================================
// Response Types
// =============================================================================

/**
 * Image content in response
 */
export interface OpenRouterImageContent {
  type: 'image';
  source: {
    type: 'url';
    url: string;
  };
}

/**
 * Response message
 */
export interface OpenRouterImageResponseMessage {
  role: 'assistant';
  content: OpenRouterImageContent[];
}

/**
 * Choice in response
 */
export interface OpenRouterImageChoice {
  index: number;
  message: OpenRouterImageResponseMessage;
  finish_reason: 'stop' | 'length' | 'content_filter' | 'error';
}

/**
 * Usage information
 */
export interface OpenRouterUsage {
  /** Input tokens */
  prompt_tokens: number;

  /** Output tokens */
  completion_tokens: number;

  /** Total tokens */
  total_tokens: number;

  /** Total cost in USD (may not be present) */
  total_cost?: number;
}

/**
 * Complete image generation response
 */
export interface OpenRouterImageResponse {
  /** Unique request ID */
  id: string;

  /** Model used for generation */
  model: string;

  /** Unix timestamp */
  created: number;

  /** Array of choices (typically one) */
  choices: OpenRouterImageChoice[];

  /** Usage and cost information */
  usage: OpenRouterUsage;
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * OpenRouter API error details
 */
export interface OpenRouterErrorDetail {
  message: string;
  type: string;
  param?: string;
  code?: string;
}

/**
 * OpenRouter error response
 */
export interface OpenRouterErrorResponse {
  error: OpenRouterErrorDetail;
}

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * OpenRouter client configuration
 */
export interface OpenRouterConfig {
  /** OpenRouter API key */
  apiKey: string;

  /** Base URL (for testing) */
  baseUrl?: string;

  /** Default model */
  defaultModel?: string;

  /** Fallback model if primary fails */
  fallbackModel?: string;

  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Image generation options
 */
export interface ImageGenerationOptions {
  /** Model to use (overrides default) */
  model?: string;

  /** Image width in pixels */
  width?: number;

  /** Image height in pixels */
  height?: number;

  /** Temperature for generation */
  temperature?: number;

  /** Whether to allow fallback models */
  allowFallbacks?: boolean;
}
