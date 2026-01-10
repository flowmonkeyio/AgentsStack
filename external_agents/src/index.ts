/**
 * Main Entry Point
 *
 * Initializes and starts the MCP external agent server.
 */

import { createApp, startServer } from './http/server.js';
import { createTaskStore } from './orchestrator/task-store.js';
import { TaskManager } from './orchestrator/task-manager.js';
import { logger } from './lib/logger.js';
import { AGENT_CONFIG } from './agent/config.js';

/**
 * Main startup function
 */
async function main(): Promise<void> {
  try {
    logger.info(
      {
        name: AGENT_CONFIG.name,
        version: AGENT_CONFIG.version,
      },
      'Starting MCP External Agent'
    );

    // Create task store
    const taskStore = await createTaskStore();
    logger.info('Task store initialized');

    // Create task manager
    const taskManager = new TaskManager(taskStore);
    logger.info('Task manager initialized');

    // Create Express app
    const app = createApp(taskManager);

    // Start HTTP server
    await startServer(app);

    logger.info('MCP External Agent is ready');

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully');
      await taskManager.close();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully');
      await taskManager.close();
      process.exit(0);
    });
  } catch (error) {
    logger.fatal(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      'Failed to start server'
    );
    process.exit(1);
  }
}

// Start the server
main();
