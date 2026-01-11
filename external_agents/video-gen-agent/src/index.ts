/**
 * Video Generation Agent Entry Point
 *
 * MCP-based video generation agent using OpenAI Sora 2
 */

import { createServer, startServer } from './http/server.js';
import { taskStore } from './lib/task-store.js';
import { logger } from './lib/logger.js';

async function main() {
  try {
    logger.info('Starting video generation agent...');

    // Initialize task store
    await taskStore.initialize();

    // Create and start server
    const app = createServer();
    startServer(app);

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      await taskStore.close();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully');
      await taskStore.close();
      process.exit(0);
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start video generation agent');
    process.exit(1);
  }
}

main();
