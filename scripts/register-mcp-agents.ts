/**
 * Register MCP Agents Script
 *
 * Registers MCP-based external agents from the registry into the database.
 * This should be run on platform startup to ensure external agents are discoverable.
 *
 * Run with: npx tsx scripts/register-mcp-agents.ts
 * Requires: MONGODB_URI and VOYAGE_API_KEY in .env.local
 */

// Load env BEFORE any other imports
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { getMCPAgents, mcpAgentToAgent } = await import("../lib/agents/registry");
  const { getAgentsCollection } = await import("../lib/db");
  const { getDiscoveryService } = await import("../lib/orchestration/discovery/service");
  const { createContext } = await import("../lib/logging");

  console.log("╔════════════════════════════════════════╗");
  console.log("║  Registering MCP External Agents      ║");
  console.log("╚════════════════════════════════════════╝\n");

  const ctx = createContext();
  const mcpAgents = getMCPAgents();
  const agentsCollection = await getAgentsCollection();
  const discoveryService = getDiscoveryService();

  if (mcpAgents.length === 0) {
    console.log("⚠️  No MCP agents found in registry");
    return;
  }

  console.log(`Found ${mcpAgents.length} MCP agent(s) to register:\n`);

  for (const mcpAgent of mcpAgents) {
    try {
      console.log(`📝 Registering: ${mcpAgent.name} (${mcpAgent.agent_id})`);
      console.log(`   URL: ${mcpAgent.url}`);
      console.log(`   Protocol: ${mcpAgent.protocol}`);
      console.log(`   Capabilities: ${mcpAgent.capabilities.substring(0, 60)}...`);

      // Check if agent already exists
      const existing = await agentsCollection.findOne({ agent_id: mcpAgent.agent_id });

      if (existing) {
        console.log(`   ℹ️  Agent already registered, updating...`);

        // Embed capabilities for vector search
        const embeddingResult = await discoveryService.embedCapabilities(
          ctx,
          mcpAgent.capabilities
        );

        // Update existing agent
        await agentsCollection.updateOne(
          { agent_id: mcpAgent.agent_id },
          {
            $set: {
              name: mcpAgent.name,
              url: mcpAgent.url,
              pricing: mcpAgent.pricing,
              capabilities: mcpAgent.capabilities,
              capabilities_embedding: embeddingResult.embedding,
              supports_async: mcpAgent.supports_async,
              supports_callback: mcpAgent.supports_callback,
              wallet: mcpAgent.wallet,
            },
          }
        );

        console.log(`   ✅ Updated successfully\n`);
      } else {
        console.log(`   🆕 Creating new agent...`);

        // Embed capabilities for vector search
        const embeddingResult = await discoveryService.embedCapabilities(
          ctx,
          mcpAgent.capabilities
        );

        // Convert to Agent format
        const agent = mcpAgentToAgent(mcpAgent);

        // Insert with timestamp and embedding
        await agentsCollection.insertOne({
          ...agent,
          capabilities_embedding: embeddingResult.embedding,
          registered_at: new Date(),
        } as never);

        console.log(`   ✅ Registered successfully\n`);
      }
    } catch (error) {
      console.error(`   ❌ Failed to register ${mcpAgent.name}:`, error);
      console.error();
    }
  }

  console.log("═══════════════════════════════════════");
  console.log("✅ MCP agent registration complete!");
  console.log("═══════════════════════════════════════\n");

  process.exit(0);
}

main().catch((error) => {
  console.error("❌ Registration failed:", error.message);
  console.error(error);
  process.exit(1);
});
