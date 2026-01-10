import { ObjectId } from "mongodb";

export type PlanStatus = "draft" | "approved" | "in_progress" | "completed" | "rejected";

export interface Plan {
  _id: ObjectId;
  jobId: ObjectId;
  version: number;
  status: PlanStatus;
  summary: string;
  actionItems: ActionItem[];
  dependencies: PlanDependency[];
  estimatedCostUsd: number;
  verificationNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActionItem {
  id: string;
  description: string;
  requiredCapabilities: string[];
  estimatedCostUsd: number;
  priority: "high" | "medium" | "low";
  dependsOn: string[];
  outputSpec: OutputSpec;
}

export interface OutputSpec {
  type: "text" | "image" | "code" | "document" | "data";
  format?: string;
  constraints?: string[];
}

export interface PlanDependency {
  from: string;
  to: string;
  type: "blocking" | "input";
}

export type CreatePlanInput = Omit<Plan, "_id" | "version" | "createdAt" | "updatedAt"> & {
  version?: number;
};
