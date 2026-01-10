/**
 * DatabaseClient Implementation
 *
 * MongoDB implementation of the DatabaseClient interface.
 * Uses the existing MongoDB client and collection helpers.
 * Includes comprehensive logging with key=value format.
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

import type { RequestContext } from "@/lib/logging";
import { createLogger } from "@/lib/logging";

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

const logger = createLogger("database");

/**
 * MongoDB implementation of the DatabaseClient interface.
 */
export class DatabaseClientImpl implements DatabaseClient {
  // =========================================================================
  // Users
  // =========================================================================

  async getUser(ctx: RequestContext, user_id: string): Promise<User | null> {
    logger.debug(ctx, `operation=get_user user_id=${user_id} status=started`);
    const start = Date.now();
    try {
      const collection = await getUsersCollection();
      const result = await collection.findOne({ user_id });
      logger.info(ctx, `operation=get_user user_id=${user_id} found=${result !== null} duration_ms=${Date.now() - start} status=completed`);
      return result;
    } catch (error) {
      logger.error(ctx, `operation=get_user user_id=${user_id} status=failed`, error as Error);
      throw error;
    }
  }

  async createUser(ctx: RequestContext, user: Omit<User, "created_at" | "updated_at">): Promise<User> {
    logger.debug(ctx, `operation=create_user user_id=${user.user_id} status=started`);
    const start = Date.now();
    try {
      const collection = await getUsersCollection();
      const now = new Date();
      const userWithTimestamps: User = {
        ...user,
        created_at: now,
        updated_at: now,
      };
      await collection.insertOne(userWithTimestamps);
      logger.info(ctx, `operation=create_user user_id=${user.user_id} duration_ms=${Date.now() - start} status=completed`);
      return userWithTimestamps;
    } catch (error) {
      logger.error(ctx, `operation=create_user user_id=${user.user_id} status=failed`, error as Error);
      throw error;
    }
  }

  async updateUserStats(ctx: RequestContext, user_id: string, stats: Partial<User["stats"]>): Promise<void> {
    logger.debug(ctx, `operation=update_user_stats user_id=${user_id} status=started`);
    const start = Date.now();
    try {
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
      logger.info(ctx, `operation=update_user_stats user_id=${user_id} fields_updated=${Object.keys(updateFields).length} duration_ms=${Date.now() - start} status=completed`);
    } catch (error) {
      logger.error(ctx, `operation=update_user_stats user_id=${user_id} status=failed`, error as Error);
      throw error;
    }
  }

  // =========================================================================
  // Jobs
  // =========================================================================

  async getJob(ctx: RequestContext, job_id: string): Promise<Job | null> {
    logger.debug(ctx, `operation=get_job job_id=${job_id} status=started`);
    const start = Date.now();
    try {
      const collection = await getJobsCollection();
      const result = await collection.findOne({ job_id });
      logger.info(ctx, `operation=get_job job_id=${job_id} found=${result !== null} duration_ms=${Date.now() - start} status=completed`);
      return result;
    } catch (error) {
      logger.error(ctx, `operation=get_job job_id=${job_id} status=failed`, error as Error);
      throw error;
    }
  }

  async createJob(ctx: RequestContext, job: Omit<Job, "created_at" | "updated_at">): Promise<Job> {
    logger.debug(ctx, `operation=create_job job_id=${job.job_id} status=started`);
    const start = Date.now();
    try {
      const collection = await getJobsCollection();
      const now = new Date();
      const jobWithTimestamps: Job = {
        ...job,
        created_at: now,
        updated_at: now,
      };
      await collection.insertOne(jobWithTimestamps);
      logger.info(ctx, `operation=create_job job_id=${job.job_id} duration_ms=${Date.now() - start} status=completed`);
      return jobWithTimestamps;
    } catch (error) {
      logger.error(ctx, `operation=create_job job_id=${job.job_id} status=failed`, error as Error);
      throw error;
    }
  }

