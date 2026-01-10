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

/**
 * DatabaseClient interface for MongoDB operations.
 * All methods are async and return promises.
 */
export interface DatabaseClient {
  // =========================================================================
  // Users
  // =========================================================================

  /**
   * Retrieve a user by their unique identifier
   */
  getUser(user_id: string): Promise<User | null>;

  /**
   * Create a new user. Timestamps are added automatically.
   */
  createUser(user: Omit<User, "created_at" | "updated_at">): Promise<User>;

  /**
   * Update user statistics (partial update)
   */
  updateUserStats(user_id: string, stats: Partial<User["stats"]>): Promise<void>;

  // =========================================================================
  // Jobs
  // =========================================================================

  /**
   * Retrieve a job by its unique identifier
   */
  getJob(job_id: string): Promise<Job | null>;

  /**
   * Create a new job. Timestamps are added automatically.
   */
  createJob(job: Omit<Job, "created_at" | "updated_at">): Promise<Job>;

  /**
   * Update job status
   */
  updateJobStatus(job_id: string, status: Job["status"]): Promise<void>;

  /**
   * Update job budget
   */
  updateJobBudget(job_id: string, budget: Job["budget"]): Promise<void>;

  /**
   * Add a reasoning log entry to a job
   */
  addReasoningLog(job_id: string, entry: ReasoningEntry): Promise<void>;

  /**
   * Update the context summary for a job
   */
  updateContextSummary(job_id: string, summary: string): Promise<void>;

  /**
   * Add a context reference to a job
   */
  addContextRef(job_id: string, ref: ContextRef): Promise<void>;

  // =========================================================================
  // Plans
  // =========================================================================

  /**
   * Retrieve a plan by its unique identifier
   */
  getPlan(plan_id: string): Promise<Plan | null>;

  /**
   * Create a new plan. Timestamp is added automatically.
   */
  createPlan(plan: Omit<Plan, "created_at">): Promise<Plan>;

  /**
   * Update plan status
   */
  updatePlanStatus(plan_id: string, status: Plan["status"]): Promise<void>;

  // =========================================================================
  // Work Items
  // =========================================================================

  /**
   * Retrieve a work item by its unique identifier
   */
  getWorkItem(work_id: string): Promise<WorkItem | null>;

  /**
   * Get all work items for a specific job
   */
  getWorkItemsByJob(job_id: string): Promise<WorkItem[]>;

  /**
   * Get all work items with a specific status
   */
  getWorkItemsByStatus(status: WorkItemStatus): Promise<WorkItem[]>;

  /**
   * Create a new work item. Timestamp is added automatically.
   */
  createWorkItem(item: Omit<WorkItem, "created_at">): Promise<WorkItem>;

  /**
   * Update work item status
   */
  updateWorkItemStatus(work_id: string, status: WorkItemStatus): Promise<void>;

  /**
   * Update work item output
   */
  updateWorkItemOutput(work_id: string, output: WorkItem["output"]): Promise<void>;

  /**
   * Update work item verification result
   */
  updateWorkItemVerification(work_id: string, verification: WorkItem["verification"]): Promise<void>;

  /**
   * Get work items that need polling.
   * Returns items where status="polling" AND external_ref.next_poll_at <= now
   */
  getItemsNeedingPoll(): Promise<WorkItem[]>;

  /**
   * Get stale work items (polling timeout exceeded).
   * Returns items where status="polling" AND external_ref.polling.timeout_at <= now
   */
  getStaleItems(): Promise<WorkItem[]>;

  // =========================================================================
  // Agents
  // =========================================================================

  /**
   * Retrieve an agent by its unique identifier
   */
  getAgent(agent_id: string): Promise<Agent | null>;

  /**
   * Get all registered agents
   */
  getAllAgents(): Promise<Agent[]>;

  /**
   * Search agents by capability using text search.
   * Note: For production, this should use MongoDB Atlas Vector Search.
   * Current implementation uses simple text matching as a fallback.
   */
  searchAgentsByCapability(query: string, limit?: number): Promise<Agent[]>;

  /**
   * Update agent statistics (partial update)
   */
  updateAgentStats(agent_id: string, stats: Partial<Agent["stats"]>): Promise<void>;

  // =========================================================================
  // Templates
  // =========================================================================

  /**
   * Retrieve a prompt template by its unique identifier
   */
  getTemplate(template_id: string): Promise<PromptTemplate | null>;

  /**
   * Get all templates for a specific agent type
   */
  getTemplatesByType(agent_type: string): Promise<PromptTemplate[]>;

  // =========================================================================
  // Transactions
  // =========================================================================

  /**
   * Create a new transaction. Timestamp is added automatically.
   */
  createTransaction(tx: Omit<Transaction, "created_at">): Promise<Transaction>;

  /**
   * Update transaction status
   */
  updateTransactionStatus(tx_id: string, status: Transaction["status"]): Promise<void>;

  /**
   * Get all transactions for a specific job
   */
  getTransactionsByJob(job_id: string): Promise<Transaction[]>;
}
