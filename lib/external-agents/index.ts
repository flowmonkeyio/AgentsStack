/**
 * External Agents Module
 *
 * HTTP contract types and client for external agent communication.
 *
 * @see /docs/designs/external-agents/TECH_DESIGN.md
 */

// Types
export type {
  AgentExecuteRequest,
  AgentExecuteResponse,
  AgentExecuteResponseSync,
  AgentExecuteResponseAsync,
  AgentAdjustmentContext,
  AgentStatusResponse,
  AgentStatusResponseProgress,
  AgentStatusResponseCompleted,
  AgentStatusResponseFailed,
  AgentCallbackRequest,
  AgentRegistration,
  AgentUsage,
  ModelUsage,
} from './types';

// Type guards
export {
  isExecuteResponseSync,
  isExecuteResponseAsync,
  isStatusCompleted,
  isStatusFailed,
  isStatusProcessing,
} from './types';

// Client
export {
  ExternalAgentClient,
  ExternalAgentError,
  createExternalAgentClient,
} from './client';
export type {
  ExternalAgentClientConfig,
  ExternalAgentErrorCode,
} from './client';

// Demo agents (for development/testing)
export * from './demo';
