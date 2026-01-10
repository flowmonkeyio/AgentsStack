/**
 * LLM configuration for internal agents
 */
export const MODEL_CONFIG = {
  main_agent: "anthropic/claude-sonnet-4",
  planning_agent: "anthropic/claude-sonnet-4",
  plan_verifier: "anthropic/claude-sonnet-4",
  prompt_agent: "anthropic/claude-3.5-haiku",
  summarization: "google/gemini-2.5-flash",
} as const;

export type AgentRole = keyof typeof MODEL_CONFIG;
export type ModelId = (typeof MODEL_CONFIG)[AgentRole];

export interface LLMConfig {
  model: ModelId;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: "stop" | "length" | "content_filter" | "tool_calls";
}
