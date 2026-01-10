import type { Agent, WorkItemResult } from "@/types";

export interface ExecutionParams {
  agent: Agent;
  prompt: string;
  timeout?: number;
}

export interface ExecutionResult {
  success: boolean;
  result?: WorkItemResult;
  error?: string;
}

export async function executeAgent(params: ExecutionParams): Promise<ExecutionResult> {
  const { agent, prompt, timeout = 60000 } = params;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(agent.endpoint.url, {
      method: agent.endpoint.method,
      headers: {
        "Content-Type": "application/json",
        ...agent.endpoint.headers,
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
    const executionTimeMs = Date.now() - Date.now(); // TODO: Track actual time

    return {
      success: true,
      result: {
        output: data.output ?? data,
        outputType: data.type ?? "text",
        executionTimeMs,
        agentMetadata: data.metadata,
      },
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
