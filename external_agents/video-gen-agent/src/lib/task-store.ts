/**
 * Task Store
 *
 * Stores task status in memory or Redis
 */

import { createClient, RedisClientType } from 'redis';
import { logger } from './logger.js';
import type { TaskStatus } from '../types/index.js';
import { TASK_STORE_CONFIG } from '../agent/config.js';

export class TaskStore {
  private tasks: Map<string, TaskStatus> = new Map();
  private redisClient: RedisClientType | null = null;
  private useRedis: boolean;

  constructor() {
    this.useRedis = TASK_STORE_CONFIG.type === 'redis';
  }

  async initialize(): Promise<void> {
    if (this.useRedis) {
      this.redisClient = createClient({
        url: TASK_STORE_CONFIG.redisUrl,
        password: TASK_STORE_CONFIG.redisPassword,
        database: TASK_STORE_CONFIG.redisDb,
      });

      this.redisClient.on('error', (err) => {
        logger.error({ err }, 'Redis client error');
      });

      await this.redisClient.connect();
      logger.info('Connected to Redis task store');
    } else {
      logger.info('Using in-memory task store');
    }
  }

  async setTask(taskId: string, status: TaskStatus): Promise<void> {
    if (this.useRedis && this.redisClient) {
      await this.redisClient.setEx(
        `task:${taskId}`,
        TASK_STORE_CONFIG.taskTtlSeconds,
        JSON.stringify(status)
      );
    } else {
      this.tasks.set(taskId, status);
    }
  }

  async getTask(taskId: string): Promise<TaskStatus | null> {
    if (this.useRedis && this.redisClient) {
      const data = await this.redisClient.get(`task:${taskId}`);
      return data ? JSON.parse(data) : null;
    } else {
      return this.tasks.get(taskId) || null;
    }
  }

  async deleteTask(taskId: string): Promise<void> {
    if (this.useRedis && this.redisClient) {
      await this.redisClient.del(`task:${taskId}`);
    } else {
      this.tasks.delete(taskId);
    }
  }

  async close(): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }
}

export const taskStore = new TaskStore();
