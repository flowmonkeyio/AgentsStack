/**
 * Agent Executor Module
 *
 * Handles execution of external agents with x402 payment protocol.
 *
 * @see /docs/MODULE_EXTERNAL_AGENTS.md
 * @see /docs/designs/core-data-structure/TECH_DESIGN.md
 */

import type { Agent, AgentUsage } from "@/types";

export interface ExecutionParams {
  agent: Agent;
  prompt: string;
  timeout?: number;
}

/**
 * Output from agent execution.
 * Matches WorkItem.output schema.
 */
export interface AgentOutput {
  title: string;
  description: string;
  content: unknown;
}

export interface ExecutionResult {
  success: boolean;
  output?: AgentOutput;
  usage?: AgentUsage;
  reference_id?: string; // For async agents
  status_url?: string; // For polling
  error?: string;
}

/**
 * Execute an external agent synchronously.
 *
 * @param params - Execution parameters
 * @returns Execution result with output and usage
 */
export async function executeAgent(params: ExecutionParams): Promise<ExecutionResult> {
  const { agent, prompt, timeout = 60000 } = params;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(agent.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // x402 payment headers will be added by payment integration
      },
      body: JSON.stringify({ prompt }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        success: false,
        error: `Agent returned status ${response.status}: ${await response.text()}`,
      };
    }

    const data = await response.json();

    // Check for async response (202 Accepted)
    if (response.status === 202) {
      return {
        success: true,
        reference_id: data.reference_id,
        status_url: data.status_url,
      };
    }

    return {
      success: true,
      output: {
        title: data.title ?? "Agent Output",
        description: data.description ?? "",
        content: data.output ?? data.content ?? data,
      },
      usage: data.usage
        ? {
            total_cost: data.usage.total_cost,
            model_usage: data.usage.model_usage,
          }
        : undefined,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === "AbortError") {
      return {
        success: false,
        error: `Execution timed out after ${timeout}ms`,
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown execution error",
    };
  }
}

/**
 * Poll an async agent for status.
 *
 * @param status_url - URL to poll for status
 * @returns Execution result (may still be pending)
 */
export async function pollAgentStatus(status_url: string): Promise<ExecutionResult> {
  try {
    const response = await fetch(status_url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Status poll returned ${response.status}: ${await response.text()}`,
      };
    }

    const data = await response.json();

    // Still processing
    if (data.status === "pending" || data.status === "processing") {
      return {
        success: false,
        error: "still_processing",
      };
    }

    // Completed
    if (data.status === "completed") {
      return {
        success: true,
        output: {
          title: data.title ?? "Agent Output",
          description: data.description ?? "",
          content: data.output ?? data.content ?? data,
        },
        usage: data.usage
          ? {
              total_cost: data.usage.total_cost,
              model_usage: data.usage.model_usage,
            }
          : undefined,
      };
    }

    // Failed
    return {
      success: false,
      error: data.error ?? "Agent execution failed",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown poll error",
    };
  }
}
