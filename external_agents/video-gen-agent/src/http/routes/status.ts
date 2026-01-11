/**
 * Status Route
 *
 * GET /status/:task_id - Get task status
 */

import { Router, Request, Response } from 'express';
import { taskStore } from '../../lib/task-store.js';
import { logger } from '../../lib/logger.js';
import type { MCPStatusResponse } from '../../types/index.js';

const router = Router();

router.get('/:task_id', async (req: Request, res: Response) => {
  try {
    const task_id = Array.isArray(req.params.task_id)
      ? req.params.task_id[0]
      : req.params.task_id;

    logger.debug({ task_id }, 'Status request received');

    const task = await taskStore.getTask(task_id);

    if (!task) {
      res.status(404).json({
        error: 'Task not found',
        task_id,
      });
      return;
    }

    // Calculate estimated remaining time
    let estimated_remaining_ms: number | undefined;
    if (task.status === 'processing' && task.progress !== undefined) {
      const elapsed = Date.now() - new Date(task.created_at).getTime();
      const progressFraction = task.progress / 100;
      if (progressFraction > 0) {
        const totalEstimated = elapsed / progressFraction;
        estimated_remaining_ms = Math.max(0, totalEstimated - elapsed);
      }
    }

    const response: MCPStatusResponse = {
      task_id,
      status: task.status,
      progress: task.progress,
      result: task.result,
      error: task.error,
      estimated_remaining_ms,
    };

    res.json(response);
  } catch (error) {
    logger.error({ error }, 'Status route error');
    res.status(500).json({
      error: 'Internal server error',
    });
  }
});

export default router;
