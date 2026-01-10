/**
 * LangGraph Orchestration Graph Definition
 *
 * Defines the state machine for job execution using LangGraph.
 * This is the core graph that orchestrates all internal agents and service nodes.
 *
 * Graph Flow:
 * - Entry: main_agent
 * - Planning: main_agent -> planning_agent -> plan_verifier
 * - Execution: main_agent -> prompt_agent -> dispatch_and_poll -> galileo_verify -> payment
 * - Completion: main_agent -> END
 *
 * @see /docs/designs/orchestration/graph/TECH_DESIGN.md
 */

import { StateGraph, END, START, MemorySaver } from "@langchain/langgraph";
import type { MongoClient } from "mongodb";
import type { RequestContext } from "@/lib/logging";
import { createLogger } from "@/lib/logging";

const logger = createLogger("graph");

// TODO: Install @langchain/langgraph-checkpoint-mongodb when ready for production
// For now, we use MemorySaver or a stub interface
interface MongoDBSaverOptions {
  client: MongoClient;
  dbName: string;
  collectionName: string;
}

// Stub for MongoDB checkpointer - replace with actual package when installed
class MongoDBSaver extends MemorySaver {
  constructor(_options: MongoDBSaverOptions) {
    super();
    // TODO: Implement MongoDB persistence
    console.warn("MongoDBSaver: Using in-memory fallback. Install @langchain/langgraph-checkpoint-mongodb for persistence.");
  }
}

import { OrchestrationStateAnnotation, type OrchestrationState } from "./state";
import type {
  MainAgentDecision,
  PlanVerifierDecision,
  VerificationDecision,
  PaymentDecision,
  TracedNodeName,
  ApiNodeName,
  GraphEvent,
} from "./types";
import { VERIFICATION_THRESHOLDS, MAX_VERIFICATION_RETRIES, MAX_PAYMENT_RETRIES } from "./utils";

// =============================================================================
// NODE IMPORTS (from nodes directory - implemented by another agent)
// =============================================================================

// These imports will be resolved once the nodes are implemented
import {
  mainAgentNode,
  planningAgentNode,
  planVerifierNode,
  promptAgentNode,
  galileoVerifyNode,
  paymentNode,
  dispatchAndPollNode,
} from "./nodes";

// NOTE: dispatch_and_poll node wraps the dispatch functionality from integrations.
// The actual dispatch logic is in ../integrations/dispatch.ts (dispatchToAgent, pollAgent).
// The node wrapper is defined in ./nodes/dispatch-and-poll.ts and imported above via ./nodes/index.ts.
// For now, we import a placeholder that will be implemented.

// Re-export type for the dispatch node (will use integrations internally)
export type { DispatchDependencies } from "../integrations/dispatch";

// =============================================================================
// EVENT EMISSION
// =============================================================================

/**
 * Event bus for SSE streaming.
 * This is a simple interface - actual implementation depends on infrastructure.
 */
interface EventBus {
  publish(channel: string, event: GraphEvent): void;
}

/**
 * Default no-op event bus.
 * Replace with actual implementation (Redis pub/sub, etc.)
 */
let eventBus: EventBus = {
  publish: () => {
    // No-op by default
  },
};

/**
 * Set the event bus for graph events.
 *
 * @param ctx - Request context for logging
 * @param bus - Event bus implementation
 */
export function setEventBus(ctx: RequestContext, bus: EventBus): void {
  logger.debug(ctx, "operation=set_event_bus");
  eventBus = bus;
}

/**
 * Emit an event to the event bus.
 *
 * @param ctx - Request context for logging
 * @param event - Event to emit
 */
export function emitEvent(ctx: RequestContext, event: GraphEvent): void {
  const channel =
    "job_id" in event ? `job:${event.job_id}` : "job:unknown";
  logger.debug(ctx, `operation=emit_event type=${event.type} channel=${channel}`);
  eventBus.publish(channel, event);
}

// =============================================================================
// TRACING WRAPPERS
// =============================================================================

/**
 * Wrap a node function with tracing and event emission.
 * For LLM-based nodes (main, planning, plan_verifier, prompt).
 *
 * @param nodeName - Name of the node for tracing
 * @param nodeFunction - The node function to wrap
 * @returns Wrapped node function
 */
