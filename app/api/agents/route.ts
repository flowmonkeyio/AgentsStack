import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAgentsCollection } from "@/lib/db";

export async function GET(request: NextRequest) {
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

    return NextResponse.json({ agents: agentList });
  } catch (error) {
    console.error("Failed to fetch agents:", error);
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
    const { name, description, capabilities, endpoint, pricing } = body;

    if (!name || !description || !capabilities || !endpoint) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const agents = await getAgentsCollection();

    const result = await agents.insertOne({
      name,
      description,
      capabilities,
      endpoint,
      pricing: pricing || { basePrice: 0, currency: "USDC" },
      status: "pending_review",
      metrics: {
        totalJobs: 0,
        successfulJobs: 0,
        failedJobs: 0,
        averageScore: 0,
        totalEarningsUsd: 0,
        averageExecutionTimeMs: 0,
      },
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const agent = await agents.findOne({ _id: result.insertedId });

    return NextResponse.json({ agent }, { status: 201 });
  } catch (error) {
    console.error("Failed to create agent:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
