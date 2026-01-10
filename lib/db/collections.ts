import { Collection, Document } from "mongodb";
import { getDatabase } from "./client";
import type {
  User,
  Job,
  Plan,
  WorkItem,
  Agent,
  Transaction,
  PromptTemplate,
} from "@/types";

export type CollectionName =
  | "users"
  | "jobs"
  | "plans"
  | "work_items"
  | "agents"
  | "transactions"
  | "prompt_templates";

// MongoDB Document type with our schema types
export type UserDocument = User & Document;
export type JobDocument = Job & Document;
export type PlanDocument = Plan & Document;
export type WorkItemDocument = WorkItem & Document;
export type AgentDocument = Agent & Document;
export type TransactionDocument = Transaction & Document;
export type PromptTemplateDocument = PromptTemplate & Document;

export async function getCollection<T extends Document>(name: CollectionName): Promise<Collection<T>> {
  const db = await getDatabase();
  return db.collection<T>(name);
}

export async function getUsersCollection(): Promise<Collection<UserDocument>> {
  return getCollection<UserDocument>("users");
}

export async function getJobsCollection(): Promise<Collection<JobDocument>> {
  return getCollection<JobDocument>("jobs");
}

export async function getPlansCollection(): Promise<Collection<PlanDocument>> {
  return getCollection<PlanDocument>("plans");
}

export async function getWorkItemsCollection(): Promise<Collection<WorkItemDocument>> {
  return getCollection<WorkItemDocument>("work_items");
}

export async function getAgentsCollection(): Promise<Collection<AgentDocument>> {
  return getCollection<AgentDocument>("agents");
}

export async function getTransactionsCollection(): Promise<Collection<TransactionDocument>> {
  return getCollection<TransactionDocument>("transactions");
}

export async function getPromptTemplatesCollection(): Promise<Collection<PromptTemplateDocument>> {
  return getCollection<PromptTemplateDocument>("prompt_templates");
}
