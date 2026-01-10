import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAgentsCollection } from "@/lib/db";
import { createLogger, createContext } from "@/lib/logging";
import { createDiscoveryService } from "@/lib/orchestration/discovery";
import { nanoid } from "nanoid";

const logger = createLogger("api.agents");

export async function GET(request: NextRequest) {
  const ctx = createContext();
  logger.info(ctx, "operation=list_agents started=true");

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status"); // null means all
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const agents = await getAgentsCollection();
    const query = status ? { status } : {}; // Empty query = all agents
    const agentList = await agents
      .find(query)
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

    // Generate agent_id
    const agent_id = `agent_${nanoid(12)}`;

    // Generate embedding for discovery (if Voyage AI is available)
    let capabilities_embedding: number[] | null = null;
    try {
      const discoveryService = createDiscoveryService();
      const embedResult = await discoveryService.embedCapabilities(ctx, capabilities);
      capabilities_embedding = embedResult.embedding;
      logger.info(ctx, `operation=embed_capabilities agent=${name} embedding_size=${capabilities_embedding.length}`);
    } catch (err) {
      logger.warn(ctx, `operation=embed_capabilities status=failed error="${err instanceof Error ? err.message : "unknown"}" - continuing without embedding`);
    }

    // Normalize pricing to support both formats
    const basePrice = pricing?.basePrice ?? pricing?.base_price ?? 0;

    const result = await agents.insertOne({
      agent_id,
      name,
      description,
      capabilities,
      endpoint,
      url: endpoint, // Alias for dispatch compatibility
      wallet: wallet || "",
      // Pricing - both formats for compatibility
      pricing: {
        basePrice,
        base_price: basePrice,
        currency: pricing?.currency || "USDC",
        negotiable: pricing?.negotiable ?? false,
      },
      status: "pending_review",
      // Metrics - both formats for compatibility
      metrics: {
        totalJobs: 0,
        successfulJobs: 0,
        failedJobs: 0,
        averageScore: 0.85, // Start with decent score so discovery finds it
        totalEarningsUsd: 0,
        averageExecutionTimeMs: 0,
      },
      // Stats format for discovery
      stats: {
        total_jobs: 0,
        successful_jobs: 0,
        avg_score: 0.85, // Start with decent score so discovery finds it
        jobs_completed: 0,
      },
      // Embedding for vector search
      capabilities_embedding,
      supportsAsync: true,
      supports_async: true,
      supportsCallback: true,
      supports_callback: true,
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
