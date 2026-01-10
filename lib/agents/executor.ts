/**
 * Agent Executor (Legacy)
 *
 * This file is maintained for backward compatibility.
 * All functionality has been moved to lib/external-agents/.
 *
 * @deprecated Use lib/external-agents instead
 * @see /docs/designs/external-agents/TECH_DESIGN.md
 */

// Re-export client as legacy API
export {
  ExternalAgentClient,
  ExternalAgentError,
  createExternalAgentClient,
} from '../external-agents/client';

export type {
  AgentExecuteRequest,
  AgentExecuteResponse,
  AgentExecuteResponseSync,
  AgentExecuteResponseAsync,
  AgentStatusResponse,
} from '../external-agents/types';

// Legacy interface for backward compatibility
import type { Agent, AgentUsage } from '@/types';
import { ExternalAgentClient } from '../external-agents/client';
import type {
  AgentExecuteRequest,
} from '../external-agents/types';
import { isExecuteResponseSync } from '../external-agents/types';

export interface ExecutionParams {
  agent: Agent;
  prompt: string;
  timeout?: number;
}

export interface AgentOutput {
  title: string;
  description: string;
  content: unknown;
}

export interface ExecutionResult {
  success: boolean;
  output?: AgentOutput;
  usage?: AgentUsage;
  reference_id?: string;
  status_url?: string;
  error?: string;
}

const client = new ExternalAgentClient();

/**
 * Execute an external agent.
 * @deprecated Use ExternalAgentClient.execute() instead
 */
export async function executeAgent(params: ExecutionParams): Promise<ExecutionResult> {
  const { agent, prompt, timeout } = params;

  try {
    const request: AgentExecuteRequest = {
      request_id: crypto.randomUUID(),
      prompt,
    };

    const response = await client.execute(agent.url, request, { timeout });

    if (isExecuteResponseSync(response)) {
      return {
        success: true,
        output: {
          title: 'Agent Output',
          description: '',
          content: response.output,
        },
        usage: response.usage,
      };
    }

    // Async response
    return {
      success: true,
      reference_id: response.reference_id,
      status_url: response.status_url,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Poll an async agent for status.
 * @deprecated Use ExternalAgentClient.checkStatus() instead
 */
export async function pollAgentStatus(status_url: string): Promise<ExecutionResult> {
  try {
    const status = await client.checkStatus(status_url);

    if (status.status === 'completed') {
      return {
        success: true,
        output: {
          title: 'Agent Output',
          description: '',
          content: status.output,
        },
        usage: status.usage,
      };
    }

    if (status.status === 'failed') {
      return {
        success: false,
        error: status.error,
      };
    }

    // Still processing
    return {
      success: false,
      error: 'still_processing',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