  async updateJobStatus(ctx: RequestContext, job_id: string, status: Job["status"]): Promise<void> {
    logger.debug(ctx, `operation=update_job_status job_id=${job_id} new_status=${status} status=started`);
    const start = Date.now();
    try {
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
      logger.info(ctx, `operation=update_job_status job_id=${job_id} new_status=${status} duration_ms=${Date.now() - start} status=completed`);
    } catch (error) {
      logger.error(ctx, `operation=update_job_status job_id=${job_id} status=failed`, error as Error);
      throw error;
    }
  }

  async getJobsByStatus(ctx: RequestContext, statuses: Job["status"][]): Promise<Job[]> {
    logger.debug(ctx, `operation=get_jobs_by_status statuses=${statuses.join(",")} status=started`);
    const start = Date.now();
    try {
      const collection = await getJobsCollection();
      const results = await collection.find({ status: { $in: statuses } }).toArray();
      logger.info(ctx, `operation=get_jobs_by_status statuses=${statuses.join(",")} count=${results.length} duration_ms=${Date.now() - start} status=completed`);
      return results;
    } catch (error) {
      logger.error(ctx, `operation=get_jobs_by_status statuses=${statuses.join(",")} status=failed`, error as Error);
      throw error;
    }
  }

  async updateJobBudget(ctx: RequestContext, job_id: string, budget: Job["budget"]): Promise<void> {
    logger.debug(ctx, `operation=update_job_budget job_id=${job_id} status=started`);
    const start = Date.now();
    try {
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
      logger.info(ctx, `operation=update_job_budget job_id=${job_id} spent=${budget.spent} remaining=${budget.remaining} duration_ms=${Date.now() - start} status=completed`);
    } catch (error) {
      logger.error(ctx, `operation=update_job_budget job_id=${job_id} status=failed`, error as Error);
      throw error;
    }
  }

  async addReasoningLog(ctx: RequestContext, job_id: string, entry: ReasoningEntry): Promise<void> {
    logger.debug(ctx, `operation=add_reasoning_log job_id=${job_id} agent=${entry.agent} status=started`);
    const start = Date.now();
    try {
      const collection = await getJobsCollection();
      await collection.updateOne(
        { job_id },
        { $push: { reasoning_log: entry }, $set: { updated_at: new Date() } } as unknown as Parameters<typeof collection.updateOne>[1]
      );
      logger.info(ctx, `operation=add_reasoning_log job_id=${job_id} agent=${entry.agent} duration_ms=${Date.now() - start} status=completed`);
    } catch (error) {
      logger.error(ctx, `operation=add_reasoning_log job_id=${job_id} status=failed`, error as Error);
      throw error;
    }
  }

  async updateContextSummary(ctx: RequestContext, job_id: string, summary: string): Promise<void> {
    logger.debug(ctx, `operation=update_context_summary job_id=${job_id} status=started`);
    const start = Date.now();
    try {
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
      logger.info(ctx, `operation=update_context_summary job_id=${job_id} summary_length=${summary.length} duration_ms=${Date.now() - start} status=completed`);
    } catch (error) {
      logger.error(ctx, `operation=update_context_summary job_id=${job_id} status=failed`, error as Error);
      throw error;
    }
  }

  async addContextRef(ctx: RequestContext, job_id: string, ref: ContextRef): Promise<void> {
    logger.debug(ctx, `operation=add_context_ref job_id=${job_id} work_id=${ref.work_id} status=started`);
    const start = Date.now();
    try {
      const collection = await getJobsCollection();
      await collection.updateOne(
        { job_id },
        { $push: { context_refs: ref }, $set: { updated_at: new Date() } } as unknown as Parameters<typeof collection.updateOne>[1]
      );
      logger.info(ctx, `operation=add_context_ref job_id=${job_id} work_id=${ref.work_id} duration_ms=${Date.now() - start} status=completed`);
    } catch (error) {
      logger.error(ctx, `operation=add_context_ref job_id=${job_id} status=failed`, error as Error);
      throw error;
    }
  }

  // =========================================================================
  // Plans
  // =========================================================================

