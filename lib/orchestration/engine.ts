/**
 * OrchestrationEngine
 *
 * The central coordinator for all job execution. This is the "brain" that:
 * - Receives job requests from the API layer
 * - Manages job lifecycle (start, continue, recover)
 * - Runs the LangGraph state machine
 * - Emits events for SSE streaming to the frontend
 * - Persists state to MongoDB for fault tolerance
 *
 * This is a singleton - use OrchestrationEngine.getInstance() to access.
 *
 * @see /docs/designs/orchestration/TECH_DESIGN.md
 */

import { randomUUID } from "crypto";
import type { MongoClient } from "mongodb";
import type { RequestContext } from "@/lib/logging";
import { createLogger, createContext } from "@/lib/logging";
import { getDatabaseClient, getClient } from "@/lib/db";
import type { Job, ReasoningEntry } from "@/types";

import {
  buildOrchestrationGraph,
  buildOrchestrationGraphWithCheckpointing,
  setEventBus,
  createInitialOrchestrationState,
  createContinuationState,
  type OrchestrationState,
  type GraphEvent,
  type ContextRef,
} from "./graph/index";

import {
  emitEvent as emitIntegrationEvent,
  subscribeToEvents,
  type IntegrationEventHandler,
} from "./integrations/events";

// Note: Full recovery requires complex dependency wiring
// import { recoverInFlightWork } from "./integrations/recovery";

const logger = createLogger("orchestration");

// =============================================================================
// TYPES
// =============================================================================

/**
 * Input for starting a new job
 */
export interface StartJobInput {
  user_id: string;
  prompt: string;
  budget: number;
  context?: Record<string, unknown>;
}

/**
 * Result from starting a job
 */
export interface StartJobResult {
  job_id: string;
  status: Job["status"];
}

/**
 * Input for continuing an existing job
 */
export interface ContinueJobInput {
  job_id: string;
  prompt?: string;
}

/**
 * Result from continuing a job
 */
export interface ContinueJobResult {
  version: number;
  status: Job["status"];
}

/**
 * Event callback for SSE streaming
 */
export type OrchestrationEventCallback = (event: OrchestrationEvent) => void;

/**
 * Events emitted by the orchestration engine
 */
export type OrchestrationEvent =
  // Job lifecycle
  | { type: "job:started"; job_id: string }
  | { type: "job:planning"; job_id: string }
  | { type: "job:plan_verified"; job_id: string; plan_id: string }
  | { type: "job:executing"; job_id: string }
  | { type: "job:completed"; job_id: string; version: number }
  | { type: "job:failed"; job_id: string; reason: string }
  | { type: "job:continued"; job_id: string; version: number }
  // Work item lifecycle
  | { type: "work:created"; work_id: string; action_item_id: number; action: string }
  | { type: "work:status_changed"; work_id: string; status: string }
  | { type: "work:output_received"; work_id: string; title: string }
  | { type: "work:verified"; work_id: string; score: number; passed: boolean }
  | { type: "work:payment_confirmed"; work_id: string; amount: number }
  | { type: "work:failed"; work_id: string; reason: string }
  // Reasoning (for UI transparency)
  | { type: "reasoning"; agent: string; step: string; thought: string; decision?: string };

/**
 * Subscription handle for cleanup
 */
interface Subscription {
  job_id: string;
  callback: OrchestrationEventCallback;
  unsubscribe: () => void;
}

// =============================================================================
// ORCHESTRATION ENGINE
// =============================================================================

/**
 * OrchestrationEngine - Singleton coordinator for job execution
 *
 * Usage:
 * ```typescript
 * const engine = OrchestrationEngine.getInstance();
 * const { job_id } = await engine.startJob(ctx, { user_id, prompt, budget });
 * const unsubscribe = engine.subscribe(job_id, (event) => console.log(event));
 * ```
 */
export class OrchestrationEngine {
  private static instance: OrchestrationEngine;

