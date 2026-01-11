/**
 * Execute Route
 *
 * POST /execute - Start a video generation task
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { VideoGenerator } from '../../agent/video-generator.js';
import { taskStore } from '../../lib/task-store.js';
import { logger } from '../../lib/logger.js';
import type { MCPRequest, MCPResponse, TaskStatus } from '../../types/index.js';

const router = Router();
const videoGenerator = new VideoGenerator();

router.post('/', async (req: Request, res: Response) => {
  try {
    const request = req.body as MCPRequest;
    const task_id = request.task_id || uuidv4();

    logger.info({ task_id, prompt: request.prompt }, 'Received execute request');

    // Create initial task status
    const taskStatus: TaskStatus = {
      task_id,
      status: 'pending',
      progress: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await taskStore.setTask(task_id, taskStatus);

    // Estimate completion time
    const estimated_completion_ms = videoGenerator.estimateTime(request.options);

    const response: MCPResponse = {
      task_id,
      status: 'accepted',
      estimated_completion_ms,
    };

    res.json(response);

    // Process task asynchronously
    processTask(task_id, request).catch((error) => {
      logger.error({ error, task_id }, 'Task processing failed');
    });
  } catch (error) {
    logger.error({ error }, 'Execute route error');
    res.status(500).json({
      status: 'rejected',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

async function processTask(task_id: string, request: MCPRequest): Promise<void> {
  try {
    // Update status to processing
    await taskStore.setTask(task_id, {
      task_id,
      status: 'processing',
      progress: 10,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Generate the video
    const result = await videoGenerator.generateVideo(
      request.prompt,
      request.options
    );

    // Update status to completed
    await taskStore.setTask(task_id, {
      task_id,
      status: 'completed',
      progress: 100,
      result,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    logger.info({ task_id }, 'Task completed successfully');

    // Call callback if provided
    if (request.callback_url) {
      await fetch(request.callback_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id,
          status: 'completed',
          result,
        }),
      }).catch((err) => {
        logger.error({ err, callback_url: request.callback_url }, 'Callback failed');
      });
    }
  } catch (error) {
    logger.error({ error, task_id }, 'Task processing error');

    await taskStore.setTask(task_id, {
      task_id,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Call callback with error if provided
    if (request.callback_url) {
      await fetch(request.callback_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
      }).catch((err) => {
        logger.error({ err, callback_url: request.callback_url }, 'Callback failed');
      });
    }
  }
}

export default router;
