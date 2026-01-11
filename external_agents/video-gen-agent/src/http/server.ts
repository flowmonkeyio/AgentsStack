/**
 * HTTP Server
 *
 * Express server for the MCP video generation agent
 */

import express, { Express } from 'express';
import { logger } from '../lib/logger.js';
import { SERVER_CONFIG } from '../agent/config.js';
import healthRoute from './routes/health.js';
import executeRoute from './routes/execute.js';
import statusRoute from './routes/status.js';

export function createServer(): Express {
  const app = express();

  // Middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Request logging
  app.use((req, res, next) => {
    logger.info({ method: req.method, path: req.path }, 'HTTP request');
    next();
  });

  // Routes
  app.use('/health', healthRoute);
  app.use('/execute', executeRoute);
  app.use('/status', statusRoute);

  // Error handler
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error({ err }, 'Unhandled error');
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

export function startServer(app: Express): void {
  app.listen(SERVER_CONFIG.port, SERVER_CONFIG.host, () => {
    logger.info(
      {
        port: SERVER_CONFIG.port,
        host: SERVER_CONFIG.host,
        nodeEnv: SERVER_CONFIG.nodeEnv,
      },
      'Video generation agent server started'
    );
  });
}