export function withTracing<T extends OrchestrationState>(
  nodeName: TracedNodeName,
  nodeFunction: (ctx: RequestContext, state: T) => Promise<Partial<T>>
): (ctx: RequestContext, state: T) => Promise<Partial<T>> {
  return async (ctx: RequestContext, state: T): Promise<Partial<T>> => {
    const startTime = Date.now();
    logger.debug(ctx, `operation=node_start node=${nodeName} job_id=${state.job_id}`);

    try {
      // Execute the node
      const output = await nodeFunction(ctx, state);

      const durationMs = Date.now() - startTime;
      logger.debug(ctx, `operation=node_complete node=${nodeName} job_id=${state.job_id} duration_ms=${durationMs}`);

      // Emit reasoning event for SSE
      if (
        output &&
        typeof output === "object" &&
        ("reasoning" in output || "decision" in output)
      ) {
        emitEvent(ctx, {
          type: "reasoning",
          agent: nodeName,
          step: "execute",
          thought: (output as { reasoning?: string }).reasoning ?? "Processing...",
          decision: (output as { decision?: string }).decision,
        });
      }

      return output;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error(ctx, `operation=node_error node=${nodeName} job_id=${state.job_id} duration_ms=${durationMs}`, error instanceof Error ? error : undefined);

      // Emit error event
      emitEvent(ctx, {
        type: "reasoning",
        agent: nodeName,
        step: "error",
        thought: `Error: ${errorMessage}`,
        decision: "failed",
      });

      throw error;
    }
  };
}

/**
 * Wrap an API node function with tracing.
 * For non-LLM nodes (galileo_verify, payment, dispatch_and_poll).
 *
 * @param nodeName - Name of the node for tracing
 * @param nodeFunction - The node function to wrap
 * @returns Wrapped node function
 */
export function withApiTracing<T extends OrchestrationState>(
  nodeName: ApiNodeName,
  nodeFunction: (ctx: RequestContext, state: T) => Promise<Partial<T>>
): (ctx: RequestContext, state: T) => Promise<Partial<T>> {
  return async (ctx: RequestContext, state: T): Promise<Partial<T>> => {
    const startTime = Date.now();
    logger.debug(ctx, `operation=api_node_start node=${nodeName} job_id=${state.job_id}`);

    try {
      const output = await nodeFunction(ctx, state);
      const durationMs = Date.now() - startTime;
      logger.debug(ctx, `operation=api_node_complete node=${nodeName} job_id=${state.job_id} duration_ms=${durationMs}`);
      return output;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      logger.error(ctx, `operation=api_node_error node=${nodeName} job_id=${state.job_id} duration_ms=${durationMs}`, error instanceof Error ? error : undefined);
      throw error;
    }
  };
}

// =============================================================================
// ROUTING FUNCTIONS
// =============================================================================

/**
 * Main agent router - determines next step based on main_agent decision.
 *
 * @param ctx - Request context for logging
 * @param state - Current graph state
 * @returns Route key
 */
export function mainAgentRouter(ctx: RequestContext, state: OrchestrationState): MainAgentDecision {
  const decision = (state.decision as MainAgentDecision) ?? "job_failed";
  logger.debug(ctx, `operation=main_agent_router job_id=${state.job_id} decision=${decision}`);
  return decision;
}

/**
 * Plan verifier router - determines next step based on verification result.
 *
 * @param ctx - Request context for logging
 * @param state - Current graph state
 * @returns Route key
 */
export function planVerifierRouter(
  ctx: RequestContext,
  state: OrchestrationState
): PlanVerifierDecision {
  const decision = (state.decision as PlanVerifierDecision) ?? "max_attempts_exceeded";
  logger.debug(ctx, `operation=plan_verifier_router job_id=${state.job_id} decision=${decision} attempts=${state.plan_verification_attempts}`);
  return decision;
}

/**
 * Verification router - determines next step after Galileo verification.
 *
 * @param ctx - Request context for logging
 * @param state - Current graph state
 * @returns Route key
 */
export function verificationRouter(
  ctx: RequestContext,
  state: OrchestrationState
): VerificationDecision {
  const workItem = state.current_work_items[0];

  if (!workItem?.verification) {
    logger.debug(ctx, `operation=verification_router job_id=${state.job_id} decision=reject reason=no_verification`);
    return "reject";
  }

  const score = workItem.verification.score;

  if (score >= VERIFICATION_THRESHOLDS.pass) {
    logger.debug(ctx, `operation=verification_router job_id=${state.job_id} decision=pass score=${score}`);
    return "pass";
  }

  if (score >= VERIFICATION_THRESHOLDS.retry && workItem.attempt < MAX_VERIFICATION_RETRIES) {
    logger.debug(ctx, `operation=verification_router job_id=${state.job_id} decision=retry score=${score} attempt=${workItem.attempt}`);
    return "retry";
  }

  logger.debug(ctx, `operation=verification_router job_id=${state.job_id} decision=reject score=${score}`);
  return "reject";
}

/**
 * Payment router - determines next step after payment attempt.
 *
 * @param ctx - Request context for logging
 * @param state - Current graph state
 * @returns Route key
 */
