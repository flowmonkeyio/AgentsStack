/**
 * Agent Webhook API Route
 *
 * POST /api/webhooks/work/:workId - Callback endpoint for external agents to report completion
 *
 * @see /docs/designs/api/TECH_DESIGN.md
 */

import { NextRequest, NextResponse } from "next/server";
import { getDatabaseClient } from "@/lib/db";
import { createContext, createLogger } from "@/lib/logging";
import type { AgentCallbackResponse, ErrorResponse } from "@/types/api";

const logger = createLogger("api");

// Agent callback request type (inline to avoid dependency on types/api.ts for webhook)
interface AgentCallbackRequest {
  reference_id: string;
  status: "completed" | "failed" | "progress";
  output?: unknown;
  error?: string;
  progress?: number;
  message?: string;
}

// =============================================================================
// POST /api/webhooks/work/:workId - External agent callback
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workId: string }> }
): Promise<NextResponse<AgentCallbackResponse | ErrorResponse>> {
  const ctx = createContext();
  const { workId } = await params;
  logger.info(ctx, `operation=webhook work_id=${workId} started=true`);

  try {
    // Parse request body
    let body: AgentCallbackRequest;
    try {
      body = await request.json();
    } catch {
      logger.info(ctx, `operation=webhook work_id=${workId} status=invalid_json`);
      return NextResponse.json(
        { error: "Invalid JSON body", code: "INVALID_INPUT" },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!body.reference_id) {
      logger.info(ctx, `operation=webhook work_id=${workId} status=missing_reference_id`);
      return NextResponse.json(
        {
          error: "Missing required field: reference_id",
          code: "INVALID_INPUT",
          details: { field: "reference_id" },
        },
        { status: 400 }
      );
    }

    if (!body.status) {
      logger.info(ctx, `operation=webhook work_id=${workId} status=missing_status`);
      return NextResponse.json(
        {
          error: "Missing required field: status",
          code: "INVALID_INPUT",
          details: { field: "status" },
        },
        { status: 400 }
      );
    }

    // Validate status value
    if (!["completed", "failed", "progress"].includes(body.status)) {
      logger.info(ctx, `operation=webhook work_id=${workId} status=invalid_status_value`);
      return NextResponse.json(
        {
          error: "Invalid status value",
          code: "INVALID_INPUT",
          details: {
            field: "status",
            allowed: ["completed", "failed", "progress"],
          },
        },
        { status: 400 }
      );
    }

    // Get work item to validate reference_id
    const db = getDatabaseClient();
    const workItem = await db.getWorkItem(workId);

    if (!workItem) {
      logger.info(ctx, `operation=webhook work_id=${workId} status=not_found`);
      return NextResponse.json(
        { error: "Work item not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Validate reference_id matches (security check)
    if (workItem.external_ref?.reference_id !== body.reference_id) {
      logger.info(ctx, `operation=webhook work_id=${workId} status=invalid_reference`);
      return NextResponse.json(
        { error: "Invalid reference_id", code: "INVALID_REFERENCE" },
        { status: 403 }
      );
    }

    // Forward to orchestration for processing
    try {
      const { OrchestrationEngine } = await import("@/lib/orchestration");
      const orchestration = OrchestrationEngine.getInstance();
      await orchestration.handleAgentCallback(ctx, workId, body);
    } catch (orchestrationError) {
      // Log error but don't fail the webhook - we've received the data
      logger.error(ctx, `operation=webhook work_id=${workId} orchestration_status=failed`, orchestrationError instanceof Error ? orchestrationError : undefined);
      // Continue to return success - the webhook was received
    }

    // Return success
    const response: AgentCallbackResponse = {
      received: true,
      work_id: workId,
    };

    logger.info(ctx, `operation=webhook work_id=${workId} callback_status=${body.status} status=received`);
    return NextResponse.json(response);
  } catch (error) {
    logger.error(ctx, `operation=webhook work_id=${workId} status=failed`, error instanceof Error ? error : undefined);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
