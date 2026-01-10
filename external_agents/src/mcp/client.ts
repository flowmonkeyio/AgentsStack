/**
 * MCP Client Wrapper
 *
 * Provides a clean interface for calling MCP tools from the HTTP layer.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn, type ChildProcess } from 'child_process';
import { logger } from '../lib/logger.js';

/**
 * MCP Client configuration
 */
export interface MCPClientConfig {
  /** Command to spawn MCP server */
  command: string;

  /** Arguments for the command */
  args?: string[];

  /** Environment variables */
  env?: Record<string, string>;

  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * MCP Client wrapper
 */
export class MCPClient {
  private client: Client | null = null;
  private serverProcess: ChildProcess | null = null;
  private config: MCPClientConfig;

  constructor(config: MCPClientConfig) {
    this.config = {
      timeout: 300000, // 5 minutes default
      ...config,
    };
  }

  /**
   * Connect to MCP server
   */
  async connect(): Promise<void> {
    try {
      // Spawn MCP server process
      this.serverProcess = spawn(this.config.command, this.config.args ?? [], {
        env: { ...process.env, ...this.config.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Handle server process errors
      this.serverProcess.on('error', (error) => {
        logger.error({ error: error.message }, 'MCP server process error');
      });

      this.serverProcess.stderr?.on('data', (data) => {
        logger.debug({ stderr: data.toString() }, 'MCP server stderr');
      });

      // Create transport
      const transport = new StdioClientTransport({
        command: this.config.command,
        args: this.config.args,
        env: this.config.env,
      });

      // Create and connect client
      this.client = new Client(
        {
          name: 'agentstack-http-client',
          version: '1.0.0',
        },
        {
          capabilities: {},
        }
      );

      await this.client.connect(transport);
      logger.info('MCP client connected');
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'Failed to connect MCP client'
      );
      throw error;
    }
  }

  /**
   * Call an MCP tool
   */
  async callTool<TInput = unknown, TOutput = unknown>(
    toolName: string,
    args: TInput
  ): Promise<TOutput> {
    if (!this.client) {
      throw new Error('MCP client not connected');
    }

    try {
      logger.debug({ toolName, args }, 'Calling MCP tool');

      const result = await this.client.request(
        {
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: args,
          },
        } as any,
        {} as any
      );

      logger.debug({ toolName }, 'MCP tool call completed');

      // Parse the result from the content
      if (result.content && Array.isArray(result.content) && result.content[0]) {
        const content = result.content[0];
        if (content.type === 'text') {
          return JSON.parse(content.text) as TOutput;
        }
      }

      throw new Error('Invalid MCP response format');
    } catch (error) {
      logger.error(
        {
          toolName,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'MCP tool call failed'
      );
      throw error;
    }
  }

  /**
   * List available tools
   */
  async listTools(): Promise<Array<{ name: string; description: string }>> {
    if (!this.client) {
      throw new Error('MCP client not connected');
    }

    try {
      const result = await this.client.request(
        {
          method: 'tools/list',
        } as any,
        {} as any
      );

      return result.tools ?? [];
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'Failed to list MCP tools'
      );
      throw error;
    }
  }

  /**
   * Disconnect from MCP server
   */
  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.close();
        this.client = null;
      }

      if (this.serverProcess) {
        this.serverProcess.kill();
        this.serverProcess = null;
      }

      logger.info('MCP client disconnected');
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error' },
        'Error disconnecting MCP client'
      );
    }
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.client !== null;
  }
}
