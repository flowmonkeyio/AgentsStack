/**
 * HTTP Server
 *
 * Express server setup with routes and middleware.
 */

import express, { type Express } from 'express';
import type { TaskManager } from '../orchestrator/task-manager.js';
import { createExecuteHandler } from './routes/execute.js';
import { createStatusHandler } from './routes/status.js';
import { healthHandler } from './routes/health.js';
import { validateBody, AgentExecuteRequestSchema } from './middleware/validation.js';
import { errorHandler } from './middleware/error-handler.js';
import { logger } from '../lib/logger.js';
import { SERVER_CONFIG } from '../agent/config.js';

/**
 * Create and configure Express app
 */
export function createApp(taskManager: TaskManager): Express {
  const app = express();

  // Middleware
  app.use(express.json());

  // Request logging
  app.use((req, _res, next) => {
    logger.debug({ method: req.method, path: req.path }, 'HTTP request');
    next();
  });

  // Routes
  app.post('/execute', validateBody(AgentExecuteRequestSchema), createExecuteHandler(taskManager));
  app.get('/status/:id', createStatusHandler(taskManager));
  app.get('/health', healthHandler);

  // Root endpoint
  app.get('/', (_req, res) => {
    res.json({
      name: 'AgentsStack MCP External Agent',
      status: 'running',
      endpoints: {
        execute: 'POST /execute',
        status: 'GET /status/:id',
        health: 'GET /health',
      },
    });
  });

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}

/**
 * Start HTTP server
 */
export function startServer(app: Express): Promise<void> {
  return new Promise((resolve) => {
    app.listen(SERVER_CONFIG.port, SERVER_CONFIG.host, () => {
      logger.info(
        {
          port: SERVER_CONFIG.port,
          host: SERVER_CONFIG.host,
          nodeEnv: SERVER_CONFIG.nodeEnv,
        },
        'HTTP server started'
      );
      resolve();
    });
  });
}
