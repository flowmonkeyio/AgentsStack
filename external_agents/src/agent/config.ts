/**
 * Agent Configuration
 *
 * Configuration and metadata for the image generation agent.
 */

import { requireEnv, getEnv, getEnvNumber } from '../lib/utils.js';

/**
 * Agent configuration
 */
export const AGENT_CONFIG = {
  name: getEnv('AGENT_NAME', 'ImageGenerator'),
  version: getEnv('AGENT_VERSION', '1.0.0'),
  description: getEnv(
    'AGENT_DESCRIPTION',
    'MCP-based image generation agent using OpenRouter'
  ),
  capabilities: getEnv(
    'AGENT_CAPABILITIES',
    'hero images, social graphics, product mockups, illustrations'
  ),
  base_price: getEnvNumber('AGENT_BASE_PRICE', 0.08),
  wallet_address: getEnv('AGENT_WALLET_ADDRESS', '0x0000000000000000000000000000000000000000'),
  supports_async: true,
  supports_callback: true,
} as const;

/**
 * Server configuration
 */
export const SERVER_CONFIG = {
  port: getEnvNumber('PORT', 3000),
  host: getEnv('HOST', '0.0.0.0'),
  nodeEnv: getEnv('NODE_ENV', 'development'),
} as const;

/**
 * OpenRouter configuration
 */
export const OPENROUTER_CONFIG = {
  apiKey: requireEnv('OPENROUTER_API_KEY'),
  defaultModel: getEnv('OPENROUTER_DEFAULT_MODEL', 'google/gemini-2.0-flash-exp:image'),
  fallbackModel: getEnv('OPENROUTER_FALLBACK_MODEL', 'flux/flux-1.1-pro'),
  timeout: getEnvNumber('IMAGE_GENERATION_TIMEOUT', 300000),
} as const;

/**
 * Task store configuration
 */
export const TASK_STORE_CONFIG = {
  type: getEnv('TASK_STORE_TYPE', 'memory') as 'memory' | 'redis',
  redisUrl: getEnv('REDIS_URL', 'redis://localhost:6379'),
  redisPassword: process.env.REDIS_PASSWORD,
  redisDb: getEnvNumber('REDIS_DB', 0),
  taskTtlSeconds: getEnvNumber('TASK_TTL_SECONDS', 3600),
} as const;

/**
 * Timeout configuration
 */
export const TIMEOUT_CONFIG = {
  imageGeneration: getEnvNumber('IMAGE_GENERATION_TIMEOUT', 300000),
  httpRequest: getEnvNumber('HTTP_REQUEST_TIMEOUT', 60000),
  maxConcurrentTasks: getEnvNumber('MAX_CONCURRENT_TASKS', 10),
} as const;

/**
 * Callback configuration
 */
export const CALLBACK_CONFIG = {
  timeout: getEnvNumber('CALLBACK_TIMEOUT', 10000),
  retryAttempts: getEnvNumber('CALLBACK_RETRY_ATTEMPTS', 3),
  retryDelay: getEnvNumber('CALLBACK_RETRY_DELAY', 1000),
} as const;

/**
 * Cost configuration
 */
export const COST_CONFIG = {
  defaultImageCost: getEnvNumber('DEFAULT_IMAGE_COST', 0.08),
} as const;
