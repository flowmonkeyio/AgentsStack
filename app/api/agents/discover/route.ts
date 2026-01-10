import { NextRequest, NextResponse } from "next/server";
import { discoverAgents } from "@/lib/agents";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { capabilities, limit = 5 } = body;

    if (!capabilities || !Array.isArray(capabilities)) {
      return NextResponse.json(
        { error: "capabilities array is required" },
        { status: 400 }
      );
    }

    const results = await discoverAgents(capabilities, limit);

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Failed to discover agents:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
