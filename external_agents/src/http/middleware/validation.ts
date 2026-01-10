/**
 * Validation Middleware
 *
 * Request validation using Zod schemas.
 */

import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../../lib/logger.js';

/**
 * AgentExecuteRequest schema
 */
export const AgentExecuteRequestSchema = z.object({
  request_id: z.string().min(1),
  prompt: z.string().min(1),
  requirements: z.array(z.string()).optional(),
  callback_url: z.string().url().optional(),
  adjustment: z
    .object({
      is_retry: z.boolean(),
      attempt: z.number(),
      previous_output: z.unknown(),
      issues: z.array(
        z.object({
          criterion: z.string(),
          detail: z.string(),
        })
      ),
      feedback: z.string(),
    })
    .optional(),
});

/**
 * Validate request body against schema
 */
export function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn({ errors: error.errors }, 'Request validation failed');
        res.status(400).json({
          error: 'Validation error',
          details: error.errors,
        });
      } else {
        next(error);
      }
    }
  };
}