  async getPlan(ctx: RequestContext, plan_id: string): Promise<Plan | null> {
    logger.debug(ctx, `operation=get_plan plan_id=${plan_id} status=started`);
    const start = Date.now();
    try {
      const collection = await getPlansCollection();
      const result = await collection.findOne({ plan_id });
      logger.info(ctx, `operation=get_plan plan_id=${plan_id} found=${result !== null} duration_ms=${Date.now() - start} status=completed`);
      return result;
    } catch (error) {
      logger.error(ctx, `operation=get_plan plan_id=${plan_id} status=failed`, error as Error);
      throw error;
    }
  }

  async createPlan(ctx: RequestContext, plan: Omit<Plan, "created_at">): Promise<Plan> {
    logger.debug(ctx, `operation=create_plan plan_id=${plan.plan_id} job_id=${plan.job_id} status=started`);
    const start = Date.now();
    try {
      const collection = await getPlansCollection();
      const planWithTimestamp: Plan = {
        ...plan,
        created_at: new Date(),
      };
      await collection.insertOne(planWithTimestamp);
      logger.info(ctx, `operation=create_plan plan_id=${plan.plan_id} job_id=${plan.job_id} action_items_count=${plan.action_items.length} duration_ms=${Date.now() - start} status=completed`);
      return planWithTimestamp;
    } catch (error) {
      logger.error(ctx, `operation=create_plan plan_id=${plan.plan_id} status=failed`, error as Error);
      throw error;
    }
  }

  async updatePlanStatus(ctx: RequestContext, plan_id: string, status: Plan["status"]): Promise<void> {
    logger.debug(ctx, `operation=update_plan_status plan_id=${plan_id} new_status=${status} status=started`);
    const start = Date.now();
    try {
      const collection = await getPlansCollection();
      await collection.updateOne({ plan_id }, { $set: { status } });
      logger.info(ctx, `operation=update_plan_status plan_id=${plan_id} new_status=${status} duration_ms=${Date.now() - start} status=completed`);
    } catch (error) {
      logger.error(ctx, `operation=update_plan_status plan_id=${plan_id} status=failed`, error as Error);
      throw error;
    }
  }

  // =========================================================================
  // Work Items
  // =========================================================================

  async getWorkItem(ctx: RequestContext, work_id: string): Promise<WorkItem | null> {
    logger.debug(ctx, `operation=get_work_item work_id=${work_id} status=started`);
    const start = Date.now();
    try {
      const collection = await getWorkItemsCollection();
      const result = await collection.findOne({ work_id });
      logger.info(ctx, `operation=get_work_item work_id=${work_id} found=${result !== null} duration_ms=${Date.now() - start} status=completed`);
      return result;
    } catch (error) {
      logger.error(ctx, `operation=get_work_item work_id=${work_id} status=failed`, error as Error);
      throw error;
    }
  }

  async getWorkItemsByJob(ctx: RequestContext, job_id: string): Promise<WorkItem[]> {
    logger.debug(ctx, `operation=get_work_items_by_job job_id=${job_id} status=started`);
    const start = Date.now();
    try {
      const collection = await getWorkItemsCollection();
      const result = await collection.find({ job_id }).toArray();
      logger.info(ctx, `operation=get_work_items_by_job job_id=${job_id} count=${result.length} duration_ms=${Date.now() - start} status=completed`);
      return result;
    } catch (error) {
      logger.error(ctx, `operation=get_work_items_by_job job_id=${job_id} status=failed`, error as Error);
      throw error;
    }
  }

  async getWorkItemsByStatus(ctx: RequestContext, status: WorkItemStatus): Promise<WorkItem[]> {
    logger.debug(ctx, `operation=get_work_items_by_status filter_status=${status} status=started`);
    const start = Date.now();
    try {
      const collection = await getWorkItemsCollection();
      const result = await collection.find({ status }).toArray();
      logger.info(ctx, `operation=get_work_items_by_status filter_status=${status} count=${result.length} duration_ms=${Date.now() - start} status=completed`);
      return result;
    } catch (error) {
      logger.error(ctx, `operation=get_work_items_by_status filter_status=${status} status=failed`, error as Error);
      throw error;
    }
  }

