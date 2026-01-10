/**
 * API Request/Response Types
 *
 * All types for API endpoints as specified in the technical design.
 * @see /docs/designs/api/TECH_DESIGN.md
 */

import type { WorkItemStatus, ReasoningEntry, ActionItem } from "./data";

// =============================================================================
// REQUEST TYPES
// =============================================================================

export interface CreateJobRequest {
  prompt: string;
  budget: number;
  context?: {
    product?: string;
    users?: string;
    [key: string]: string | undefined;
  };
}

export interface ContinueJobRequest {
  prompt: string;
}

export interface AgentCallbackRequest {
  reference_id: string;
  status: "completed" | "failed" | "progress";
  output?: unknown;
  error?: string;
  progress?: number;
  message?: string;
}

// =============================================================================
// RESPONSE TYPES
// =============================================================================

export interface CreateJobResponse {
  job_id: string;
  status: "planning";
  stream_url: string;
}

export interface ContinueJobResponse {
  job_id: string;
  version: number;
  status: "planning";
  stream_url: string;
}

export interface GetJobResponse {
  job_id: string;
  status: "planning" | "plan_verification" | "executing" | "completed" | "failed";
  prompt: string;
  budget: {
    total: number;
    allocated: number;
    spent: number;
    remaining: number;
  };
  plan_version: number;
  context_summary: string;
  action_items: Array<{
    id: number;
    item: string;
    priority: number;
    depends_on: number[];
    status: "pending" | "in_progress" | "completed" | "failed";
    agent_id: string | null;
    template_id: string;
  }>;
  work_items: Array<{
    work_id: string;
    action_item_id: number;
    status: WorkItemStatus;
    action: string;
    output?: {
      title: string;
      description: string;
      content: unknown;
    };
    verification?: {
      score: number;
      passed: boolean;
    };
  }>;
  versions: Array<{
    version: number;
    completed_at: string;
    work_ids: string[];
  }>;
  reasoning_log: ReasoningEntry[];
}

export interface GetWorkItemResponse {
  work_id: string;
  action_item_id: number;
  status: WorkItemStatus;
  action: {
    item: string;
    deliverable_id: string;
    requirements: string[];
  };
  output: {
    title: string;
    description: string;
    content: unknown;
  } | null;
  verification: {
    score: number;
    passed: boolean;
    criteria_results: Array<{
      criterion: string;
      passed: boolean;
    }>;
  } | null;
  payment: {
    status: string;
    amount: number;
    tx_hash: string | null;
  } | null;
}

export interface AgentCallbackResponse {
  received: boolean;
  work_id: string;
}

export interface ErrorResponse {
  error: string;
  code: string;
  details?: Record<string, unknown>;
}

// =============================================================================
// ERROR CODES
// =============================================================================

export const ErrorCodes = {
  INVALID_INPUT: "INVALID_INPUT",
  UNAUTHORIZED: "UNAUTHORIZED",
  NOT_FOUND: "NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  JOB_COMPLETED: "JOB_COMPLETED",
  BUDGET_TOO_LOW: "BUDGET_TOO_LOW",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  INVALID_REFERENCE: "INVALID_REFERENCE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// =============================================================================
// SSE EVENT DATA TYPES (for type-safe event handling)
// =============================================================================

// Job lifecycle event data
export interface JobStartedData {
  job_id: string;
}

export interface JobPlanningData {
  job_id: string;
}

export interface JobPlanVerifiedData {
  job_id: string;
  plan_id: string;
}

export interface JobExecutingData {
  job_id: string;
}

export interface JobCompletedData {
  job_id: string;
  version: number;
}

export interface JobFailedData {
  job_id: string;
  reason: string;
}

export interface JobContinuedData {
  job_id: string;
  version: number;
}

// Work item lifecycle event data
export interface WorkCreatedData {
  work_id: string;
  action_item_id: number;
  action: string;
}

export interface WorkStatusChangedData {
  work_id: string;
  status: WorkItemStatus;
}

export interface WorkPromptGeneratedData {
  work_id: string;
  template_id: string;
}

export interface WorkOutputReceivedData {
  work_id: string;
  title: string;
  description: string;
  content: unknown;
}

export interface WorkVerifiedData {
  work_id: string;
  score: number;
  passed: boolean;
}

export interface WorkRetryData {
  work_id: string;
  attempt: number;
  reason: string;
  issues: string[];
}

export interface WorkPaymentConfirmedData {
  work_id: string;
  amount: number;
  tx_hash: string;
}

export interface WorkFailedData {
  work_id: string;
  reason: string;
}

// Dynamic spawning event data
export interface TodoSpawnedData {
  parent_id: number;
  new_todos: ActionItem[];
}

// Reasoning event data
export interface ReasoningData {
  agent: string;
  step: string;
  thought: string;
  decision?: string;
}

// Heartbeat event data
export interface HeartbeatData {
  timestamp: string;
}