export function paymentRouter(ctx: RequestContext, state: OrchestrationState): PaymentDecision {
  const workItem = state.current_work_items[0];

  if (!workItem?.payment) {
    logger.debug(ctx, `operation=payment_router job_id=${state.job_id} decision=failed reason=no_payment`);
    return "failed";
  }

  if (workItem.payment.status === "confirmed") {
    logger.debug(ctx, `operation=payment_router job_id=${state.job_id} decision=success`);
    return "success";
  }

  if (workItem.payment.retry_count < MAX_PAYMENT_RETRIES) {
    logger.debug(ctx, `operation=payment_router job_id=${state.job_id} decision=retry retry_count=${workItem.payment.retry_count}`);
    return "retry";
  }

  logger.debug(ctx, `operation=payment_router job_id=${state.job_id} decision=failed reason=max_retries`);
  return "failed";
}

// =============================================================================
// GRAPH BUILDER
// =============================================================================

/**
 * Build the orchestration graph.
 *
 * This creates the LangGraph state machine with:
 * - 6 nodes: main_agent, planning_agent, plan_verifier, prompt_agent, galileo_verify, payment
 * - 1 imported node: dispatch_and_poll (from integrations)
 * - Conditional edges for routing
 * - Entry point at main_agent
 *
 * @param ctx - Request context for logging
 * @returns Compiled graph (without checkpointer)
 */
export function buildOrchestrationGraph(ctx: RequestContext) {
  logger.info(ctx, "operation=build_graph type=standard");

  const workflow = new StateGraph(OrchestrationStateAnnotation);

  // ==========================================================================
  // ADD NODES
  // ==========================================================================

  // Internal LLM agents (wrapped with tracing)
  // Note: Node functions receive ctx bound from the graph invoke context
  workflow.addNode("main_agent", (state: OrchestrationState) =>
    withTracing("main", mainAgentNode)(ctx, state));
  workflow.addNode("planning_agent", (state: OrchestrationState) =>
    withTracing("planning", planningAgentNode)(ctx, state));
  workflow.addNode("plan_verifier", (state: OrchestrationState) =>
    withTracing("plan_verifier", planVerifierNode)(ctx, state));
  workflow.addNode("prompt_agent", (state: OrchestrationState) =>
    withTracing("prompt", promptAgentNode)(ctx, state));

  // Service nodes (API calls, wrapped with API tracing)
  workflow.addNode("dispatch_and_poll", (state: OrchestrationState) =>
    withApiTracing("dispatch_and_poll", dispatchAndPollNode)(ctx, state));
  workflow.addNode("galileo_verify", (state: OrchestrationState) =>
    withApiTracing("galileo_verify", galileoVerifyNode)(ctx, state));
  workflow.addNode("payment", (state: OrchestrationState) =>
    withApiTracing("payment", paymentNode)(ctx, state));

  // ==========================================================================
  // SET ENTRY POINT
  // ==========================================================================

  // Note: Type assertions needed because LangGraph's strict typing doesn't
  // recognize dynamically added nodes. This is a known LangGraph limitation.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graph = workflow as any;

  graph.addEdge(START, "main_agent");

  // ==========================================================================
  // ADD EDGES FROM MAIN_AGENT
  // ==========================================================================

  graph.addConditionalEdges("main_agent", (state: OrchestrationState) => mainAgentRouter(ctx, state), {
    call_planning: "planning_agent",
    execute_work: "prompt_agent",
    job_completed: END,
    job_failed: END,
  });

  // ==========================================================================
  // ADD EDGES FOR PLANNING FLOW
  // ==========================================================================

  // planning_agent always goes to plan_verifier
  graph.addEdge("planning_agent", "plan_verifier");

  // plan_verifier routes based on verification result
  graph.addConditionalEdges("plan_verifier", (state: OrchestrationState) => planVerifierRouter(ctx, state), {
    pass: "main_agent", // Plan verified, back to main for execution
    fail: "planning_agent", // Retry planning with feedback
    max_attempts_exceeded: END, // Terminal failure
  });

  // ==========================================================================
  // ADD EDGES FOR EXECUTION FLOW
  // ==========================================================================

  // prompt_agent -> dispatch_and_poll -> galileo_verify
  graph.addEdge("prompt_agent", "dispatch_and_poll");
  graph.addEdge("dispatch_and_poll", "galileo_verify");

  // galileo_verify routes based on verification score
  graph.addConditionalEdges("galileo_verify", (state: OrchestrationState) => verificationRouter(ctx, state), {
    pass: "payment",
    retry: "prompt_agent", // Retry with feedback
    reject: "main_agent", // Let main_agent decide (may try new agent)
  });

  // payment routes based on payment status
  graph.addConditionalEdges("payment", (state: OrchestrationState) => paymentRouter(ctx, state), {
    success: "main_agent", // Work complete, back to main for next item
    retry: "payment", // Retry payment
    failed: "main_agent", // Let main_agent handle failure
  });

  // ==========================================================================
  // COMPILE GRAPH
  // ==========================================================================

  logger.debug(ctx, "operation=graph_compiled type=standard");
  return workflow.compile();
}

