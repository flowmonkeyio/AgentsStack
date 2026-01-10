/**
 * CopyWriter Demo Agent
 *
 * Sync agent for headlines, taglines, and marketing copy.
 * Uses Claude Sonnet via Anthropic API.
 *
 * @see /docs/designs/external-agents/TECH_DESIGN.md
 */

import type {
  AgentExecuteRequest,
  AgentExecuteResponseSync,
  AgentRegistration,
} from '../types';

export const copywriterConfig: AgentRegistration = {
  name: 'CopyWriter',
  description: 'Headlines, taglines, social posts, scripts',
  url: 'https://agentstack-copywriter.vercel.app/api',
  pricing: { base_price: 0.03, negotiable: false },
  capabilities: 'headlines, taglines, social media posts, ad copy, scripts',
  tags: ['marketing', 'copy', 'content'],
  supports_async: false,
  supports_callback: false,
  wallet: '0x0000000000000000000000000000000000000002',
};

const SYSTEM_PROMPT = `You are a professional copywriter specializing in marketing content.

Create compelling copy based on the brief. Output JSON with your deliverables.
Be creative, concise, and on-brand.`;

interface AnthropicResponse {
  content: Array<{ text: string }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * CopyWriter agent handler.
 */
export class CopywriterAgent {
  private anthropicApiKey: string;

  constructor(anthropicApiKey: string) {
    this.anthropicApiKey = anthropicApiKey;
  }

  async execute(request: AgentExecuteRequest): Promise<AgentExecuteResponseSync> {
    const startTime = Date.now();

    let userPrompt = request.prompt;
    if (request.adjustment?.is_retry) {
      userPrompt = `Previous attempt had issues:
${request.adjustment.issues.map(i => `- ${i.criterion}: ${i.detail}`).join('\n')}

Feedback: ${request.adjustment.feedback}

Please revise:
${request.prompt}`;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data: AnthropicResponse = await response.json();
    const content = data.content[0].text;

    let output: unknown;
    try {
      output = JSON.parse(content);
    } catch {
      output = { raw_content: content };
    }

    const inputTokens = data.usage.input_tokens;
    const outputTokens = data.usage.output_tokens;
    const totalCost = (inputTokens * 0.003 + outputTokens * 0.015) / 1000;

    return {
      status: 'completed',
      output,
      usage: {
        total_cost: totalCost,
        model_usage: [{
          model: 'anthropic/claude-sonnet-4',
          native_tokens_prompt: inputTokens,
          native_tokens_completion: outputTokens,
          total_cost: totalCost,
        }],
      },
      processing_time_ms: Date.now() - startTime,
    };
  }
}
