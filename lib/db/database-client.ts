/**
 * DatabaseClient Interface
 *
 * Defines the contract for all database operations across the application.
 * This interface follows the technical design specification exactly.
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

/**
 * DatabaseClient interface for MongoDB operations.
 * All methods are async and return promises.
 * All methods take RequestContext as the FIRST parameter for tracing.
 */
export interface DatabaseClient {
  // =========================================================================
  // Users
  // =========================================================================

  /**
   * Retrieve a user by their unique identifier
   */
  getUser(ctx: RequestContext, user_id: string): Promise<User | null>;

  /**
   * Create a new user. Timestamps are added automatically.
   */
  createUser(ctx: RequestContext, user: Omit<User, "created_at" | "updated_at">): Promise<User>;

  /**
   * Update user statistics (partial update)
   */
  updateUserStats(ctx: RequestContext, user_id: string, stats: Partial<User["stats"]>): Promise<void>;

  // =========================================================================
  // Jobs
  // =========================================================================

  /**
   * Retrieve a job by its unique identifier
   */
  getJob(ctx: RequestContext, job_id: string): Promise<Job | null>;

  /**
   * Create a new job. Timestamps are added automatically.
   */
  createJob(ctx: RequestContext, job: Omit<Job, "created_at" | "updated_at">): Promise<Job>;

  /**
   * Update job status
   */
  updateJobStatus(ctx: RequestContext, job_id: string, status: Job["status"]): Promise<void>;

  /**
   * Update job budget
   */
  updateJobBudget(ctx: RequestContext, job_id: string, budget: Job["budget"]): Promise<void>;

  /**
   * Add a reasoning log entry to a job
   */
  addReasoningLog(ctx: RequestContext, job_id: string, entry: ReasoningEntry): Promise<void>;

  /**
   * Update the context summary for a job
   */
  updateContextSummary(ctx: RequestContext, job_id: string, summary: string): Promise<void>;

  /**
   * Add a context reference to a job
   */
  addContextRef(ctx: RequestContext, job_id: string, ref: ContextRef): Promise<void>;

  // =========================================================================
  // Plans
  // =========================================================================

  /**
   * Retrieve a plan by its unique identifier
   */
  getPlan(ctx: RequestContext, plan_id: string): Promise<Plan | null>;

  /**
   * Create a new plan. Timestamp is added automatically.
   */
  createPlan(ctx: RequestContext, plan: Omit<Plan, "created_at">): Promise<Plan>;

  /**
   * Update plan status
   */
  updatePlanStatus(ctx: RequestContext, plan_id: string, status: Plan["status"]): Promise<void>;

  // =========================================================================
  // Work Items
  // =========================================================================

  /**
   * Retrieve a work item by its unique identifier
   */
  getWorkItem(ctx: RequestContext, work_id: string): Promise<WorkItem | null>;

  /**
   * Get all work items for a specific job
   */
  getWorkItemsByJob(ctx: RequestContext, job_id: string): Promise<WorkItem[]>;

  /**
   * Get all work items with a specific status
   */
  getWorkItemsByStatus(ctx: RequestContext, status: WorkItemStatus): Promise<WorkItem[]>;

  /**
   * Create a new work item. Timestamp is added automatically.
   */
  createWorkItem(ctx: RequestContext, item: Omit<WorkItem, "created_at">): Promise<WorkItem>;

  /**
   * Update work item status
   */
  updateWorkItemStatus(ctx: RequestContext, work_id: string, status: WorkItemStatus): Promise<void>;

  /**
   * Update work item output
   */
  updateWorkItemOutput(ctx: RequestContext, work_id: string, output: WorkItem["output"]): Promise<void>;

  /**
   * Update work item verification result
   */
  updateWorkItemVerification(ctx: RequestContext, work_id: string, verification: WorkItem["verification"]): Promise<void>;

  /**
   * Get work items that need polling.
   * Returns items where status="polling" AND external_ref.next_poll_at <= now
   */
  getItemsNeedingPoll(ctx: RequestContext): Promise<WorkItem[]>;

  /**
   * Get stale work items (polling timeout exceeded).
   * Returns items where status="polling" AND external_ref.polling.timeout_at <= now
   */
  getStaleItems(ctx: RequestContext): Promise<WorkItem[]>;

  // =========================================================================
  // Agents
  // =========================================================================

  /**
   * Retrieve an agent by its unique identifier
   */
  getAgent(ctx: RequestContext, agent_id: string): Promise<Agent | null>;

  /**
   * Get all registered agents
   */
  getAllAgents(ctx: RequestContext): Promise<Agent[]>;

  /**
   * Search agents by capability using text search.
   * Note: For production, this should use MongoDB Atlas Vector Search.
   * Current implementation uses simple text matching as a fallback.
   */
  searchAgentsByCapability(ctx: RequestContext, query: string, limit?: number): Promise<Agent[]>;

  /**
   * Update agent statistics (partial update)
   */
  updateAgentStats(ctx: RequestContext, agent_id: string, stats: Partial<Agent["stats"]>): Promise<void>;

  // =========================================================================
  // Templates
  // =========================================================================

  /**
   * Retrieve a prompt template by its unique identifier
   */
  getTemplate(ctx: RequestContext, template_id: string): Promise<PromptTemplate | null>;

  /**
   * Get all templates for a specific agent type
   */
  getTemplatesByType(ctx: RequestContext, agent_type: string): Promise<PromptTemplate[]>;

  // =========================================================================
  // Transactions
  // =========================================================================

  /**
   * Create a new transaction. Timestamp is added automatically.
   */
  createTransaction(ctx: RequestContext, tx: Omit<Transaction, "created_at">): Promise<Transaction>;

  /**
   * Update transaction status
   */
  updateTransactionStatus(ctx: RequestContext, tx_id: string, status: Transaction["status"]): Promise<void>;

  /**
   * Get all transactions for a specific job
   */
  getTransactionsByJob(ctx: RequestContext, job_id: string): Promise<Transaction[]>;

  // =========================================================================
  // Payment-specific methods (added for Payments module)
  // =========================================================================

  /**
   * Update work item payment fields.
   * Supports partial updates - only provided fields are updated.
   */
  updateWorkItemPayment(
    ctx: RequestContext,
    work_id: string,
    payment: Partial<NonNullable<WorkItem["payment"]>>
  ): Promise<void>;

  /**
   * Update transaction tx_hash after blockchain confirmation.
   * Separate from updateTransactionStatus for atomic updates.
   */
  updateTransactionTxHash(ctx: RequestContext, tx_id: string, tx_hash: string): Promise<void>;
}
