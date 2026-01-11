/**
 * Agent Configuration
 */

import { requireEnv, getEnv, getEnvNumber } from '../lib/utils.js';

export const AGENT_CONFIG = {
  name: getEnv('AGENT_NAME', 'VideoGenerator'),
  version: getEnv('AGENT_VERSION', '1.0.0'),
  description: getEnv(
    'AGENT_DESCRIPTION',
    'MCP-based video generation agent using OpenAI Sora 2'
  ),
  capabilities: getEnv(
    'AGENT_CAPABILITIES',
    'short videos, promotional content, social media clips, product demos'
  ),
  base_price: getEnvNumber('AGENT_BASE_PRICE', 0.50),
  wallet_address: getEnv('AGENT_WALLET_ADDRESS', '0x0000000000000000000000000000000000000000'),
  supports_async: true,
  supports_callback: true,
} as const;

export const SERVER_CONFIG = {
  port: getEnvNumber('PORT', 3000),
  host: getEnv('HOST', '0.0.0.0'),
  nodeEnv: getEnv('NODE_ENV', 'development'),
} as const;

export const OPENAI_CONFIG = {
  apiKey: getEnv('OPENAI_API_KEY', 'placeholder-api-key'),
  model: getEnv('OPENAI_VIDEO_MODEL', 'sora-2'),
  timeout: getEnvNumber('VIDEO_GENERATION_TIMEOUT', 600000), // 10 minutes
  maxDuration: getEnvNumber('MAX_VIDEO_DURATION', 12), // Max 12 seconds (Sora 2 limit)
} as const;

export const TASK_STORE_CONFIG = {
  type: getEnv('TASK_STORE_TYPE', 'memory') as 'memory' | 'redis',
  redisUrl: getEnv('REDIS_URL', 'redis://localhost:6379'),
  redisPassword: process.env.REDIS_PASSWORD,
  redisDb: getEnvNumber('REDIS_DB', 0),
  taskTtlSeconds: getEnvNumber('TASK_TTL_SECONDS', 3600),
} as const;

export const TIMEOUT_CONFIG = {
  videoGeneration: getEnvNumber('VIDEO_GENERATION_TIMEOUT', 600000),
  httpRequest: getEnvNumber('HTTP_REQUEST_TIMEOUT', 60000),
  maxConcurrentTasks: getEnvNumber('MAX_CONCURRENT_TASKS', 5),
} as const;

export const CALLBACK_CONFIG = {
  timeout: getEnvNumber('CALLBACK_TIMEOUT', 10000),
  retryAttempts: getEnvNumber('CALLBACK_RETRY_ATTEMPTS', 3),
  retryDelay: getEnvNumber('CALLBACK_RETRY_DELAY', 1000),
} as const;

export const COST_CONFIG = {
  defaultVideoCost: getEnvNumber('DEFAULT_VIDEO_COST', 0.50),
  costPerSecond: getEnvNumber('COST_PER_SECOND', 0.05),
} as const;
