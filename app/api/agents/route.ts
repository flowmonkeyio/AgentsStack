import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAgentsCollection } from "@/lib/db";
import { createLogger, createContext } from "@/lib/logging";

const logger = createLogger("api.agents");

export async function GET(request: NextRequest) {
  const ctx = createContext();
  logger.info(ctx, "operation=list_agents started=true");

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "active";
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const agents = await getAgentsCollection();
    const agentList = await agents
      .find({ status })
      .sort({ "metrics.averageScore": -1 })
      .limit(limit)
      .toArray();

    logger.info(ctx, `operation=list_agents status=success count=${agentList.length}`);

    return NextResponse.json({ agents: agentList });
  } catch (error) {
    logger.error(ctx, "operation=list_agents status=error", error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const ctx = createContext();
  logger.info(ctx, "operation=create_agent started=true");

  try {
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      logger.info(ctx, "operation=create_agent status=unauthorized");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, capabilities, endpoint, pricing, wallet } = body;

    if (!name || !description || !capabilities || !endpoint) {
      logger.info(ctx, "operation=create_agent status=validation_error");
      return NextResponse.json(
        { error: "Missing required fields: name, description, capabilities, endpoint" },
        { status: 400 }
      );
    }

    const agents = await getAgentsCollection();

    const result = await agents.insertOne({
      name,
      description,
      capabilities,
      endpoint,
      wallet: wallet || "",
      pricing: pricing || { basePrice: 0, currency: "USDC", negotiable: false },
      status: "pending_review",
      metrics: {
        totalJobs: 0,
        successfulJobs: 0,
        failedJobs: 0,
        averageScore: 0,
        totalEarningsUsd: 0,
        averageExecutionTimeMs: 0,
      },
      supportsAsync: false,
      supportsCallback: false,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const agent = await agents.findOne({ _id: result.insertedId });

    logger.info(ctx, `operation=create_agent status=success agent_id=${result.insertedId}`);

    return NextResponse.json({ agent }, { status: 201 });
  } catch (error) {
    logger.error(ctx, "operation=create_agent status=error", error as Error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
