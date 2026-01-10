import { Annotation, MessagesAnnotation } from "@langchain/langgraph";
import type { JobStatus } from "@/types/job";
import type { Plan, ActionItem } from "@/types/plan";

/**
 * LangGraph state for job orchestration
 */
export const JobStateAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,

  // Job context
  jobId: Annotation<string>,
  userId: Annotation<string>,
  prompt: Annotation<string>,
  status: Annotation<JobStatus>,

  // Planning
  plan: Annotation<Plan | null>,
  currentActionItem: Annotation<ActionItem | null>,

  // Execution tracking
  completedActions: Annotation<string[]>,
  failedActions: Annotation<string[]>,

  // Agent discovery
  discoveredAgents: Annotation<Array<{ agentId: string; score: number }>>,
  selectedAgentId: Annotation<string | null>,

  // Current work
  currentPrompt: Annotation<string | null>,
  currentResult: Annotation<unknown>,
  verificationResult: Annotation<{
    passed: boolean;
    score: number;
    feedback: string;
  } | null>,

  // Error handling
  error: Annotation<string | null>,
  retryCount: Annotation<number>,
});

export type JobState = typeof JobStateAnnotation.State;

export function createInitialState(
  jobId: string,
  userId: string,
  prompt: string
): Partial<JobState> {
  return {
    jobId,
    userId,
    prompt,
    status: "pending",
    plan: null,
    currentActionItem: null,
    completedActions: [],
    failedActions: [],
    discoveredAgents: [],
    selectedAgentId: null,
    currentPrompt: null,
    currentResult: null,
    verificationResult: null,
    error: null,
    retryCount: 0,
  };
}
