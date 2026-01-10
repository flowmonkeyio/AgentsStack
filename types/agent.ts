import { ObjectId } from "mongodb";

export type AgentStatus = "active" | "inactive" | "suspended" | "pending_review";

export interface Agent {
  _id: ObjectId;
  name: string;
  description: string;
  ownerId?: ObjectId;
  status: AgentStatus;
  endpoint: AgentEndpoint;
  capabilities: string[];
  capabilityEmbedding?: number[];
  pricing: AgentPricing;
  metrics: AgentMetrics;
  metadata: AgentMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentEndpoint {
  url: string;
  method: "POST" | "GET";
  headers?: Record<string, string>;
  timeout: number;
  supportsX402: boolean;
}

export interface AgentPricing {
  basePrice: number;
  currency: "USDC";
  pricePerUnit?: number;
  unit?: "token" | "request" | "minute";
}

export interface AgentMetrics {
  totalJobs: number;
  successfulJobs: number;
  failedJobs: number;
  averageScore: number;
  totalEarningsUsd: number;
  averageExecutionTimeMs: number;
}

export interface AgentMetadata {
  version?: string;
  author?: string;
  tags?: string[];
  documentation?: string;
  sampleInput?: unknown;
  sampleOutput?: unknown;
}

export type CreateAgentInput = Omit<
  Agent,
  "_id" | "capabilityEmbedding" | "metrics" | "createdAt" | "updatedAt"
> & {
  metrics?: Partial<AgentMetrics>;
};

export interface AgentSearchResult {
  agent: Agent;
  score: number;
  matchedCapabilities: string[];
}