  async createWorkItem(ctx: RequestContext, item: Omit<WorkItem, "created_at">): Promise<WorkItem> {
    logger.debug(ctx, `operation=create_work_item work_id=${item.work_id} job_id=${item.job_id} agent_id=${item.agent?.agent_id ?? "none"} status=started`);
    const start = Date.now();
    try {
      const collection = await getWorkItemsCollection();
      const itemWithTimestamp: WorkItem = {
        ...item,
        created_at: new Date(),
      };
      await collection.insertOne(itemWithTimestamp);
      logger.info(ctx, `operation=create_work_item work_id=${item.work_id} job_id=${item.job_id} agent_id=${item.agent?.agent_id ?? "none"} duration_ms=${Date.now() - start} status=completed`);
      return itemWithTimestamp;
    } catch (error) {
      logger.error(ctx, `operation=create_work_item work_id=${item.work_id} status=failed`, error as Error);
      throw error;
    }
  }

  async updateWorkItemStatus(ctx: RequestContext, work_id: string, status: WorkItemStatus): Promise<void> {
    logger.debug(ctx, `operation=update_work_item_status work_id=${work_id} new_status=${status} status=started`);
    const start = Date.now();
    try {
      const collection = await getWorkItemsCollection();
      await collection.updateOne({ work_id }, { $set: { status } });
      logger.info(ctx, `operation=update_work_item_status work_id=${work_id} new_status=${status} duration_ms=${Date.now() - start} status=completed`);
    } catch (error) {
      logger.error(ctx, `operation=update_work_item_status work_id=${work_id} status=failed`, error as Error);
      throw error;
    }
  }

  async updateWorkItemOutput(ctx: RequestContext, work_id: string, output: WorkItem["output"]): Promise<void> {
    logger.debug(ctx, `operation=update_work_item_output work_id=${work_id} status=started`);
    const start = Date.now();
    try {
      const collection = await getWorkItemsCollection();
      await collection.updateOne({ work_id }, { $set: { output } });
      logger.info(ctx, `operation=update_work_item_output work_id=${work_id} has_output=${output !== null && output !== undefined} duration_ms=${Date.now() - start} status=completed`);
    } catch (error) {
      logger.error(ctx, `operation=update_work_item_output work_id=${work_id} status=failed`, error as Error);
      throw error;
    }
  }

  async updateWorkItemVerification(
    ctx: RequestContext,
    work_id: string,
    verification: WorkItem["verification"]
  ): Promise<void> {
    logger.debug(ctx, `operation=update_work_item_verification work_id=${work_id} status=started`);
    const start = Date.now();
    try {
      const collection = await getWorkItemsCollection();
      await collection.updateOne({ work_id }, { $set: { verification } });
      const score = verification?.score ?? "unknown";
      logger.info(ctx, `operation=update_work_item_verification work_id=${work_id} score=${score} duration_ms=${Date.now() - start} status=completed`);
    } catch (error) {
      logger.error(ctx, `operation=update_work_item_verification work_id=${work_id} status=failed`, error as Error);
      throw error;
    }
  }

  async getItemsNeedingPoll(ctx: RequestContext): Promise<WorkItem[]> {
    logger.debug(ctx, `operation=get_items_needing_poll status=started`);
    const start = Date.now();
    try {
      const collection = await getWorkItemsCollection();
      const now = new Date();
      const result = await collection
        .find({
          status: "polling",
          "external_ref.next_poll_at": { $lte: now },
        })
        .toArray();
      logger.info(ctx, `operation=get_items_needing_poll count=${result.length} duration_ms=${Date.now() - start} status=completed`);
      return result;
    } catch (error) {
      logger.error(ctx, `operation=get_items_needing_poll status=failed`, error as Error);
      throw error;
    }
  }

  async getStaleItems(ctx: RequestContext): Promise<WorkItem[]> {
    logger.debug(ctx, `operation=get_stale_items status=started`);
    const start = Date.now();
    try {
      const collection = await getWorkItemsCollection();
      const now = new Date();
      const result = await collection
        .find({
          status: "polling",
          "external_ref.polling.timeout_at": { $lte: now },
        })
        .toArray();
      logger.info(ctx, `operation=get_stale_items count=${result.length} duration_ms=${Date.now() - start} status=completed`);
      return result;
    } catch (error) {
      logger.error(ctx, `operation=get_stale_items status=failed`, error as Error);
      throw error;
    }
  }

