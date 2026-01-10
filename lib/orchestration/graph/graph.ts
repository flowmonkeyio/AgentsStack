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

import { StateGraph, END, START } from "@langchain/langgraph";
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";
import type { MongoClient } from "mongodb";

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
 * @param bus - Event bus implementation
 */
export function setEventBus(bus: EventBus): void {
  eventBus = bus;
}

/**
 * Emit an event to the event bus.
 *
 * @param event - Event to emit
 */
export function emitEvent(event: GraphEvent): void {
  const channel =
    "job_id" in event ? `job:${event.job_id}` : "job:unknown";
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
  nodeFunction: (state: T) => Promise<Partial<T>>
): (state: T) => Promise<Partial<T>> {
  return async (state: T): Promise<Partial<T>> => {
    const startTime = Date.now();

    try {
      // Execute the node
      const output = await nodeFunction(state);

      // Emit reasoning event for SSE
      if (
        output &&
        typeof output === "object" &&
        ("reasoning" in output || "decision" in output)
      ) {
        emitEvent({
          type: "reasoning",
          agent: nodeName,
          step: "execute",
          thought: (output as { reasoning?: string }).reasoning ?? "Processing...",
          decision: (output as { decision?: string }).decision,
        });
      }

      return output;
    } catch (error) {
      // Emit error event
      emitEvent({
        type: "reasoning",
        agent: nodeName,
        step: "error",
        thought: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
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
  nodeFunction: (state: T) => Promise<Partial<T>>
): (state: T) => Promise<Partial<T>> {
  return async (state: T): Promise<Partial<T>> => {
    // Simply execute - LangSmith will trace automatically when enabled
    return nodeFunction(state);
  };
}

// =============================================================================
// ROUTING FUNCTIONS
// =============================================================================

/**
 * Main agent router - determines next step based on main_agent decision.
 *
 * @param state - Current graph state
 * @returns Route key
 */
export function mainAgentRouter(state: OrchestrationState): MainAgentDecision {
  return (state.decision as MainAgentDecision) ?? "job_failed";
}

/**
 * Plan verifier router - determines next step based on verification result.
 *
 * @param state - Current graph state
 * @returns Route key
 */
export function planVerifierRouter(
  state: OrchestrationState
): PlanVerifierDecision {
  return (state.decision as PlanVerifierDecision) ?? "max_attempts_exceeded";
}

/**
 * Verification router - determines next step after Galileo verification.
 *
 * @param state - Current graph state
 * @returns Route key
 */
export function verificationRouter(
  state: OrchestrationState
): VerificationDecision {
  const workItem = state.current_work_items[0];

  if (!workItem?.verification) {
    return "reject";
  }

  const score = workItem.verification.score;

  if (score >= VERIFICATION_THRESHOLDS.pass) {
    return "pass";
  }

  if (score >= VERIFICATION_THRESHOLDS.retry && workItem.attempt < MAX_VERIFICATION_RETRIES) {
    return "retry";
  }

  return "reject";
}

/**
 * Payment router - determines next step after payment attempt.
 *
 * @param state - Current graph state
 * @returns Route key
 */
export function paymentRouter(state: OrchestrationState): PaymentDecision {
  const workItem = state.current_work_items[0];

  if (!workItem?.payment) {
    return "failed";
  }

  if (workItem.payment.status === "confirmed") {
    return "success";
  }

  if (workItem.payment.retry_count < MAX_PAYMENT_RETRIES) {
    return "retry";
  }

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
 * @returns Compiled graph (without checkpointer)
 */
export function buildOrchestrationGraph() {
  const workflow = new StateGraph(OrchestrationStateAnnotation);

  // ==========================================================================
  // ADD NODES
  // ==========================================================================

  // Internal LLM agents (wrapped with tracing)
  workflow.addNode("main_agent", withTracing("main", mainAgentNode));
  workflow.addNode("planning_agent", withTracing("planning", planningAgentNode));
  workflow.addNode("plan_verifier", withTracing("plan_verifier", planVerifierNode));
  workflow.addNode("prompt_agent", withTracing("prompt", promptAgentNode));

  // Service nodes (API calls, wrapped with API tracing)
  workflow.addNode("dispatch_and_poll", withApiTracing("dispatch_and_poll", dispatchAndPollNode));
  workflow.addNode("galileo_verify", withApiTracing("galileo_verify", galileoVerifyNode));
  workflow.addNode("payment", withApiTracing("payment", paymentNode));

  // ==========================================================================
  // SET ENTRY POINT
  // ==========================================================================

  workflow.addEdge(START, "main_agent");

  // ==========================================================================
  // ADD EDGES FROM MAIN_AGENT
  // ==========================================================================

  workflow.addConditionalEdges("main_agent", mainAgentRouter, {
    call_planning: "planning_agent",
    execute_work: "prompt_agent",
    job_completed: END,
    job_failed: END,
  });

  // ==========================================================================
  // ADD EDGES FOR PLANNING FLOW
  // ==========================================================================

  // planning_agent always goes to plan_verifier
  workflow.addEdge("planning_agent", "plan_verifier");

  // plan_verifier routes based on verification result
  workflow.addConditionalEdges("plan_verifier", planVerifierRouter, {
    pass: "main_agent", // Plan verified, back to main for execution
    fail: "planning_agent", // Retry planning with feedback
    max_attempts_exceeded: END, // Terminal failure
  });

  // ==========================================================================
  // ADD EDGES FOR EXECUTION FLOW
  // ==========================================================================

  // prompt_agent -> dispatch_and_poll -> galileo_verify
  workflow.addEdge("prompt_agent", "dispatch_and_poll");
  workflow.addEdge("dispatch_and_poll", "galileo_verify");

  // galileo_verify routes based on verification score
  workflow.addConditionalEdges("galileo_verify", verificationRouter, {
    pass: "payment",
    retry: "prompt_agent", // Retry with feedback
    reject: "main_agent", // Let main_agent decide (may try new agent)
  });

  // payment routes based on payment status
  workflow.addConditionalEdges("payment", paymentRouter, {
    success: "main_agent", // Work complete, back to main for next item
    retry: "payment", // Retry payment
    failed: "main_agent", // Let main_agent handle failure
  });

  // ==========================================================================
  // COMPILE GRAPH
  // ==========================================================================

  return workflow.compile();
}

// =============================================================================
// GRAPH WITH CHECKPOINTING
// =============================================================================

/**
 * Create a checkpointer for MongoDB.
 *
 * @param client - MongoDB client
 * @param dbName - Database name
 * @param collectionName - Collection name for checkpoints
 * @returns MongoDB checkpointer
 */
export function createMongoCheckpointer(
  client: MongoClient,
  dbName: string = "agentstack",
  collectionName: string = "graph_checkpoints"
): MongoDBSaver {
  return new MongoDBSaver({
    client,
    dbName,
    collectionName,
  });
}

/**
 * Build the orchestration graph with MongoDB checkpointing.
 *
 * @param client - MongoDB client
 * @param dbName - Database name
 * @param collectionName - Collection name for checkpoints
 * @returns Compiled graph with checkpointer
 */
export function buildOrchestrationGraphWithCheckpointing(
  client: MongoClient,
  dbName: string = "agentstack",
  collectionName: string = "graph_checkpoints"
) {
  const workflow = new StateGraph(OrchestrationStateAnnotation);

  // Add nodes (same as buildOrchestrationGraph)
  workflow.addNode("main_agent", withTracing("main", mainAgentNode));
  workflow.addNode("planning_agent", withTracing("planning", planningAgentNode));
  workflow.addNode("plan_verifier", withTracing("plan_verifier", planVerifierNode));
  workflow.addNode("prompt_agent", withTracing("prompt", promptAgentNode));
  workflow.addNode("dispatch_and_poll", withApiTracing("dispatch_and_poll", dispatchAndPollNode));
  workflow.addNode("galileo_verify", withApiTracing("galileo_verify", galileoVerifyNode));
  workflow.addNode("payment", withApiTracing("payment", paymentNode));

  // Set entry point
  workflow.addEdge(START, "main_agent");

  // Add edges (same as buildOrchestrationGraph)
  workflow.addConditionalEdges("main_agent", mainAgentRouter, {
    call_planning: "planning_agent",
    execute_work: "prompt_agent",
    job_completed: END,
    job_failed: END,
  });

  workflow.addEdge("planning_agent", "plan_verifier");

  workflow.addConditionalEdges("plan_verifier", planVerifierRouter, {
    pass: "main_agent",
    fail: "planning_agent",
    max_attempts_exceeded: END,
  });

  workflow.addEdge("prompt_agent", "dispatch_and_poll");
  workflow.addEdge("dispatch_and_poll", "galileo_verify");

  workflow.addConditionalEdges("galileo_verify", verificationRouter, {
    pass: "payment",
    retry: "prompt_agent",
    reject: "main_agent",
  });

  workflow.addConditionalEdges("payment", paymentRouter, {
    success: "main_agent",
    retry: "payment",
    failed: "main_agent",
  });

  // Compile with checkpointer
  const checkpointer = createMongoCheckpointer(client, dbName, collectionName);

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
