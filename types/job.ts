import { ObjectId } from "mongodb";

export type JobStatus =
  | "pending"
  | "planning"
  | "executing"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled";

export interface Job {
  _id: ObjectId;
  userId: ObjectId;
  prompt: string;
  status: JobStatus;
  planId?: ObjectId;
  metadata: JobMetadata;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface JobMetadata {
  title?: string;
  category?: string;
  estimatedCostUsd?: number;
  actualCostUsd?: number;
  totalWorkItems?: number;
  completedWorkItems?: number;
}

export type CreateJobInput = Pick<Job, "userId" | "prompt"> & {
  metadata?: Partial<JobMetadata>;
};

export interface JobWithDetails extends Job {
  user?: {
    name: string;
    email: string;
  };
}