  // =========================================================================
  // Agents
  // =========================================================================

  async getAgent(ctx: RequestContext, agent_id: string): Promise<Agent | null> {
    logger.debug(ctx, `operation=get_agent agent_id=${agent_id} status=started`);
    const start = Date.now();
    try {
      const collection = await getAgentsCollection();
      const result = await collection.findOne({ agent_id });
      logger.info(ctx, `operation=get_agent agent_id=${agent_id} found=${result !== null} duration_ms=${Date.now() - start} status=completed`);
      return result;
    } catch (error) {
      logger.error(ctx, `operation=get_agent agent_id=${agent_id} status=failed`, error as Error);
      throw error;
    }
  }

  async getAllAgents(ctx: RequestContext): Promise<Agent[]> {
    logger.debug(ctx, `operation=get_all_agents status=started`);
    const start = Date.now();
    try {
      const collection = await getAgentsCollection();
      const result = await collection.find({}).toArray();
      logger.info(ctx, `operation=get_all_agents count=${result.length} duration_ms=${Date.now() - start} status=completed`);
      return result;
    } catch (error) {
      logger.error(ctx, `operation=get_all_agents status=failed`, error as Error);
      throw error;
    }
  }

  async searchAgentsByCapability(ctx: RequestContext, query: string, limit: number = 10): Promise<Agent[]> {
    logger.debug(ctx, `operation=search_agents_by_capability query="${query}" limit=${limit} status=started`);
    const start = Date.now();
    try {
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
      const result = await collection.find({ capabilities: { $regex: regex } }).limit(limit).toArray();
      logger.info(ctx, `operation=search_agents_by_capability query="${query}" limit=${limit} count=${result.length} duration_ms=${Date.now() - start} status=completed`);
      return result;
    } catch (error) {
      logger.error(ctx, `operation=search_agents_by_capability query="${query}" status=failed`, error as Error);
      throw error;
    }
  }

  async updateAgentStats(ctx: RequestContext, agent_id: string, stats: Partial<Agent["stats"]>): Promise<void> {
    logger.debug(ctx, `operation=update_agent_stats agent_id=${agent_id} status=started`);
    const start = Date.now();
    try {
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
      logger.info(ctx, `operation=update_agent_stats agent_id=${agent_id} fields_updated=${Object.keys(updateFields).length} duration_ms=${Date.now() - start} status=completed`);
    } catch (error) {
      logger.error(ctx, `operation=update_agent_stats agent_id=${agent_id} status=failed`, error as Error);
      throw error;
    }
  }

  // =========================================================================
  // Templates
  // =========================================================================

  async getTemplate(ctx: RequestContext, template_id: string): Promise<PromptTemplate | null> {
    logger.debug(ctx, `operation=get_template template_id=${template_id} status=started`);
    const start = Date.now();
    try {
      const collection = await getPromptTemplatesCollection();
      const result = await collection.findOne({ template_id });
      logger.info(ctx, `operation=get_template template_id=${template_id} found=${result !== null} duration_ms=${Date.now() - start} status=completed`);
      return result;
    } catch (error) {
      logger.error(ctx, `operation=get_template template_id=${template_id} status=failed`, error as Error);
      throw error;
    }
  }

  async getTemplatesByType(ctx: RequestContext, agent_type: string): Promise<PromptTemplate[]> {
    logger.debug(ctx, `operation=get_templates_by_type agent_type=${agent_type} status=started`);
    const start = Date.now();
    try {
      const collection = await getPromptTemplatesCollection();
      const result = await collection.find({ agent_type }).toArray();
      logger.info(ctx, `operation=get_templates_by_type agent_type=${agent_type} count=${result.length} duration_ms=${Date.now() - start} status=completed`);
      return result;
    } catch (error) {
      logger.error(ctx, `operation=get_templates_by_type agent_type=${agent_type} status=failed`, error as Error);
      throw error;
    }
  }

  // =========================================================================
  // Transactions
  // =========================================================================

