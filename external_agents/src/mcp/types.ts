/**
 * MCP-Specific Types
 *
 * Type definitions for MCP tool definitions and handlers.
 */

// =============================================================================
// JSON Schema Type
// =============================================================================

/**
 * JSON Schema type (compatible with MCP SDK)
 */
export type JSONSchema = {
  type?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: string[];
  description?: string;
  minimum?: number;
  maximum?: number;
  [key: string]: unknown;
};

// =============================================================================
// Tool Definition Types
// =============================================================================

/**
 * MCP tool definition
 */
export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema;
}

/**
 * MCP tool handler function
 */
export type MCPToolHandlerFn<TInput = unknown, TOutput = unknown> = (
  input: TInput
) => Promise<TOutput>;

/**
 * MCP tool with definition and handler
 */
export interface MCPTool<TInput = unknown, TOutput = unknown> {
  definition: MCPToolDefinition;
  handler: MCPToolHandlerFn<TInput, TOutput>;
}

// =============================================================================
// Tool Input/Output Types
// =============================================================================

/**
 * Input for generate_image tool
 */
export interface GenerateImageInput {
  /** Text prompt for image generation */
  prompt: string;

  /** Image width in pixels (default: 1024) */
  width?: number;

  /** Image height in pixels (default: 1024) */
  height?: number;

  /** Model to use (default: configured default) */
  model?: string;
}

/**
 * Output from generate_image tool
 */
export interface GenerateImageOutput {
  /** Whether generation was successful */
  success: boolean;

  /** URL to generated image (if successful) */
  image_url?: string;

  /** Image width in pixels */
  width?: number;

  /** Image height in pixels */
  height?: number;

  /** Image format (png, jpg, etc.) */
  format?: string;

  /** Model used for generation */
  model_used?: string;

  /** Cost in USD */
  cost_usd?: number;

  /** Error message (if failed) */
  error?: string;

  /** Token usage details */
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}
