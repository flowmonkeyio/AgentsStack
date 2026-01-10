/**
 * Task Manager
 *
 * Manages task lifecycle, async execution, and state tracking.
 */

import { v4 as uuidv4 } from 'uuid';
import type { ITaskStore } from './task-store.js';
import type { TaskState, CreateTaskOptions, TaskUpdateData } from './types.js';
import { CallbackService } from './callback-service.js';
import { CostTracker } from '../agent/cost-tracker.js';
import { ImageGenerator } from '../agent/image-generator.js';
import type { ImageGenerationOptions } from '../types/index.js';
import { logger } from '../lib/logger.js';

/**
 * Task manager
 */
export class TaskManager {
  private store: ITaskStore;
  private callbackService: CallbackService;
  private imageGenerator: ImageGenerator;

  constructor(store: ITaskStore) {
    this.store = store;
    this.callbackService = new CallbackService();
    this.imageGenerator = new ImageGenerator();
  }

  /**
   * Create a new task
   */
  async createTask(options: CreateTaskOptions): Promise<TaskState> {
    const taskId = uuidv4();

    const task: TaskState = {
      task_id: taskId,
      request_id: options.request_id,
      status: 'pending',
      progress: 0,
      prompt: options.prompt,
      requirements: options.requirements,
      callback_url: options.callback_url,
      created_at: new Date(),
    };

    await this.store.set(taskId, task);

    logger.info({ taskId, requestId: options.request_id }, 'Task created');

    // Start processing asynchronously
    this.processTask(taskId).catch((error) => {
      logger.error(
        {
          taskId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Task processing failed'
      );
    });

    return task;
  }

  /**
   * Get task by ID
   */
  async getTask(taskId: string): Promise<TaskState | null> {
    return await this.store.get(taskId);
  }

  /**
   * Update task state
   */
  async updateTask(taskId: string, updates: TaskUpdateData): Promise<void> {
    const task = await this.store.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const updatedTask: TaskState = {
      ...task,
      ...updates,
      ...(updates.status === 'processing' && !task.started_at
        ? { started_at: new Date() }
        : {}),
      ...(updates.status === 'completed' || updates.status === 'failed'
        ? { completed_at: new Date() }
        : {}),
    };

    await this.store.set(taskId, updatedTask);

    logger.debug({ taskId, updates }, 'Task updated');
  }

  /**
   * Process task asynchronously
   */
  private async processTask(taskId: string): Promise<void> {
    const startTime = Date.now();

    try {
      const task = await this.store.get(taskId);
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }

      // Update to processing
      await this.updateTask(taskId, {
        status: 'processing',
        progress: 0.1,
        message: 'Starting image generation...',
      });

      // Create cost tracker
      const costTracker = new CostTracker();

      // Parse image generation options from requirements
      const options = this.parseImageOptions(task.requirements);

      // Update progress
      await this.updateTask(taskId, {
        progress: 0.3,
        message: 'Generating image...',
      });

      // Generate image
      const result = await this.imageGenerator.generateImageWithTracking(
        task.prompt,
        costTracker,
        options
      );

      // Update progress
      await this.updateTask(taskId, {
        progress: 0.9,
        message: 'Finalizing...',
      });

      // Calculate processing time
      const processingTime = Date.now() - startTime;

      // Format output
      const output = {
        image: {
          url: result.image_url,
          width: result.width,
          height: result.height,
          format: result.format,
        },
        alt_text: task.prompt,
        prompt_used: task.prompt,
        model_used: result.model_used,
      };

      // Get usage data
      const usage = costTracker.getAgentUsage();

      // Update task to completed
      await this.updateTask(taskId, {
        status: 'completed',
        progress: 1.0,
        output,
        usage,
        processing_time_ms: processingTime,
      });

      // Send callback if configured
      if (task.callback_url) {
        await this.callbackService.sendCallback(task.callback_url, taskId, 'completed', {
          output,
          usage,
          processing_time_ms: processingTime,
        });
      }

      logger.info(
        {
          taskId,
          processingTime,
          cost: usage.total_cost,
        },
        'Task completed successfully'
      );
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error({ taskId, error: errorMessage }, 'Task failed');

      // Update task to failed
      await this.updateTask(taskId, {
        status: 'failed',
        error: errorMessage,
        retryable: true,
        processing_time_ms: processingTime,
      });

      // Send failure callback
      const task = await this.store.get(taskId);
      if (task?.callback_url) {
        await this.callbackService.sendCallback(task.callback_url, taskId, 'failed', {
          error: errorMessage,
          usage: { total_cost: 0 }, // No cost on failure
          processing_time_ms: processingTime,
        });
      }
    }
  }

  /**
   * Parse image generation options from requirements
   */
  private parseImageOptions(requirements?: string[]): ImageGenerationOptions | undefined {
    if (!requirements || requirements.length === 0) {
      return undefined;
    }

    const options: ImageGenerationOptions = {};

    // Parse requirements for width/height/model hints
    for (const req of requirements) {
      const lower = req.toLowerCase();

      // Width
      const widthMatch = lower.match(/width[:\s]+(\d+)/);
      if (widthMatch) {
        options.width = parseInt(widthMatch[1], 10);
      }

      // Height
      const heightMatch = lower.match(/height[:\s]+(\d+)/);
      if (heightMatch) {
        options.height = parseInt(heightMatch[1], 10);
      }

      // Model
      if (lower.includes('gemini')) {
        options.model = 'google/gemini-2.0-flash-exp:image';
      } else if (lower.includes('flux')) {
        options.model = 'flux/flux-1.1-pro';
      }
    }

    return Object.keys(options).length > 0 ? options : undefined;
  }

  /**
   * Close task manager and cleanup
   */
  async close(): Promise<void> {
    await this.store.close();
  }
}
