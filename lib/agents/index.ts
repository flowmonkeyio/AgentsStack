export {
  embedCapabilities,
  discoverAgents,
  updateAgentEmbedding,
} from "./discovery";
export { executeAgent, pollAgentStatus } from "./executor";
export type { ExecutionParams, ExecutionResult, AgentOutput } from "./executor";

// Re-export new external-agents module for consumers
export {
  ExternalAgentClient,
  ExternalAgentError,
  createExternalAgentClient,
} from "./executor";
export type {
  AgentExecuteRequest,
  AgentExecuteResponse,
  AgentExecuteResponseSync,
  AgentExecuteResponseAsync,
  AgentStatusResponse,
} from "./executor";