  private subscriptions: Map<string, Set<Subscription>> = new Map();
  private activeJobs: Map<string, Promise<void>> = new Map();
  private mongoClient: MongoClient | null = null;
  private initialized = false;

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): OrchestrationEngine {
    if (!OrchestrationEngine.instance) {
      OrchestrationEngine.instance = new OrchestrationEngine();
    }
    return OrchestrationEngine.instance;
  }

  /**
   * Initialize the engine with MongoDB client for checkpointing
   */
  async initialize(ctx: RequestContext): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.info(ctx, "operation=engine_init status=starting");

    try {
      // Get MongoDB client for checkpointing
      this.mongoClient = await getClient();

      // Set up event bridge: forward integration events to graph events
      this.setupEventBridge(ctx);

      // Recover any in-flight work from previous session
      await this.recoverOnStartup(ctx);

      this.initialized = true;
      logger.info(ctx, "operation=engine_init status=complete");
    } catch (error) {
      logger.error(ctx, "operation=engine_init status=failed", error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Start a new job
   *
   * @param ctx - Request context for logging/tracing
   * @param input - Job parameters (user_id, prompt, budget)
   * @returns Job ID and initial status
   */
  async startJob(ctx: RequestContext, input: StartJobInput): Promise<StartJobResult> {
    await this.ensureInitialized(ctx);

    const job_id = `job_${randomUUID()}`;
    const trace_id = `trace_${randomUUID()}`;

    logger.info(ctx, `operation=start_job job_id=${job_id} user_id=${input.user_id} budget=${input.budget}`);

    const db = getDatabaseClient();

    // Create job in database
    const job = await db.createJob(ctx, {
      job_id,
      user_id: input.user_id,
      status: "planning",
      prompt: input.prompt,
      budget: {
        total: input.budget,
        allocated: 0,
        spent: 0,
        remaining: input.budget,
      },
      plan_version: 0,
      current_plan_id: "", // Empty string for no plan yet
      context_summary: "", // Empty string for initial summary
      context_refs: [],
      versions: [],
      reasoning_log: [],
      token_usage: {
        operations: [],
        external_costs: [],
        total_internal_cost_usd: 0,
        total_external_cost_usd: 0,
        total_cost_usd: 0,
      },
      last_checkpoint: {
        timestamp: new Date(),
        action_item_id: 0,
        status: "pending",
      },
    });

    // Emit job started event
    this.emitToSubscribers(job_id, { type: "job:started", job_id });

    // Run the graph asynchronously (don't block the API response)
    const graphPromise = this.runGraph(ctx, job_id, input.user_id, input.prompt, input.budget, trace_id);
    this.activeJobs.set(job_id, graphPromise);

    // Clean up when done
    graphPromise.finally(() => {
      this.activeJobs.delete(job_id);
    });

    return {
      job_id: job.job_id,
      status: job.status,
    };
  }

  /**
   * Continue an existing job with user feedback
   *
   * @param ctx - Request context for logging/tracing
   * @param input - Job ID and optional continuation prompt
   * @returns New version number and status
   */
  async continueJob(ctx: RequestContext, input: ContinueJobInput): Promise<ContinueJobResult> {
    await this.ensureInitialized(ctx);

    const { job_id, prompt } = input;
    const trace_id = `trace_${randomUUID()}`;

    logger.info(ctx, `operation=continue_job job_id=${job_id}`);

    const db = getDatabaseClient();
    const job = await db.getJob(ctx, job_id);

    if (!job) {
      throw new Error(`Job not found: ${job_id}`);
    }

    if (job.status !== "completed" && job.status !== "failed") {
      throw new Error(`Job cannot be continued in status: ${job.status}`);
    }

    // Increment version
    const newVersion = job.plan_version + 1;

    // Update job status
    await db.updateJobStatus(ctx, job_id, "planning");

    // Emit continuation event
    this.emitToSubscribers(job_id, { type: "job:continued", job_id, version: newVersion });

    // Build context from previous work
    const contextRefs: ContextRef[] = job.context_refs || [];
    const contextSummary = job.context_summary || "";

    // Run the graph with continuation state
    const graphPromise = this.runContinuationGraph(
      ctx,
      job_id,
      job.user_id,
      prompt || "Continue with the same task",
      contextSummary,
      contextRefs,
      job.budget.remaining,
      trace_id
    );
    this.activeJobs.set(job_id, graphPromise);

    graphPromise.finally(() => {
      this.activeJobs.delete(job_id);
    });

    return {
      version: newVersion,
      status: "planning",
    };
  }

  /**
   * Recover a job from checkpoint (used after system restart)
   *
   * @param ctx - Request context for logging/tracing
   * @param job_id - Job ID to recover
   */
  async recoverJob(ctx: RequestContext, job_id: string): Promise<void> {
    await this.ensureInitialized(ctx);

    logger.info(ctx, `operation=recover_job job_id=${job_id}`);

    const db = getDatabaseClient();
    const job = await db.getJob(ctx, job_id);

    if (!job) {
      throw new Error(`Job not found: ${job_id}`);
    }

    // Only recover jobs that were in progress
    if (job.status !== "planning" && job.status !== "executing") {
      logger.info(ctx, `operation=recover_job job_id=${job_id} status=skip reason=terminal_status current_status=${job.status}`);
      return;
    }

    // Use checkpointed graph to resume
    if (this.mongoClient) {
      const graph = buildOrchestrationGraphWithCheckpointing(
        ctx,
        this.mongoClient,
        "agentstack",
        "graph_checkpoints"
      );

      const trace_id = `trace_${randomUUID()}`;

      // Resume from checkpoint with thread_id
      const graphPromise = (async () => {
        try {
          await graph.invoke(
            { job_id, trigger: "recover", trace_id },
            { configurable: { thread_id: job_id } }
          );
        } catch (error) {
          logger.error(ctx, `operation=recover_job job_id=${job_id} status=failed`, error instanceof Error ? error : undefined);
          await db.updateJobStatus(ctx, job_id, "failed");
          this.emitToSubscribers(job_id, {
            type: "job:failed",
            job_id,
            reason: error instanceof Error ? error.message : "Recovery failed",
          });
        }
      })();

      this.activeJobs.set(job_id, graphPromise);
      graphPromise.finally(() => this.activeJobs.delete(job_id));
    }
  }

  /**
   * Get current state of a job
   *
   * @param ctx - Request context for logging/tracing
   * @param job_id - Job ID to query
   * @returns Current job state or null if not found
   */
  async getJobState(ctx: RequestContext, job_id: string): Promise<Job | null> {
    const db = getDatabaseClient();
    return db.getJob(ctx, job_id);
  }

  /**
   * Subscribe to events for a specific job
   *
   * @param job_id - Job ID to subscribe to
   * @param callback - Function called when events occur
   * @returns Unsubscribe function
   */
  subscribe(job_id: string, callback: OrchestrationEventCallback): () => void {
    if (!this.subscriptions.has(job_id)) {
      this.subscriptions.set(job_id, new Set());
    }

    const subscription: Subscription = {
      job_id,
      callback,
      unsubscribe: () => {
        const subs = this.subscriptions.get(job_id);
        if (subs) {
          subs.delete(subscription);
          if (subs.size === 0) {
            this.subscriptions.delete(job_id);
          }
        }
      },
    };

    this.subscriptions.get(job_id)!.add(subscription);

    return subscription.unsubscribe;
  }

  /**
   * Check if a job is currently running
   */
  isJobActive(job_id: string): boolean {
    return this.activeJobs.has(job_id);
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  private async ensureInitialized(ctx: RequestContext): Promise<void> {
    if (!this.initialized) {
      await this.initialize(ctx);
    }
  }

  /**
   * Run the LangGraph for a new job
   */
  private async runGraph(
    ctx: RequestContext,
    job_id: string,
    user_id: string,
    prompt: string,
    budget: number,
    trace_id: string
  ): Promise<void> {
    const db = getDatabaseClient();

    try {
      // Emit planning event
      this.emitToSubscribers(job_id, { type: "job:planning", job_id });

      // Build graph (with checkpointing if MongoDB available)
      const graph = this.mongoClient
        ? buildOrchestrationGraphWithCheckpointing(ctx, this.mongoClient, "agentstack", "graph_checkpoints")
        : buildOrchestrationGraph(ctx);

      // Create initial state
      const initialState = createInitialOrchestrationState(ctx, job_id, user_id, prompt, budget, trace_id);

      // Run the graph
      const result = await graph.invoke(initialState as OrchestrationState, {
        configurable: { thread_id: job_id },
      });

      // Update job status based on result
      const finalStatus = result.error ? "failed" : "completed";
      await db.updateJobStatus(ctx, job_id, finalStatus);

      // Add final reasoning entry
      const entry: ReasoningEntry = {
        ts: new Date(),
        agent: "main", // Use valid agent type
        step: "complete",
        thought: result.error || "Job completed successfully",
        decision: finalStatus,
      };
      await db.addReasoningLog(ctx, job_id, entry);

      // Emit completion event
      if (finalStatus === "completed") {
        this.emitToSubscribers(job_id, { type: "job:completed", job_id, version: 1 });
      } else {
        this.emitToSubscribers(job_id, { type: "job:failed", job_id, reason: result.error || "Unknown error" });
      }

      logger.info(ctx, `operation=run_graph job_id=${job_id} status=${finalStatus}`);
    } catch (error) {
      logger.error(ctx, `operation=run_graph job_id=${job_id} status=error`, error instanceof Error ? error : undefined);

      await db.updateJobStatus(ctx, job_id, "failed");

      this.emitToSubscribers(job_id, {
        type: "job:failed",
        job_id,
        reason: error instanceof Error ? error.message : "Graph execution failed",
      });
    }
  }

  /**
   * Run the LangGraph for a continuation
   */
  private async runContinuationGraph(
    ctx: RequestContext,
    job_id: string,
    user_id: string,
    continuation_prompt: string,
    context_summary: string,
    context_refs: ContextRef[],
    budget: number,
    trace_id: string
  ): Promise<void> {
    const db = getDatabaseClient();

    try {
      this.emitToSubscribers(job_id, { type: "job:planning", job_id });

      const graph = this.mongoClient
        ? buildOrchestrationGraphWithCheckpointing(ctx, this.mongoClient, "agentstack", "graph_checkpoints")
        : buildOrchestrationGraph(ctx);

      const state = createContinuationState(
        ctx,
        job_id,
        user_id,
        continuation_prompt,
        context_summary,
        context_refs,
        budget,
        trace_id
      );

      const result = await graph.invoke(state as OrchestrationState, {
        configurable: { thread_id: job_id },
      });

      const finalStatus = result.error ? "failed" : "completed";
      await db.updateJobStatus(ctx, job_id, finalStatus);

      if (finalStatus === "completed") {
        const job = await db.getJob(ctx, job_id);
        this.emitToSubscribers(job_id, { type: "job:completed", job_id, version: job?.plan_version || 1 });
      } else {
        this.emitToSubscribers(job_id, { type: "job:failed", job_id, reason: result.error || "Unknown error" });
      }

      logger.info(ctx, `operation=run_continuation_graph job_id=${job_id} status=${finalStatus}`);
    } catch (error) {
      logger.error(ctx, `operation=run_continuation_graph job_id=${job_id} status=error`, error instanceof Error ? error : undefined);

      await db.updateJobStatus(ctx, job_id, "failed");

      this.emitToSubscribers(job_id, {
        type: "job:failed",
        job_id,
        reason: error instanceof Error ? error.message : "Continuation failed",
      });
    }
  }

  /**
   * Emit event to all subscribers of a job
   */
  private emitToSubscribers(job_id: string, event: OrchestrationEvent): void {
    const subs = this.subscriptions.get(job_id);
    if (subs) {
      for (const sub of subs) {
        try {
          sub.callback(event);
        } catch (error) {
          // Don't let subscriber errors break the engine
          const ctx = createContext();
          logger.error(ctx, `operation=emit_to_subscriber job_id=${job_id} error=callback_failed`, error instanceof Error ? error : undefined);
        }
      }
    }
  }

  /**
   * Set up event bridge between integration events and graph events
   */
  private setupEventBridge(ctx: RequestContext): void {
    // Wire up graph event bus
    setEventBus(ctx, {
      publish: (channel: string, event: GraphEvent) => {
        // Extract job_id from channel (format: "job:xxx")
        const job_id = channel.replace("job:", "");
        if (job_id && job_id !== "unknown") {
          this.emitToSubscribers(job_id, event as OrchestrationEvent);
        }
      },
    });

    // Also subscribe to integration events and forward them
    const handler: IntegrationEventHandler = (event) => {
      // Forward integration events to subscribers based on job_id in event
      if ("job_id" in event && typeof event.job_id === "string") {
        this.emitToSubscribers(event.job_id, event as unknown as OrchestrationEvent);
      }
    };

    subscribeToEvents(ctx, handler);

    logger.debug(ctx, "operation=setup_event_bridge status=complete");
  }

  /**
   * Recover in-flight work on startup
   *
   * Finds all jobs in active states (planning, plan_verification, executing)
   * and resumes them using the checkpointed graph mechanism.
   */
  private async recoverOnStartup(ctx: RequestContext): Promise<void> {
    try {
      const db = getDatabaseClient();

      // Find all active jobs that need recovery
      const activeJobs = await db.getJobsByStatus(ctx, [
        "planning",
        "plan_verification",
        "executing",
      ]);

      if (activeJobs.length === 0) {
        logger.info(ctx, "operation=recover_on_startup status=complete active_jobs=0");
        return;
      }

      logger.info(ctx, `operation=recover_on_startup status=starting active_jobs=${activeJobs.length}`);

      // Recover each job asynchronously
      for (const job of activeJobs) {
        try {
          logger.info(ctx, `operation=recover_job job_id=${job.job_id} status=${job.status}`);
          // Don't await - let jobs recover in parallel
          this.recoverJob(ctx, job.job_id).catch((error) => {
            logger.error(ctx, `operation=recover_job job_id=${job.job_id} status=failed`, error instanceof Error ? error : undefined);
          });
        } catch (error) {
          logger.error(ctx, `operation=recover_job job_id=${job.job_id} status=failed`, error instanceof Error ? error : undefined);
        }
      }

      logger.info(ctx, `operation=recover_on_startup status=initiated jobs_queued=${activeJobs.length}`);
    } catch (error) {
      // Don't fail startup for recovery errors
      logger.error(ctx, "operation=recover_on_startup status=failed", error instanceof Error ? error : undefined);
    }
  }
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Get the OrchestrationEngine instance
 * Convenience function matching the pattern used in API routes
 */
export function getOrchestrationEngine(): OrchestrationEngine {
  return OrchestrationEngine.getInstance();
}
