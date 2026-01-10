/**
 * Agent Discovery Module
 *
 * Handles agent capability embedding and vector search.
 * Uses Voyage AI for embeddings and MongoDB Atlas Vector Search.
 *
 * @see /docs/ORCH_DISCOVERY.md
 * @see /docs/designs/core-data-structure/TECH_DESIGN.md
 */

import { VoyageAIClient } from "voyageai";
import { getAgentsCollection, getDatabaseClient } from "@/lib/db";
import type { Agent } from "@/types";

let voyageClient: VoyageAIClient | null = null;

function getVoyageClient(): VoyageAIClient {
  if (!voyageClient) {
    voyageClient = new VoyageAIClient({
      apiKey: process.env.VOYAGE_API_KEY,
    });
  }
  return voyageClient;
}

/**
 * Generate embedding for capabilities text.
 * @param capabilities - Capabilities description string
 * @returns 1024-dimensional embedding vector
 */
export async function embedCapabilities(capabilities: string): Promise<number[]> {
  const client = getVoyageClient();

  const response = await client.embed({
    input: [capabilities],
    model: "voyage-3",
  });

  return response.data?.[0]?.embedding ?? [];
}

/**
 * Search result from agent discovery.
 */
export interface AgentDiscoveryResult {
  agent: Agent;
  score: number;
}

/**
 * Discover agents matching required capabilities using vector search.
 *
 * @param query - Natural language description of required capabilities
 * @param limit - Maximum number of agents to return
 * @returns Array of agents with similarity scores
 */
export async function discoverAgents(
  query: string,
  limit: number = 5
): Promise<AgentDiscoveryResult[]> {
  const embedding = await embedCapabilities(query);
  const agents = await getAgentsCollection();

  // Vector search using MongoDB Atlas
  // Index: agent_capabilities_vector (defined in TECH_DESIGN.md)
  const pipeline = [
    {
      $vectorSearch: {
        index: "agent_capabilities_vector",
        path: "capabilities_embedding",
        queryVector: embedding,
        numCandidates: limit * 10,
        limit,
      },
    },
    {
      $addFields: {
        score: { $meta: "vectorSearchScore" },
      },
    },
  ];

  const results = await agents
    .aggregate<Agent & { score: number }>(pipeline)
    .toArray();

  return results.map((result) => ({
    agent: {
      agent_id: result.agent_id,
      name: result.name,
      url: result.url,
      pricing: result.pricing,
      capabilities: result.capabilities,
      capabilities_embedding: result.capabilities_embedding,
      wallet: result.wallet,
      stats: result.stats,
      supports_async: result.supports_async,
      supports_callback: result.supports_callback,
      registered_at: result.registered_at,
    },
    score: result.score,
  }));
}

/**
 * Update an agent's capability embedding.
 *
 * @param agent_id - Agent ID
 */
export async function updateAgentEmbedding(agent_id: string): Promise<void> {
  const db = getDatabaseClient();
  const agent = await db.getAgent(agent_id);

  if (!agent) {
    throw new Error(`Agent not found: ${agent_id}`);
  }

  const embedding = await embedCapabilities(agent.capabilities);
  const agents = await getAgentsCollection();

  await agents.updateOne(
    { agent_id },
    {
      $set: {
        capabilities_embedding: embedding,
      },
    }
  );
}