  async createTransaction(ctx: RequestContext, tx: Omit<Transaction, "created_at">): Promise<Transaction> {
    logger.debug(ctx, `operation=create_transaction tx_id=${tx.tx_id} job_id=${tx.job_id} work_id=${tx.work_id} status=started`);
    const start = Date.now();
    try {
      const collection = await getTransactionsCollection();
      const txWithTimestamp: Transaction = {
        ...tx,
        created_at: new Date(),
      };
      await collection.insertOne(txWithTimestamp);
      logger.info(ctx, `operation=create_transaction tx_id=${tx.tx_id} job_id=${tx.job_id} work_id=${tx.work_id} amount=${tx.amount} duration_ms=${Date.now() - start} status=completed`);
      return txWithTimestamp;
    } catch (error) {
      logger.error(ctx, `operation=create_transaction tx_id=${tx.tx_id} status=failed`, error as Error);
      throw error;
    }
  }

  async updateTransactionStatus(ctx: RequestContext, tx_id: string, status: Transaction["status"]): Promise<void> {
    logger.debug(ctx, `operation=update_transaction_status tx_id=${tx_id} new_status=${status} status=started`);
    const start = Date.now();
    try {
      const collection = await getTransactionsCollection();
      const updateData: Record<string, unknown> = { status };

      // If status is confirmed, set confirmed_at timestamp
      if (status === "confirmed") {
        updateData.confirmed_at = new Date();
      }

      await collection.updateOne({ tx_id }, { $set: updateData });
      logger.info(ctx, `operation=update_transaction_status tx_id=${tx_id} new_status=${status} duration_ms=${Date.now() - start} status=completed`);
    } catch (error) {
      logger.error(ctx, `operation=update_transaction_status tx_id=${tx_id} status=failed`, error as Error);
      throw error;
    }
  }

  async getTransactionsByJob(ctx: RequestContext, job_id: string): Promise<Transaction[]> {
    logger.debug(ctx, `operation=get_transactions_by_job job_id=${job_id} status=started`);
    const start = Date.now();
    try {
      const collection = await getTransactionsCollection();
      const result = await collection.find({ job_id }).toArray();
      logger.info(ctx, `operation=get_transactions_by_job job_id=${job_id} count=${result.length} duration_ms=${Date.now() - start} status=completed`);
      return result;
    } catch (error) {
      logger.error(ctx, `operation=get_transactions_by_job job_id=${job_id} status=failed`, error as Error);
      throw error;
    }
  }

  // =========================================================================
  // Payment-specific methods (added for Payments module)
  // =========================================================================

  async updateWorkItemPayment(
    ctx: RequestContext,
    work_id: string,
    payment: Partial<NonNullable<WorkItem["payment"]>>
  ): Promise<void> {
    logger.debug(ctx, `operation=update_work_item_payment work_id=${work_id} status=started`);
    const start = Date.now();
    try {
      const collection = await getWorkItemsCollection();
      const updateFields: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(payment)) {
        if (value !== undefined) {
          updateFields[`payment.${key}`] = value;
        }
      }

      await collection.updateOne({ work_id }, { $set: updateFields });
      logger.info(ctx, `operation=update_work_item_payment work_id=${work_id} fields_updated=${Object.keys(updateFields).length} duration_ms=${Date.now() - start} status=completed`);
    } catch (error) {
      logger.error(ctx, `operation=update_work_item_payment work_id=${work_id} status=failed`, error as Error);
      throw error;
    }
  }

  async updateTransactionTxHash(ctx: RequestContext, tx_id: string, tx_hash: string): Promise<void> {
    logger.debug(ctx, `operation=update_transaction_tx_hash tx_id=${tx_id} status=started`);
    const start = Date.now();
    try {
      const collection = await getTransactionsCollection();
      await collection.updateOne(
        { tx_id },
        {
          $set: {
            tx_hash,
            confirmed_at: new Date(),
          },
        }
      );
      logger.info(ctx, `operation=update_transaction_tx_hash tx_id=${tx_id} tx_hash=${tx_hash.slice(0, 16)}... duration_ms=${Date.now() - start} status=completed`);
    } catch (error) {
      logger.error(ctx, `operation=update_transaction_tx_hash tx_id=${tx_id} status=failed`, error as Error);
      throw error;
    }
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
