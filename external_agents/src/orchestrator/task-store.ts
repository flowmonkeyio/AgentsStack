/**
 * Task Store
 *
 * Storage layer for task state (Redis or in-memory).
 */

import { createClient, type RedisClientType } from 'redis';
import type { TaskState } from './types.js';
import { logger } from '../lib/logger.js';
import { TASK_STORE_CONFIG } from '../agent/config.js';

/**
 * Task store interface
 */
export interface ITaskStore {
  get(taskId: string): Promise<TaskState | null>;
  set(taskId: string, task: TaskState): Promise<void>;
  delete(taskId: string): Promise<void>;
  close(): Promise<void>;
}

/**
 * In-memory task store (for development)
 */
export class MemoryTaskStore implements ITaskStore {
  private store: Map<string, TaskState> = new Map();

  async get(taskId: string): Promise<TaskState | null> {
    return this.store.get(taskId) ?? null;
  }

  async set(taskId: string, task: TaskState): Promise<void> {
    this.store.set(taskId, task);
  }

  async delete(taskId: string): Promise<void> {
    this.store.delete(taskId);
  }

  async close(): Promise<void> {
    this.store.clear();
  }
}

/**
 * Redis task store (for production)
 */
export class RedisTaskStore implements ITaskStore {
  private client: RedisClientType;
  private connected: boolean = false;

  constructor() {
    this.client = createClient({
      url: TASK_STORE_CONFIG.redisUrl,
      password: TASK_STORE_CONFIG.redisPassword,
      database: TASK_STORE_CONFIG.redisDb,
    });

    this.client.on('error', (error) => {
      logger.error({ error: error.message }, 'Redis client error');
    });
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
      logger.info('Connected to Redis');
    }
  }

  async get(taskId: string): Promise<TaskState | null> {
    const key = `task:${taskId}`;
    const data = await this.client.get(key);

    if (!data) {
      return null;
    }

    const parsed = JSON.parse(data);

    // Convert date strings back to Date objects
    return {
      ...parsed,
      created_at: new Date(parsed.created_at),
      started_at: parsed.started_at ? new Date(parsed.started_at) : undefined,
      completed_at: parsed.completed_at ? new Date(parsed.completed_at) : undefined,
    };
  }

  async set(taskId: string, task: TaskState): Promise<void> {
    const key = `task:${taskId}`;
    const data = JSON.stringify(task);

    // Set with TTL
    await this.client.setEx(key, TASK_STORE_CONFIG.taskTtlSeconds, data);
  }

  async delete(taskId: string): Promise<void> {
    const key = `task:${taskId}`;
    await this.client.del(key);
  }

  async close(): Promise<void> {
    if (this.connected) {
      await this.client.quit();
      this.connected = false;
      logger.info('Disconnected from Redis');
    }
  }
}

/**
 * Create task store based on configuration
 */
export async function createTaskStore(): Promise<ITaskStore> {
  if (TASK_STORE_CONFIG.type === 'redis') {
    const store = new RedisTaskStore();
    await store.connect();
    return store;
  }

  logger.warn('Using in-memory task store (not suitable for production)');
  return new MemoryTaskStore();
}
