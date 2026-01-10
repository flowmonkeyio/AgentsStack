/**
 * Status Route
 *
 * GET /status/:id handler.
 */

import type { Request, Response } from 'express';
import type { TaskManager } from '../../orchestrator/task-manager.js';
import type { AgentStatusResponse } from '../../types/index.js';
import { logger } from '../../lib/logger.js';

/**
 * Status handler factory
 */
export function createStatusHandler(taskManager: TaskManager) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;

      logger.debug({ taskId: id }, 'Status request received');

      const task = await taskManager.getTask(id);

      if (!task) {
        res.status(404).json({
          error: 'Task not found',
          task_id: id,
        });
        return;
      }

      let response: AgentStatusResponse;

      if (task.status === 'processing' || task.status === 'pending') {
        response = {
          status: 'processing',
          progress: task.progress,
          message: task.message,
        };
      } else if (task.status === 'completed') {
        response = {
          status: 'completed',
          output: task.output!,
          usage: task.usage!,
          processing_time_ms: task.processing_time_ms,
        };
      } else {
        // failed
        response = {
          status: 'failed',
          error: task.error ?? 'Unknown error',
          retryable: task.retryable ?? false,
        };
      }

      res.status(200).json(response);
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Status request failed'
      );

      res.status(500).json({
        error: 'Failed to get task status',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
