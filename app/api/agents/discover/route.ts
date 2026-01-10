/**
 * Agent Discovery API
 *
 * Endpoint for discovering agents by capability.
 *
 * @see /docs/ORCH_DISCOVERY.md
 */

import { NextRequest, NextResponse } from "next/server";
import { discoverAgents } from "@/lib/agents";
import { createContext, createLogger } from "@/lib/logging";

const logger = createLogger("api");

export async function POST(request: NextRequest) {
  const ctx = createContext();
  logger.info(ctx, "operation=discover_agents started=true");

  try {
    const body = await request.json();
    const { query, limit = 5 } = body;

    if (!query || typeof query !== "string") {
      logger.info(ctx, "operation=discover_agents status=invalid_input");
      return NextResponse.json(
        { error: "query string is required" },
        { status: 400 }
      );
    }

    const results = await discoverAgents(ctx, query, limit);

    logger.info(ctx, `operation=discover_agents query_length=${query.length} results_count=${results.length} status=success`);
    return NextResponse.json({ results });
  } catch (error) {
    logger.error(ctx, "operation=discover_agents status=failed", error instanceof Error ? error : undefined);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
