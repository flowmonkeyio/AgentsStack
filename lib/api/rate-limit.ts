/**
 * Rate Limiting Middleware
 *
 * Implements sliding window counter rate limiting.
 * Uses in-memory store with upgrade path to Redis for production.
 *
 * @see /docs/designs/api/TECH_DESIGN.md
 */

import { NextRequest } from "next/server";

// =============================================================================
// TYPES
// =============================================================================

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyGenerator: (req: NextRequest, userId: string) => string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// =============================================================================
// IN-MEMORY STORE
// =============================================================================

// In-memory store (swap for Redis in production)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Periodic cleanup of expired entries (every 60 seconds)
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function startCleanup(): void {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now > entry.resetAt) {
        rateLimitStore.delete(key);
      }
    }
  }, 60000);

  // Don't prevent process from exiting
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }
}

// Start cleanup on module load
startCleanup();

// =============================================================================
// RATE LIMITER FACTORY
// =============================================================================

export function createRateLimiter(config: RateLimitConfig) {
  return async function rateLimit(
    req: NextRequest,
    userId: string
  ): Promise<RateLimitResult> {
    const key = config.keyGenerator(req, userId);
    const now = Date.now();
    const entry = rateLimitStore.get(key);

    if (!entry || now > entry.resetAt) {
      // New window
      rateLimitStore.set(key, {
        count: 1,
        resetAt: now + config.windowMs,
      });
      return {
        allowed: true,
        remaining: config.maxRequests - 1,
        resetAt: new Date(now + config.windowMs),
      };
    }

    if (entry.count >= config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(entry.resetAt),
      };
    }

    entry.count++;
    return {
      allowed: true,
      remaining: config.maxRequests - entry.count,
      resetAt: new Date(entry.resetAt),
    };
  };
}

// =============================================================================
// PRE-CONFIGURED LIMITERS
// =============================================================================

/**
 * Pre-configured rate limiters for each endpoint
 * Per design specification:
 * - POST /api/jobs: 10 per minute
 * - POST /api/jobs/:id/continue: 20 per minute
 * - GET /api/jobs/:id: 60 per minute
 */
export const rateLimiters = {
  createJob: createRateLimiter({
    windowMs: 60000,
    maxRequests: 10,
    keyGenerator: (_, userId) => `create_job:${userId}`,
  }),
  continueJob: createRateLimiter({
    windowMs: 60000,
    maxRequests: 20,
    keyGenerator: (_, userId) => `continue_job:${userId}`,
  }),
  getJob: createRateLimiter({
    windowMs: 60000,
    maxRequests: 60,
    keyGenerator: (_, userId) => `get_job:${userId}`,
  }),
};

// =============================================================================
// SSE CONNECTION LIMITER
// =============================================================================

// SSE connection limiter (different pattern - tracks active connections)
// Per design: 5 connections per user
const activeConnections = new Map<string, number>();

/**
 * Check if user can open another SSE connection
 * Limit: 5 connections per user
 */
export function checkSSEConnectionLimit(userId: string): boolean {
  const current = activeConnections.get(userId) || 0;
  return current < 5;
}

/**
 * Track a new SSE connection for a user
 * Returns cleanup function to call when connection closes
 */
export function trackSSEConnection(userId: string): () => void {
  const current = activeConnections.get(userId) || 0;
  activeConnections.set(userId, current + 1);

  // Return cleanup function
  return () => {
    const count = activeConnections.get(userId) || 1;
    if (count <= 1) {
      activeConnections.delete(userId);
    } else {
      activeConnections.set(userId, count - 1);
    }
  };
}

/**
 * Get current connection count for a user (for debugging/monitoring)
 */
export function getSSEConnectionCount(userId: string): number {
  return activeConnections.get(userId) || 0;
}
