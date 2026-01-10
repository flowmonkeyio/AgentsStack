/**
 * ContentStrategist Demo Agent
 *
 * Sync agent for marketing strategy and audience analysis.
 * Uses Claude Sonnet via Anthropic API.
 *
 * @see /docs/designs/external-agents/TECH_DESIGN.md
 */

import type {
  AgentExecuteRequest,
  AgentExecuteResponseSync,
  AgentRegistration,
} from '../types';

export const contentStrategistConfig: AgentRegistration = {
  name: 'ContentStrategist',
  description: 'Marketing strategy and audience analysis',
  url: 'https://agentstack-strategist.vercel.app/api',
  pricing: { base_price: 0.05, negotiable: false },
  capabilities: 'marketing strategy, audience analysis, brand positioning, tone definition',
  tags: ['marketing', 'strategy', 'branding'],
  supports_async: false,
  supports_callback: false,
  wallet: '0x0000000000000000000000000000000000000001',
};

const SYSTEM_PROMPT = `You are a marketing content strategist. Analyze requirements and create strategic marketing plans.

Output JSON with:
- target_audience: { demographics, psychographics }
- key_messages: string[]
- brand_tone: string
- platforms: string[]

Be specific and actionable.`;

interface AnthropicResponse {
  content: Array<{ text: string }>;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * ContentStrategist agent handler.
 * For use in Next.js API route or similar.
 */
export class ContentStrategistAgent {
  private anthropicApiKey: string;

  constructor(anthropicApiKey: string) {
    this.anthropicApiKey = anthropicApiKey;
  }

  async execute(request: AgentExecuteRequest): Promise<AgentExecuteResponseSync> {
    const startTime = Date.now();

    // Build user prompt (handle retries)
    let userPrompt = request.prompt;
    if (request.adjustment?.is_retry) {
      userPrompt = `Previous attempt had issues:
${request.adjustment.issues.map(i => `- ${i.criterion}: ${i.detail}`).join('\n')}

Feedback: ${request.adjustment.feedback}

Please revise:
${request.prompt}`;
    }

    // Call Claude
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data: AnthropicResponse = await response.json();
    const content = data.content[0].text;

    // Parse JSON output (Claude should return JSON)
    let output: unknown;
    try {
      output = JSON.parse(content);
    } catch {
      // If not valid JSON, wrap as text
      output = { raw_content: content };
    }

    // Calculate cost (Claude Sonnet pricing)
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
