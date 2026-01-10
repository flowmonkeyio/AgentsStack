/**
 * Execute Route
 *
 * POST /execute handler.
 */

import type { Request, Response } from 'express';
import type { TaskManager } from '../../orchestrator/task-manager.js';
import type { AgentExecuteRequest, AgentExecuteResponseAsync } from '../../types/index.js';
import { logger } from '../../lib/logger.js';
import { TIMEOUT_CONFIG } from '../../agent/config.js';

/**
 * Execute handler factory
 */
export function createExecuteHandler(taskManager: TaskManager) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const request = req.body as AgentExecuteRequest;

      logger.info({ requestId: request.request_id }, 'Execute request received');

      // Create task
      const task = await taskManager.createTask({
        request_id: request.request_id,
        prompt: request.prompt,
        requirements: request.requirements,
        callback_url: request.callback_url,
      });

      // Return async response
      const response: AgentExecuteResponseAsync = {
        status: 'accepted',
        reference_id: task.task_id,
        status_url: `/status/${task.task_id}`,
        estimated_completion_ms: TIMEOUT_CONFIG.imageGeneration,
        supports_callback: true,
      };

      res.status(202).json(response);

      logger.info(
        {
          requestId: request.request_id,
          taskId: task.task_id,
        },
        'Task accepted'
      );
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Execute request failed'
      );

      res.status(500).json({
        error: 'Failed to create task',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
