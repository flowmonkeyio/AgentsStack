/**
 * Job Stream API Route (SSE)
 *
 * GET /api/jobs/:id/stream - SSE endpoint for real-time updates
 *
 * @see /docs/designs/api/TECH_DESIGN.md
 */

import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDatabaseClient } from "@/lib/db";
import {
  createSSEStream,
  createSSEHeaders,
  checkSSEConnectionLimit,
  trackSSEConnection,
} from "@/lib/api";
import type { ErrorResponse } from "@/types/api";

// =============================================================================
// GET /api/jobs/:id/stream - SSE endpoint for real-time updates
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  // Authenticate
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return new Response(
      JSON.stringify({
        error: "Unauthorized",
        code: "UNAUTHORIZED",
      } as ErrorResponse),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const { id: job_id } = await params;

  // Get user
  const db = getDatabaseClient();
  const user = await db.getUser(clerkId);
  if (!user) {
    return new Response(
      JSON.stringify({
        error: "User not found",
        code: "NOT_FOUND",
      } as ErrorResponse),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Check SSE connection limit (5 per user)
  if (!checkSSEConnectionLimit(user.user_id)) {
    return new Response(
      JSON.stringify({
        error: "Too many SSE connections",
        code: "RATE_LIMIT_EXCEEDED",
        details: { maxConnections: 5 },
      } as ErrorResponse),
      {
        status: 429,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Get job
  const job = await db.getJob(job_id);
  if (!job) {
    return new Response(
      JSON.stringify({
        error: "Job not found",
        code: "NOT_FOUND",
      } as ErrorResponse),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Verify ownership
  if (job.user_id !== user.user_id) {
    return new Response(
      JSON.stringify({
        error: "Job not found",
        code: "NOT_FOUND",
      } as ErrorResponse),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Track SSE connection (returns cleanup function)
  const cleanupConnection = trackSSEConnection(user.user_id);

  // Create SSE stream
  const { readable, send, close } = createSSEStream();

  // Subscribe to orchestration events
  let unsubscribe: (() => void) | undefined;

  try {
    const { OrchestrationEngine } = await import("@/lib/orchestration");
    const orchestration = OrchestrationEngine.getInstance();

    // Send initial job status
    send({
      type:
        job.status === "planning"
          ? "job:planning"
          : job.status === "executing"
            ? "job:executing"
            : job.status === "completed"
              ? "job:completed"
              : job.status === "failed"
                ? "job:failed"
                : "job:started",
      data: { job_id: job.job_id },
      timestamp: new Date().toISOString(),
    });

    // Subscribe to orchestration events for this job
    unsubscribe = orchestration.subscribe(job_id, (event) => {
      send({
        type: event.type,
        data: event.data,
        timestamp: new Date().toISOString(),
      });
    });
  } catch {
    // OrchestrationEngine not available yet - send status and continue with heartbeat only
    send({
      type:
        job.status === "completed"
          ? "job:completed"
          : job.status === "failed"
            ? "job:failed"
            : "job:started",
      data: { job_id: job.job_id },
      timestamp: new Date().toISOString(),
    });
  }

  // Heartbeat every 30 seconds
  const heartbeat = setInterval(() => {
    send({
      type: "heartbeat",
      data: { timestamp: new Date().toISOString() },
      timestamp: new Date().toISOString(),
    });
  }, 30000);

  // Cleanup on disconnect (handled by AbortSignal)
  request.signal.addEventListener("abort", () => {
    clearInterval(heartbeat);
    if (unsubscribe) {
      unsubscribe();
    }
    cleanupConnection();
    close();
  });

  return new Response(readable, {
    headers: createSSEHeaders(),
  });
}
