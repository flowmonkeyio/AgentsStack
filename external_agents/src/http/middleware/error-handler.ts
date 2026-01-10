/**
 * Error Handler Middleware
 *
 * Global error handling for Express.
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from '../../lib/logger.js';

/**
 * Global error handler
 */
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error(
    {
      error: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method,
    },
    'Unhandled error'
  );

  res.status(500).json({
    error: 'Internal server error',
    message: error.message,
  });
}
