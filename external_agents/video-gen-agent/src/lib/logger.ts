/**
 * Logging
 */

import pino from 'pino';
import { SERVER_CONFIG } from '../agent/config.js';

export const logger = pino({
  level: SERVER_CONFIG.nodeEnv === 'production' ? 'info' : 'debug',
  transport:
    SERVER_CONFIG.nodeEnv === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});
