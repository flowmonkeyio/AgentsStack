/**
 * Agent Registry
 *
 * Central registry for MCP-based and HTTP-based external agents.
 * This allows the platform to discover and use dockerized external agents.
 */

import type { Agent } from '@/types';

/**
 * MCP Agent Registration
 * For agents running in Docker containers with MCP protocol
 */
export interface MCPAgentRegistration {
  agent_id: string;
  name: string;
  description: string;

  // Connection details
  url: string; // HTTP endpoint (e.g., http://localhost:3001)
  protocol: 'http' | 'mcp'; // Protocol type

  // Capabilities
  capabilities: string;
  tags?: string[];

  // Pricing
  pricing: {
    base_price: number;
    negotiable: boolean;
    min_price?: number;
  };

  // Technical details
  supports_async: boolean;
  supports_callback: boolean;

  // Payment
  wallet: string;

  // Metadata
  version?: string;
  author?: string;
  container_name?: string; // Docker container name if applicable
}

/**
 * MCP-based external agents
 * These agents run in Docker containers and communicate via HTTP (MCP internally)
 */
export const MCP_AGENTS: MCPAgentRegistration[] = [
  {
    agent_id: 'mcp_image_gen_001',
    name: 'ImageGenerator (MCP)',
    description: 'MCP-based image generation using OpenRouter. Supports Gemini Image and FLUX models.',
    url: 'http://localhost:3001',
    protocol: 'http', // External interface is HTTP
    capabilities: 'hero images, social graphics, product mockups, illustrations, marketing visuals',
    tags: ['image', 'generation', 'mcp', 'openrouter'],
    pricing: {
      base_price: 0.08,
      negotiable: false,
    },
    supports_async: true,
    supports_callback: true,
    wallet: '0x0000000000000000000000000000000000000001',
    version: '1.0.0',
    author: 'AgentsStack',
    container_name: 'agentstack-image-gen-mcp',
  },
  // Add more MCP agents here as they're created
];

/**
 * Convert MCPAgentRegistration to Agent format (for database)
 */
export function mcpAgentToAgent(mcpAgent: MCPAgentRegistration): Omit<Agent, 'registered_at'> {
  return {
    agent_id: mcpAgent.agent_id,
    name: mcpAgent.name,
    url: mcpAgent.url,
    pricing: mcpAgent.pricing,
    capabilities: mcpAgent.capabilities,
    capabilities_embedding: [], // Will be populated by discovery service
    wallet: mcpAgent.wallet,
    stats: {
      jobs_completed: 0,
      avg_score: 0,
      avg_response_time_ms: 0,
    },
    supports_async: mcpAgent.supports_async,
    supports_callback: mcpAgent.supports_callback,
  };
}

/**
 * Get all registered MCP agents
 */
export function getMCPAgents(): MCPAgentRegistration[] {
  return MCP_AGENTS;
}

/**
 * Get MCP agent by ID
 */
export function getMCPAgentById(agentId: string): MCPAgentRegistration | undefined {
  return MCP_AGENTS.find((agent) => agent.agent_id === agentId);
}

/**
 * Check if agent is an MCP agent
 */
export function isMCPAgent(agentId: string): boolean {
  return agentId.startsWith('mcp_');
}
