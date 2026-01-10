/**
 * Jobs API Routes
 *
 * POST /api/jobs - Create a new job
 * GET /api/jobs - List user's jobs
 *
 * @see /docs/designs/api/TECH_DESIGN.md
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDatabaseClient } from "@/lib/db";
import { rateLimiters, validateCreateJobRequest } from "@/lib/api";
import { createContext, createLogger } from "@/lib/logging";
import type {
  CreateJobRequest,
  CreateJobResponse,
  ErrorResponse,
} from "@/types/api";

const logger = createLogger("api");

// =============================================================================
// POST /api/jobs - Create a new job
// =============================================================================

export async function POST(
  request: NextRequest
): Promise<NextResponse<CreateJobResponse | ErrorResponse>> {
  const ctx = createContext();
  logger.info(ctx, "operation=create_job started=true");

  try {
    // Authenticate
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      logger.info(ctx, "operation=create_job status=unauthorized");
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    // Get user
    const db = getDatabaseClient();
    const user = await db.getUser(clerkId);
    if (!user) {
      logger.info(ctx, "operation=create_job status=user_not_found");
      return NextResponse.json(
        { error: "User not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Rate limit
    const rateResult = await rateLimiters.createJob(request, user.user_id);
    if (!rateResult.allowed) {
      logger.info(ctx, `operation=create_job user_id=${user.user_id} status=rate_limited`);
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
            "X-RateLimit-Remaining": String(rateResult.remaining),
            "X-RateLimit-Reset": rateResult.resetAt.toISOString(),
          },
        }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validation = validateCreateJobRequest(body);
    if (!validation.success) {
      logger.info(ctx, "operation=create_job status=invalid_input");
      return NextResponse.json(
        {
          error: "Invalid input",
          code: "INVALID_INPUT",
          details: validation.errors,
        },
        { status: 400 }
      );
    }

    const input: CreateJobRequest = validation.data;

    // Create job via OrchestrationEngine (NOT direct DB call)
    // Import dynamically to avoid circular dependencies and allow for lazy loading
    const { OrchestrationEngine } = await import("@/lib/orchestration");
    const orchestration = OrchestrationEngine.getInstance();
    const job = await orchestration.startJob(ctx, {
      user_id: user.user_id,
      prompt: input.prompt,
      budget: input.budget,
      context: input.context,
    });

    // Return response per design spec
    const response: CreateJobResponse = {
      job_id: job.job_id,
      status: "planning",
      stream_url: `/api/jobs/${job.job_id}/stream`,
    };

    logger.info(ctx, `operation=create_job job_id=${job.job_id} status=created`);
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    logger.error(ctx, "operation=create_job status=failed", error instanceof Error ? error : undefined);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

// =============================================================================
// GET /api/jobs - List user's jobs
// =============================================================================

interface ListJobsResponse {
  jobs: Array<{
    job_id: string;
    status: string;
    prompt: string;
    created_at: string;
  }>;
}

export async function GET(): Promise<
  NextResponse<ListJobsResponse | ErrorResponse>
> {
  const ctx = createContext();
  logger.info(ctx, "operation=list_jobs started=true");

  try {
    // Authenticate
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      logger.info(ctx, "operation=list_jobs status=unauthorized");
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    // Get user
    const db = getDatabaseClient();
    const user = await db.getUser(clerkId);
    if (!user) {
      logger.info(ctx, "operation=list_jobs status=user_not_found");
      return NextResponse.json(
        { error: "User not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Get jobs for user
    // Note: This requires a getJobsByUser method which may need to be added to DatabaseClient
    // For now, using direct collection access as a temporary measure
    const { getJobsCollection } = await import("@/lib/db");
    const jobsCollection = await getJobsCollection();
    const jobs = await jobsCollection
      .find({ user_id: user.user_id })
      .sort({ created_at: -1 })
      .toArray();

    const response: ListJobsResponse = {
      jobs: jobs.map((job) => ({
        job_id: job.job_id,
        status: job.status,
        prompt: job.prompt,
        created_at: job.created_at.toISOString(),
      })),
    };

    logger.info(ctx, `operation=list_jobs user_id=${user.user_id} count=${jobs.length} status=success`);
    return NextResponse.json(response);
  } catch (error) {
    logger.error(ctx, "operation=list_jobs status=failed", error instanceof Error ? error : undefined);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
