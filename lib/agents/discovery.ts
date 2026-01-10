import { VoyageAIClient } from "voyageai";
import { getAgentsCollection } from "@/lib/db";
import type { Agent, AgentSearchResult } from "@/types/agent";

let voyageClient: VoyageAIClient | null = null;

function getVoyageClient(): VoyageAIClient {
  if (!voyageClient) {
    voyageClient = new VoyageAIClient({
      apiKey: process.env.VOYAGE_API_KEY,
    });
  }
  return voyageClient;
}

export async function embedCapabilities(capabilities: string[]): Promise<number[]> {
  const client = getVoyageClient();
  const text = capabilities.join(", ");

  const response = await client.embed({
    input: [text],
    model: "voyage-3",
  });

  return response.data?.[0]?.embedding ?? [];
}

export async function discoverAgents(
  requiredCapabilities: string[],
  limit: number = 5
): Promise<AgentSearchResult[]> {
  const embedding = await embedCapabilities(requiredCapabilities);
  const agents = await getAgentsCollection();

  // Vector search using MongoDB Atlas
  const pipeline = [
    {
      $vectorSearch: {
        index: "capability_index",
        path: "capabilityEmbedding",
        queryVector: embedding,
        numCandidates: limit * 10,
        limit,
      },
    },
    {
      $match: {
        status: "active",
      },
    },
    {
      $addFields: {
        score: { $meta: "vectorSearchScore" },
      },
    },
  ];

  const results = await agents.aggregate<Agent & { score: number }>(pipeline).toArray();

  return results.map((agent) => ({
    agent,
    score: agent.score,
    matchedCapabilities: agent.capabilities.filter((cap) =>
      requiredCapabilities.some(
        (req) => cap.toLowerCase().includes(req.toLowerCase())
      )
    ),
  }));
}

export async function updateAgentEmbedding(agentId: string): Promise<void> {
  const agents = await getAgentsCollection();
  const agent = await agents.findOne({ _id: new (await import("mongodb")).ObjectId(agentId) });

  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  const embedding = await embedCapabilities(agent.capabilities);

  await agents.updateOne(
    { _id: agent._id },
    {
      $set: {
        capabilityEmbedding: embedding,
        updatedAt: new Date(),
      },
    }
  );
}