// =============================================================================
// GRAPH WITH CHECKPOINTING
// =============================================================================

/**
 * Create a checkpointer for MongoDB.
 *
 * @param ctx - Request context for logging
 * @param client - MongoDB client
 * @param dbName - Database name
 * @param collectionName - Collection name for checkpoints
 * @returns MongoDB checkpointer
 */
export function createMongoCheckpointer(
  ctx: RequestContext,
  client: MongoClient,
  dbName: string = "agentstack",
  collectionName: string = "graph_checkpoints"
): MongoDBSaver {
  logger.debug(ctx, `operation=create_checkpointer db=${dbName} collection=${collectionName}`);
  return new MongoDBSaver({
    client,
    dbName,
    collectionName,
  });
}

/**
 * Build the orchestration graph with MongoDB checkpointing.
 *
 * @param ctx - Request context for logging
 * @param client - MongoDB client
 * @param dbName - Database name
 * @param collectionName - Collection name for checkpoints
 * @returns Compiled graph with checkpointer
 */
export function buildOrchestrationGraphWithCheckpointing(
  ctx: RequestContext,
  client: MongoClient,
  dbName: string = "agentstack",
  collectionName: string = "graph_checkpoints"
) {
  logger.info(ctx, `operation=build_graph type=checkpointed db=${dbName}`);

  const workflow = new StateGraph(OrchestrationStateAnnotation);

  // Add nodes (same as buildOrchestrationGraph)
  workflow.addNode("main_agent", (state: OrchestrationState) =>
    withTracing("main", mainAgentNode)(ctx, state));
  workflow.addNode("planning_agent", (state: OrchestrationState) =>
    withTracing("planning", planningAgentNode)(ctx, state));
  workflow.addNode("plan_verifier", (state: OrchestrationState) =>
    withTracing("plan_verifier", planVerifierNode)(ctx, state));
  workflow.addNode("prompt_agent", (state: OrchestrationState) =>
    withTracing("prompt", promptAgentNode)(ctx, state));
  workflow.addNode("dispatch_and_poll", (state: OrchestrationState) =>
    withApiTracing("dispatch_and_poll", dispatchAndPollNode)(ctx, state));
  workflow.addNode("galileo_verify", (state: OrchestrationState) =>
    withApiTracing("galileo_verify", galileoVerifyNode)(ctx, state));
  workflow.addNode("payment", (state: OrchestrationState) =>
    withApiTracing("payment", paymentNode)(ctx, state));

  // Set entry point
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graph = workflow as any;

  graph.addEdge(START, "main_agent");

  // Add edges (same as buildOrchestrationGraph)
  graph.addConditionalEdges("main_agent", (state: OrchestrationState) => mainAgentRouter(ctx, state), {
    call_planning: "planning_agent",
    execute_work: "prompt_agent",
    job_completed: END,
    job_failed: END,
  });

  graph.addEdge("planning_agent", "plan_verifier");

  graph.addConditionalEdges("plan_verifier", (state: OrchestrationState) => planVerifierRouter(ctx, state), {
    pass: "main_agent",
    fail: "planning_agent",
    max_attempts_exceeded: END,
  });

  graph.addEdge("prompt_agent", "dispatch_and_poll");
  graph.addEdge("dispatch_and_poll", "galileo_verify");

  graph.addConditionalEdges("galileo_verify", (state: OrchestrationState) => verificationRouter(ctx, state), {
    pass: "payment",
    retry: "prompt_agent",
    reject: "main_agent",
  });

  graph.addConditionalEdges("payment", (state: OrchestrationState) => paymentRouter(ctx, state), {
    success: "main_agent",
    retry: "payment",
    failed: "main_agent",
  });

  // Compile with checkpointer
  const checkpointer = createMongoCheckpointer(ctx, client, dbName, collectionName);

  logger.debug(ctx, "operation=graph_compiled type=checkpointed");
  return workflow.compile({
    checkpointer,
  });
}

// =============================================================================
// GRAPH TYPES
// =============================================================================

/**
 * Type for the compiled orchestration graph.
 */
export type OrchestrationGraph = ReturnType<typeof buildOrchestrationGraph>;

/**
 * Type for the compiled graph with checkpointing.
 */
export type OrchestrationGraphWithCheckpointing = ReturnType<
  typeof buildOrchestrationGraphWithCheckpointing
>;
