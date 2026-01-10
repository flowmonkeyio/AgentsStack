/**
 * Task Orchestrator Types
 *
 * Types for task management and state tracking.
 */

import type { AgentUsage, ImageGenerationOutput } from '../types/index.js';

/**
 * Task status
 */
export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Task state
 */
export interface TaskState {
  /** Unique task identifier */
  task_id: string;

  /** Original request ID from AgentsStack */
  request_id: string;

  /** Task status */
  status: TaskStatus;

  /** Progress from 0 to 1 */
  progress: number;

  /** Optional status message */
  message?: string;

  /** Task input (prompt) */
  prompt: string;

  /** Optional requirements */
  requirements?: string[];

  /** Callback URL (if provided) */
  callback_url?: string;

  /** Task output (when completed) */
  output?: ImageGenerationOutput;

  /** Usage and cost information */
  usage?: AgentUsage;

  /** Error message (if failed) */
  error?: string;

  /** Whether task is retryable */
  retryable?: boolean;

  /** Processing time in milliseconds */
  processing_time_ms?: number;

  /** Timestamps */
  created_at: Date;
  started_at?: Date;
  completed_at?: Date;
}

/**
 * Task creation options
 */
export interface CreateTaskOptions {
  request_id: string;
  prompt: string;
  requirements?: string[];
  callback_url?: string;
}

/**
 * Task update data
 */
export interface TaskUpdateData {
  status?: TaskStatus;
  progress?: number;
  message?: string;
  output?: ImageGenerationOutput;
  usage?: AgentUsage;
  error?: string;
  retryable?: boolean;
  processing_time_ms?: number;
}
