import { Collection } from "mongodb";
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

export async function getCollection<T>(name: CollectionName): Promise<Collection<T>> {
  const db = await getDatabase();
  return db.collection<T>(name);
}

export async function getUsersCollection(): Promise<Collection<User>> {
  return getCollection<User>("users");
}

export async function getJobsCollection(): Promise<Collection<Job>> {
  return getCollection<Job>("jobs");
}

export async function getPlansCollection(): Promise<Collection<Plan>> {
  return getCollection<Plan>("plans");
}

export async function getWorkItemsCollection(): Promise<Collection<WorkItem>> {
  return getCollection<WorkItem>("work_items");
}

export async function getAgentsCollection(): Promise<Collection<Agent>> {
  return getCollection<Agent>("agents");
}

export async function getTransactionsCollection(): Promise<Collection<Transaction>> {
  return getCollection<Transaction>("transactions");
}

export async function getPromptTemplatesCollection(): Promise<Collection<PromptTemplate>> {
  return getCollection<PromptTemplate>("prompt_templates");
}
