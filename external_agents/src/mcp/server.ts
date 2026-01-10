/**
 * MCP Server Implementation
 *
 * Creates and manages the MCP server that exposes tools via stdio.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { MCPTool } from './types.js';
import { logger } from '../lib/logger.js';

/**
 * MCP Server wrapper
 */
export class MCPServer {
  private server: Server;
  private tools: Map<string, MCPTool> = new Map();

  constructor(name: string, version: string) {
    this.server = new Server(
      {
        name,
        version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * Register a tool with the server
   */
  registerTool(tool: MCPTool): void {
    this.tools.set(tool.definition.name, tool);
    logger.info({ toolName: tool.definition.name }, 'Registered MCP tool');
  }

  /**
   * Setup request handlers
   */
  private setupHandlers(): void {
    // Handle tools/list requests
    this.server.setRequestHandler(
      { method: 'tools/list' } as any,
      async () => {
        const tools = Array.from(this.tools.values()).map((tool) => tool.definition);
        logger.debug({ toolCount: tools.length }, 'Listing MCP tools');
        return { tools };
      }
    );

    // Handle tools/call requests
    this.server.setRequestHandler(
      { method: 'tools/call' } as any,
      async (request) => {
        const params = request.params as Record<string, unknown>;
        const name = params.name as string;
        const args = params.arguments;

        logger.info({ toolName: name }, 'MCP tool call received');

        const tool = this.tools.get(name);
        if (!tool) {
          logger.error({ toolName: name }, 'Unknown MCP tool');
          throw new Error(`Unknown tool: ${name}`);
        }

        try {
          const result = await tool.handler(args);
          logger.info({ toolName: name }, 'MCP tool call completed');
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          logger.error(
            { toolName: name, error: error instanceof Error ? error.message : 'Unknown error' },
            'MCP tool call failed'
          );
          throw error;
        }
      }
    );
  }

  /**
   * Start the MCP server with stdio transport
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('MCP server started with stdio transport');
  }

  /**
   * Close the server
   */
  async close(): Promise<void> {
    await this.server.close();
    logger.info('MCP server closed');
  }
}
