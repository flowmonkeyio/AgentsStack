/**
 * Shared in-memory store for mock agent async jobs.
 *
 * Note: This is for development/testing only.
 * Jobs are lost on server restart.
 */

import type { AgentExecuteRequest } from '@/lib/external-agents/types';

export interface AsyncJob {
  request: AgentExecuteRequest;
  startTime: number;
  completionTime: number;
  callbackUrl?: string;
  failed?: boolean;
  failMessage?: string;
}

// Global store survives hot reloads in dev
const globalStore = globalThis as typeof globalThis & {
  __mockAgentJobs?: Map<string, AsyncJob>;
};

if (!globalStore.__mockAgentJobs) {
  globalStore.__mockAgentJobs = new Map();
}

export const asyncJobs = globalStore.__mockAgentJobs;
