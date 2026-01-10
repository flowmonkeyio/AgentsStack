/**
 * Work Item API Route
 *
 * GET /api/jobs/:id/work/:workId - Get full output content for a specific work item (lazy loading)
 *
 * @see /docs/designs/api/TECH_DESIGN.md
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDatabaseClient } from "@/lib/db";
import { createContext, createLogger } from "@/lib/logging";
import type { GetWorkItemResponse, ErrorResponse } from "@/types/api";

const logger = createLogger("api");

// =============================================================================
// GET /api/jobs/:id/work/:workId - Get full work item content
// =============================================================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; workId: string }> }
): Promise<NextResponse<GetWorkItemResponse | ErrorResponse>> {
  const ctx = createContext();
  const { id: job_id, workId: work_id } = await params;
  logger.info(ctx, `operation=get_work_item job_id=${job_id} work_id=${work_id} started=true`);

  try {
    // Authenticate
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      logger.info(ctx, `operation=get_work_item work_id=${work_id} status=unauthorized`);
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    // Get user
    const db = getDatabaseClient();
    const user = await db.getUser(clerkId);
    if (!user) {
      logger.info(ctx, `operation=get_work_item work_id=${work_id} status=user_not_found`);
      return NextResponse.json(
        { error: "User not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Get job to verify ownership
    const job = await db.getJob(job_id);
    if (!job) {
      logger.info(ctx, `operation=get_work_item work_id=${work_id} job_id=${job_id} status=job_not_found`);
      return NextResponse.json(
        { error: "Job not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Verify ownership
    if (job.user_id !== user.user_id) {
      logger.info(ctx, `operation=get_work_item work_id=${work_id} status=forbidden`);
      return NextResponse.json(
        { error: "Job not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Get work item
    const workItem = await db.getWorkItem(work_id);
    if (!workItem) {
      logger.info(ctx, `operation=get_work_item work_id=${work_id} status=not_found`);
      return NextResponse.json(
        { error: "Work item not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Verify work item belongs to this job
    if (workItem.job_id !== job_id) {
      logger.info(ctx, `operation=get_work_item work_id=${work_id} status=wrong_job`);
      return NextResponse.json(
        { error: "Work item not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Build response per design spec
    const response: GetWorkItemResponse = {
      work_id: workItem.work_id,
      action_item_id: workItem.action_item_id,
      status: workItem.status,
      action: {
        item: workItem.action.item,
        deliverable_id: workItem.action.deliverable_id,
        requirements: workItem.action.requirements,
      },
      output: workItem.output
        ? {
            title: workItem.output.title,
            description: workItem.output.description,
            content: workItem.output.content, // Full content
          }
        : null,
      verification: workItem.verification
        ? {
            score: workItem.verification.score,
            passed:
              workItem.verification.criteria_results.filter((c) => c.passed)
                .length === workItem.verification.criteria_results.length,
            criteria_results: workItem.verification.criteria_results.map(
              (c) => ({
                criterion: c.criterion,
                passed: c.passed,
              })
            ),
          }
        : null,
      payment: workItem.payment
        ? {
            status: workItem.payment.status,
            amount: workItem.payment.amount,
            tx_hash: workItem.payment.tx_hash,
          }
        : null,
    };

    logger.info(ctx, `operation=get_work_item work_id=${work_id} status=found item_status=${workItem.status}`);
    return NextResponse.json(response);
  } catch (error) {
    logger.error(ctx, `operation=get_work_item work_id=${work_id} status=failed`, error instanceof Error ? error : undefined);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
