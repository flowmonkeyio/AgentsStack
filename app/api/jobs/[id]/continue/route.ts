/**
 * Continue Job API Route
 *
 * POST /api/jobs/:id/continue - Continue a job with user feedback
 *
 * @see /docs/designs/api/TECH_DESIGN.md
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDatabaseClient } from "@/lib/db";
import { rateLimiters, validateContinueJobRequest } from "@/lib/api";
import { createContext, createLogger } from "@/lib/logging";
import type {
  ContinueJobRequest,
  ContinueJobResponse,
  ErrorResponse,
} from "@/types/api";

const logger = createLogger("api");

// =============================================================================
// POST /api/jobs/:id/continue - Continue job with user feedback
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ContinueJobResponse | ErrorResponse>> {
  const ctx = createContext();
  const { id: job_id } = await params;
  logger.info(ctx, `operation=continue_job job_id=${job_id} started=true`);

  try {
    // Authenticate
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      logger.info(ctx, `operation=continue_job job_id=${job_id} status=unauthorized`);
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    // Get user
    const db = getDatabaseClient();
    const user = await db.getUser(clerkId);
    if (!user) {
      logger.info(ctx, `operation=continue_job job_id=${job_id} status=user_not_found`);
      return NextResponse.json(
        { error: "User not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Rate limit
    const rateResult = await rateLimiters.continueJob(request, user.user_id);
    if (!rateResult.allowed) {
      logger.info(ctx, `operation=continue_job job_id=${job_id} user_id=${user.user_id} status=rate_limited`);
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          code: "RATE_LIMIT_EXCEEDED",
          details: {
            retryAfter: Math.ceil(
              (rateResult.resetAt.getTime() - Date.now()) / 1000
            ),
          },
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(
              Math.ceil((rateResult.resetAt.getTime() - Date.now()) / 1000)
            ),
          },
        }
      );
    }

    // Get job
    const job = await db.getJob(job_id);
    if (!job) {
      logger.info(ctx, `operation=continue_job job_id=${job_id} status=not_found`);
      return NextResponse.json(
        { error: "Job not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Verify ownership
    if (job.user_id !== user.user_id) {
      logger.info(ctx, `operation=continue_job job_id=${job_id} status=forbidden`);
      return NextResponse.json(
        { error: "Job not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Check if job can be continued (must be completed or failed)
    if (job.status !== "completed" && job.status !== "failed") {
      logger.info(ctx, `operation=continue_job job_id=${job_id} current_status=${job.status} status=invalid_state`);
      return NextResponse.json(
        {
          error: "Job cannot be continued in current state",
          code: "JOB_COMPLETED",
          details: { status: job.status },
        },
        { status: 409 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validation = validateContinueJobRequest(body);
    if (!validation.success) {
      logger.info(ctx, `operation=continue_job job_id=${job_id} status=invalid_input`);
      return NextResponse.json(
        {
          error: "Invalid input",
          code: "INVALID_INPUT",
          details: validation.errors,
        },
        { status: 400 }
      );
    }

    const input: ContinueJobRequest = validation.data;
    const feedbackLength = input.prompt?.length || 0;

    // Continue job via OrchestrationEngine
    const { OrchestrationEngine } = await import("@/lib/orchestration");
    const orchestration = OrchestrationEngine.getInstance();
    const result = await orchestration.continueJob(ctx, {
      job_id: job_id,
      prompt: input.prompt,
    });

    // Return response per design spec
    const response: ContinueJobResponse = {
      job_id: job_id,
      version: result.version,
      status: "planning",
      stream_url: `/api/jobs/${job_id}/stream`,
    };

    logger.info(ctx, `operation=continue_job job_id=${job_id} feedback_length=${feedbackLength} version=${result.version} status=continued`);
    return NextResponse.json(response);
  } catch (error) {
    logger.error(ctx, `operation=continue_job job_id=${job_id} status=failed`, error instanceof Error ? error : undefined);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
