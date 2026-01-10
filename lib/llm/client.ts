import OpenAI from "openai";
import type { LLMConfig, LLMMessage, LLMResponse, AgentRole } from "@/types/llm";
import { MODEL_CONFIG } from "@/types/llm";

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    "X-Title": "AgentStack",
  },
});

export async function complete(
  messages: LLMMessage[],
  config: LLMConfig
): Promise<LLMResponse> {
  const response = await openrouter.chat.completions.create({
    model: config.model,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    temperature: config.temperature ?? 0.7,
    max_tokens: config.maxTokens ?? 4096,
    top_p: config.topP ?? 1,
  });

  const choice = response.choices[0];
  const usage = response.usage;

  return {
    content: choice.message.content || "",
    model: response.model,
    usage: {
      promptTokens: usage?.prompt_tokens || 0,
      completionTokens: usage?.completion_tokens || 0,
      totalTokens: usage?.total_tokens || 0,
    },
    finishReason: choice.finish_reason as LLMResponse["finishReason"],
  };
}

export async function completeWithRole(
  role: AgentRole,
  messages: LLMMessage[],
  overrides?: Partial<LLMConfig>
): Promise<LLMResponse> {
  const config: LLMConfig = {
    model: MODEL_CONFIG[role],
    ...overrides,
  };
  return complete(messages, config);
}

export { openrouter };
