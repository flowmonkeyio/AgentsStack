import { ObjectId } from "mongodb";

/**
 * 16-state work item lifecycle
 */
export type WorkItemStatus =
  // Pre-execution
  | "pending"
  | "discovering_agents"
  | "agents_found"
  | "no_agents_found"
  // Execution
  | "prompt_generating"
  | "prompt_ready"
  | "dispatching"
  | "executing"
  | "execution_timeout"
  | "execution_error"
  // Verification
  | "verifying"
  | "verification_passed"
  | "verification_failed"
  // Payment
  | "paying"
  | "paid"
  // Terminal
  | "completed"
  | "failed";

export interface WorkItem {
  _id: ObjectId;
  jobId: ObjectId;
  planId: ObjectId;
  actionItemId: string;
  status: WorkItemStatus;
  agentId?: ObjectId;
  prompt?: string;
  result?: WorkItemResult;
  verification?: WorkItemVerification;
  payment?: WorkItemPayment;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface WorkItemResult {
  output: unknown;
  outputType: "text" | "image" | "code" | "document" | "data";
  executionTimeMs: number;
  agentMetadata?: Record<string, unknown>;
}

export interface WorkItemVerification {
  passed: boolean;
  score: number;
  feedback: string;
  metrics: VerificationMetrics;
  verifiedAt: Date;
}

export interface VerificationMetrics {
  relevance: number;
  quality: number;
  completeness: number;
  safety: number;
}

export interface WorkItemPayment {
  transactionId: ObjectId;
  amountUsd: number;
  txHash?: string;
  paidAt: Date;
}

export type CreateWorkItemInput = Pick<
  WorkItem,
  "jobId" | "planId" | "actionItemId"
> & {
  maxAttempts?: number;
};
