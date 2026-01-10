/**
 * Jobs API Routes
 *
 * Placeholder - to be implemented following MODULE_API design.
 * @see /docs/MODULE_API.md
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDatabaseClient } from "@/lib/db";
import type { Job } from "@/types";
import { nanoid } from "nanoid";

export async function GET() {
  try {
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getDatabaseClient();
    const user = await db.getUser(clerkId);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // TODO: Implement getJobsByUser in DatabaseClient
    return NextResponse.json({ jobs: [] });
  } catch (error) {
    console.error("Failed to fetch jobs:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { prompt, budget_total } = body;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    const db = getDatabaseClient();
    const user = await db.getUser(clerkId);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const job = await db.createJob({
      job_id: nanoid(),
      user_id: user.user_id,
      status: "planning",
      prompt,
      budget: {
        total: budget_total || 0,
        allocated: 0,
        spent: 0,
        remaining: budget_total || 0,
      },
      token_usage: {
        operations: [],
        external_costs: [],
        total_internal_cost_usd: 0,
        total_external_cost_usd: 0,
        total_cost_usd: 0,
      },
      current_plan_id: "",
      plan_version: 0,
      context_summary: "",
      context_refs: [],
      reasoning_log: [],
      versions: [],
      last_checkpoint: {
        timestamp: new Date(),
        action_item_id: 0,
        status: "planning",
      },
    });

    // TODO: Trigger orchestration graph

    return NextResponse.json({ job }, { status: 201 });
  } catch (error) {
    console.error("Failed to create job:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
