/**
 * DatabaseClient Implementation
 *
 * MongoDB implementation of the DatabaseClient interface.
 * Uses the existing MongoDB client and collection helpers.
 *
 * @see /docs/designs/core-data-structure/TECH_DESIGN.md
 */

import type {
  User,
  Job,
  ContextRef,
  ReasoningEntry,
  Plan,
  WorkItem,
  WorkItemStatus,
  Agent,
  PromptTemplate,
  Transaction,
} from "@/types";

import type { DatabaseClient } from "./database-client";
import {
  getUsersCollection,
  getJobsCollection,
  getPlansCollection,
  getWorkItemsCollection,
  getAgentsCollection,
  getPromptTemplatesCollection,
  getTransactionsCollection,
} from "./collections";

/**
 * MongoDB implementation of the DatabaseClient interface.
 */
export class DatabaseClientImpl implements DatabaseClient {
  // =========================================================================
  // Users
  // =========================================================================

  async getUser(user_id: string): Promise<User | null> {
    const collection = await getUsersCollection();
    return collection.findOne({ user_id });
  }

  async createUser(user: Omit<User, "created_at" | "updated_at">): Promise<User> {
    const collection = await getUsersCollection();
    const now = new Date();
    const userWithTimestamps: User = {
      ...user,
      created_at: now,
      updated_at: now,
    };
    await collection.insertOne(userWithTimestamps);
    return userWithTimestamps;
  }

  async updateUserStats(user_id: string, stats: Partial<User["stats"]>): Promise<void> {
    const collection = await getUsersCollection();
    const updateFields: Record<string, number> = {};

    if (stats.total_jobs !== undefined) {
      updateFields["stats.total_jobs"] = stats.total_jobs;
    }
    if (stats.total_spent !== undefined) {
      updateFields["stats.total_spent"] = stats.total_spent;
    }
    if (stats.total_work_items !== undefined) {
      updateFields["stats.total_work_items"] = stats.total_work_items;
    }

    await collection.updateOne(
      { user_id },
      {
        $set: {
          ...updateFields,
          updated_at: new Date(),
        },
      }
    );
  }

  // =========================================================================
  // Jobs
  // =========================================================================

  async getJob(job_id: string): Promise<Job | null> {
    const collection = await getJobsCollection();
    return collection.findOne({ job_id });
  }

  async createJob(job: Omit<Job, "created_at" | "updated_at">): Promise<Job> {
    const collection = await getJobsCollection();
    const now = new Date();
    const jobWithTimestamps: Job = {
      ...job,
      created_at: now,
      updated_at: now,
    };
    await collection.insertOne(jobWithTimestamps);
    return jobWithTimestamps;
  }

  async updateJobStatus(job_id: string, status: Job["status"]): Promise<void> {
    const collection = await getJobsCollection();
    await collection.updateOne(
      { job_id },
      {
        $set: {
          status,
          updated_at: new Date(),
        },
      }
    );
  }

  async updateJobBudget(job_id: string, budget: Job["budget"]): Promise<void> {
    const collection = await getJobsCollection();
    await collection.updateOne(
      { job_id },
      {
        $set: {
          budget,
          updated_at: new Date(),
        },
      }
    );
  }

