/**
 * Health Check Route
 *
 * GET /health - Health check endpoint
 */

import { Router, Request, Response } from 'express';
import { AGENT_CONFIG, SERVER_CONFIG } from '../../agent/config.js';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    agent: {
      name: AGENT_CONFIG.name,
      version: AGENT_CONFIG.version,
      description: AGENT_CONFIG.description,
      capabilities: AGENT_CONFIG.capabilities,
      base_price: AGENT_CONFIG.base_price,
      supports_async: AGENT_CONFIG.supports_async,
      supports_callback: AGENT_CONFIG.supports_callback,
    },
    server: {
      nodeEnv: SERVER_CONFIG.nodeEnv,
      uptime: process.uptime(),
    },
  });
});

export default router;
