/**
 * Health Route
 *
 * GET /health handler.
 */

import type { Request, Response } from 'express';
import { AGENT_CONFIG } from '../../agent/config.js';

/**
 * Health check handler
 */
export function healthHandler(_req: Request, res: Response): void {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    agent: {
      name: AGENT_CONFIG.name,
      version: AGENT_CONFIG.version,
    },
  });
}