  async addReasoningLog(job_id: string, entry: ReasoningEntry): Promise<void> {
    const collection = await getJobsCollection();
    await collection.updateOne(
      { job_id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { $push: { reasoning_log: entry }, $set: { updated_at: new Date() } } as any
    );
  }

  async updateContextSummary(job_id: string, summary: string): Promise<void> {
    const collection = await getJobsCollection();
    await collection.updateOne(
      { job_id },
      {
        $set: {
          context_summary: summary,
          updated_at: new Date(),
        },
      }
    );
  }

  async addContextRef(job_id: string, ref: ContextRef): Promise<void> {
    const collection = await getJobsCollection();
    await collection.updateOne(
      { job_id },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { $push: { context_refs: ref }, $set: { updated_at: new Date() } } as any
    );
  }

  // =========================================================================
  // Plans
  // =========================================================================

  async getPlan(plan_id: string): Promise<Plan | null> {
    const collection = await getPlansCollection();
    return collection.findOne({ plan_id });
  }

  async createPlan(plan: Omit<Plan, "created_at">): Promise<Plan> {
    const collection = await getPlansCollection();
    const planWithTimestamp: Plan = {
      ...plan,
      created_at: new Date(),
    };
    await collection.insertOne(planWithTimestamp);
    return planWithTimestamp;
  }

  async updatePlanStatus(plan_id: string, status: Plan["status"]): Promise<void> {
    const collection = await getPlansCollection();
    await collection.updateOne({ plan_id }, { $set: { status } });
  }

  // =========================================================================
  // Work Items
  // =========================================================================

  async getWorkItem(work_id: string): Promise<WorkItem | null> {
    const collection = await getWorkItemsCollection();
    return collection.findOne({ work_id });
  }

  async getWorkItemsByJob(job_id: string): Promise<WorkItem[]> {
    const collection = await getWorkItemsCollection();
    return collection.find({ job_id }).toArray();
  }

  async getWorkItemsByStatus(status: WorkItemStatus): Promise<WorkItem[]> {
    const collection = await getWorkItemsCollection();
    return collection.find({ status }).toArray();
  }

  async createWorkItem(item: Omit<WorkItem, "created_at">): Promise<WorkItem> {
    const collection = await getWorkItemsCollection();
    const itemWithTimestamp: WorkItem = {
      ...item,
      created_at: new Date(),
    };
    await collection.insertOne(itemWithTimestamp);
    return itemWithTimestamp;
  }

  async updateWorkItemStatus(work_id: string, status: WorkItemStatus): Promise<void> {
    const collection = await getWorkItemsCollection();
    await collection.updateOne({ work_id }, { $set: { status } });
  }

  async updateWorkItemOutput(work_id: string, output: WorkItem["output"]): Promise<void> {
    const collection = await getWorkItemsCollection();
    await collection.updateOne({ work_id }, { $set: { output } });
  }

  async updateWorkItemVerification(
    work_id: string,
    verification: WorkItem["verification"]
  ): Promise<void> {
    const collection = await getWorkItemsCollection();
    await collection.updateOne({ work_id }, { $set: { verification } });
  }

  async getItemsNeedingPoll(): Promise<WorkItem[]> {
    const collection = await getWorkItemsCollection();
    const now = new Date();
    return collection
      .find({
        status: "polling",
        "external_ref.next_poll_at": { $lte: now },
      })
      .toArray();
  }

  async getStaleItems(): Promise<WorkItem[]> {
    const collection = await getWorkItemsCollection();
    const now = new Date();
    return collection
      .find({
        status: "polling",
        "external_ref.polling.timeout_at": { $lte: now },
      })
      .toArray();
  }

  // =========================================================================
  // Agents
  // =========================================================================

  async getAgent(agent_id: string): Promise<Agent | null> {
    const collection = await getAgentsCollection();
    return collection.findOne({ agent_id });
  }

  async getAllAgents(): Promise<Agent[]> {
    const collection = await getAgentsCollection();
    return collection.find({}).toArray();
  }

  async searchAgentsByCapability(query: string, limit: number = 10): Promise<Agent[]> {
    const collection = await getAgentsCollection();

    // Simple text search fallback using regex on capabilities field.
    // For production, this should use MongoDB Atlas Vector Search with
    // the capabilities_embedding field and the "agent_capabilities_vector" index.
    // The vector search implementation requires:
    // 1. Generating an embedding for the query using Voyage AI
    // 2. Using $vectorSearch aggregation pipeline
    //
    // Example vector search (to be implemented when Atlas Vector Search is configured):
    // collection.aggregate([
    //   {
    //     $vectorSearch: {
    //       index: "agent_capabilities_vector",
    //       path: "capabilities_embedding",
    //       queryVector: [/* embedding from Voyage AI */],
    //       numCandidates: 50,
    //       limit: limit
    //     }
    //   }
    // ]);

    // Current fallback: case-insensitive regex search on capabilities text
    const regex = new RegExp(query, "i");
    return collection.find({ capabilities: { $regex: regex } }).limit(limit).toArray();
  }

  async updateAgentStats(agent_id: string, stats: Partial<Agent["stats"]>): Promise<void> {
    const collection = await getAgentsCollection();
    const updateFields: Record<string, number> = {};

    if (stats.jobs_completed !== undefined) {
      updateFields["stats.jobs_completed"] = stats.jobs_completed;
    }
    if (stats.avg_score !== undefined) {
      updateFields["stats.avg_score"] = stats.avg_score;
    }
    if (stats.avg_response_time_ms !== undefined) {
      updateFields["stats.avg_response_time_ms"] = stats.avg_response_time_ms;
    }

    await collection.updateOne({ agent_id }, { $set: updateFields });
  }

  // =========================================================================
  // Templates
  // =========================================================================

  async getTemplate(template_id: string): Promise<PromptTemplate | null> {
    const collection = await getPromptTemplatesCollection();
    return collection.findOne({ template_id });
  }

  async getTemplatesByType(agent_type: string): Promise<PromptTemplate[]> {
    const collection = await getPromptTemplatesCollection();
    return collection.find({ agent_type }).toArray();
  }

  // =========================================================================
  // Transactions
  // =========================================================================

  async createTransaction(tx: Omit<Transaction, "created_at">): Promise<Transaction> {
    const collection = await getTransactionsCollection();
    const txWithTimestamp: Transaction = {
      ...tx,
      created_at: new Date(),
    };
    await collection.insertOne(txWithTimestamp);
    return txWithTimestamp;
  }

  async updateTransactionStatus(tx_id: string, status: Transaction["status"]): Promise<void> {
    const collection = await getTransactionsCollection();
    const updateData: Record<string, unknown> = { status };

    // If status is confirmed, set confirmed_at timestamp
    if (status === "confirmed") {
      updateData.confirmed_at = new Date();
    }

    await collection.updateOne({ tx_id }, { $set: updateData });
  }

  async getTransactionsByJob(job_id: string): Promise<Transaction[]> {
    const collection = await getTransactionsCollection();
    return collection.find({ job_id }).toArray();
  }
}

/**
 * Singleton instance of the database client.
 * Use this for all database operations.
 */
let databaseClientInstance: DatabaseClient | null = null;

/**
 * Get the singleton DatabaseClient instance.
 * Creates a new instance if one doesn't exist.
 */
export function getDatabaseClient(): DatabaseClient {
  if (!databaseClientInstance) {
    databaseClientInstance = new DatabaseClientImpl();
  }
  return databaseClientInstance;
}

/**
 * Create a new DatabaseClient instance.
 * Useful for testing or when a fresh instance is needed.
 */
export function createDatabaseClient(): DatabaseClient {
  return new DatabaseClientImpl();
}
