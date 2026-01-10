/**
 * Single Job API Route
 *
 * GET /api/jobs/:id - Get job details and current state
 *
 * @see /docs/designs/api/TECH_DESIGN.md
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDatabaseClient } from "@/lib/db";
import { rateLimiters } from "@/lib/api";
import { createContext, createLogger } from "@/lib/logging";
import type { GetJobResponse, ErrorResponse } from "@/types/api";
import type { ReasoningEntry } from "@/types/data";

const logger = createLogger("api");

// =============================================================================
// GET /api/jobs/:id - Get job details
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<GetJobResponse | ErrorResponse>> {
  const ctx = createContext();
  const { id: job_id } = await params;
  logger.info(ctx, `operation=get_job job_id=${job_id} started=true`);

  try {
    // Authenticate
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      logger.info(ctx, `operation=get_job job_id=${job_id} status=unauthorized`);
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    // Get user
    const db = getDatabaseClient();
    const user = await db.getUser(clerkId);
    if (!user) {
      logger.info(ctx, `operation=get_job job_id=${job_id} status=user_not_found`);
      return NextResponse.json(
        { error: "User not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Rate limit
    const rateResult = await rateLimiters.getJob(request, user.user_id);
    if (!rateResult.allowed) {
      logger.info(ctx, `operation=get_job job_id=${job_id} user_id=${user.user_id} status=rate_limited`);
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
      logger.info(ctx, `operation=get_job job_id=${job_id} status=not_found`);
      return NextResponse.json(
        { error: "Job not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Verify ownership
    if (job.user_id !== user.user_id) {
      logger.info(ctx, `operation=get_job job_id=${job_id} status=forbidden`);
      return NextResponse.json(
        { error: "Job not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Get current plan
    const plan = job.current_plan_id
      ? await db.getPlan(job.current_plan_id)
      : null;

    // Get work items for this job
    const workItems = await db.getWorkItemsByJob(job_id);

    // Build response per design spec
    const response: GetJobResponse = {
      job_id: job.job_id,
      status: job.status,
      prompt: job.prompt,
      budget: {
        total: job.budget.total,
        allocated: job.budget.allocated,
        spent: job.budget.spent,
        remaining: job.budget.remaining,
      },
      plan_version: job.plan_version,
      context_summary: job.context_summary,

      // Action items from current plan
      action_items: plan
        ? plan.action_items.map((item) => ({
            id: item.id,
            item: item.item,
            priority: item.priority,
            depends_on: item.depends_on,
            status: item.status,
            agent_id: item.agent_id,
            template_id: item.template_id,
          }))
        : [],

      // Work items with output summary (content lazy-loaded)
      work_items: workItems.map((work) => ({
        work_id: work.work_id,
        action_item_id: work.action_item_id,
        status: work.status,
        action: work.action.item,
        output: work.output
          ? {
              title: work.output.title,
              description: work.output.description,
              content: work.output.content, // Full content included, lazy-load via work/:workId if needed
            }
          : undefined,
        verification: work.verification
          ? {
              score: work.verification.score,
              passed:
                work.verification.criteria_results.filter((c) => c.passed)
                  .length === work.verification.criteria_results.length,
            }
          : undefined,
      })),

      // Version history
      versions: job.versions.map((v) => ({
        version: v.version,
        completed_at: v.completed_at.toISOString(),
        work_ids: v.work_ids,
      })),

      // Latest N reasoning entries
      reasoning_log: job.reasoning_log.slice(-20).map(
        (entry): ReasoningEntry => ({
          ts: entry.ts,
          agent: entry.agent,
          step: entry.step,
          thought: entry.thought,
          decision: entry.decision,
        })
      ),
    };

    logger.info(ctx, `operation=get_job job_id=${job_id} status=found work_items_count=${workItems.length}`);
    return NextResponse.json(response);
  } catch (error) {
    logger.error(ctx, `operation=get_job job_id=${job_id} status=failed`, error instanceof Error ? error : undefined);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
