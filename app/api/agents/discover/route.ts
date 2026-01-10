/**
 * Agent Discovery API
 *
 * Endpoint for discovering agents by capability.
 *
 * @see /docs/ORCH_DISCOVERY.md
 */

import { NextRequest, NextResponse } from "next/server";
import { discoverAgents } from "@/lib/agents";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, limit = 5 } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "query string is required" },
        { status: 400 }
      );
    }

    const results = await discoverAgents(query, limit);

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Failed to discover agents:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
