# ORCH_GRAPH

LangGraph graph definition, nodes, routing, state schema, and observability.

---

## Scope

**Owns:**
- LangGraph graph definition
- State schema and checkpointing
- Node definitions (4 internal agents + 2 service nodes)
- Edge routing logic
- OpenRouter LLM gateway (unified model access)
- LangSmith tracing (observability)
- Galileo verification integration
- Event emission

**Does NOT own:**
- Work item state machine (that's ORCH_WORK_LIFECYCLE)
- External API calls (that's ORCH_INTEGRATIONS)

---

## OpenRouter: Unified LLM Gateway

All internal LLM calls go through OpenRouter for unified access, normalized responses, and cost tracking.

### Why OpenRouter?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  OPENROUTER BENEFITS                                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. UNIFIED API                                                              │
│     - Single API for 400+ models from all providers                         │
│     - OpenAI-compatible interface (easy to integrate)                       │
│     - One API key for Anthropic, Google, Meta, Mistral, OpenAI             │
│                                                                              │
│  2. NORMALIZED RESPONSES                                                     │
│     - Consistent token usage format across all providers                    │
│     - Standardized error handling                                           │
│     - Usage includes: prompt_tokens, completion_tokens, total_cost          │
│                                                                              │
│  3. COST TRACKING                                                            │
│     - Per-request cost included in response                                 │
│     - No need to maintain separate pricing tables                           │
│     - Transparent pay-per-token pricing                                     │
│                                                                              │
│  4. FALLBACK & ROUTING                                                       │
│     - Automatic fallback if primary provider is down                        │
│     - Route to cheapest/fastest provider for same model                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### OpenRouter Client Setup

```typescript
import OpenAI from "openai";

// OpenRouter uses OpenAI-compatible API
const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": process.env.APP_URL,           // For rankings
    "X-Title": "AgentStack Orchestrator"           // For dashboard
  }
});

// Model configuration per agent type
const MODEL_CONFIG = {
  main_agent: "anthropic/claude-sonnet-4",           // Orchestration decisions
  planning_agent: "anthropic/claude-sonnet-4",       // Complex planning
  plan_verifier: "anthropic/claude-sonnet-4",        // Validation logic
  prompt_agent: "anthropic/claude-3.5-haiku",        // Fast prompt generation
  summarization: "google/gemini-2.5-flash"           // Cheap summarization
} as const;

// Alternative models (if credits available or for fallback)
const MODEL_ALTERNATIVES = {
  main_agent: ["openai/gpt-4o", "google/gemini-2.5-pro"],
  planning_agent: ["openai/gpt-4o", "google/gemini-2.5-pro"],
  plan_verifier: ["openai/gpt-4o-mini", "anthropic/claude-3.5-haiku"],
  prompt_agent: ["openai/gpt-4o-mini", "google/gemini-2.5-flash"],
  summarization: ["openai/gpt-4o-mini", "meta-llama/llama-3.1-8b-instruct"]
} as const;
```

### Invoking LLMs via OpenRouter

```typescript
interface LLMInvokeResult<T> {
  data: T;
  operation: LLMOperation;
}

async function invokeLLM<T>(
  agentType: keyof typeof MODEL_CONFIG,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options?: {
    temperature?: number;
    max_tokens?: number;
    response_format?: { type: "json_object" };
  }
): Promise<LLMInvokeResult<T>> {
  const model = MODEL_CONFIG[agentType];
  const startTime = Date.now();

  const response = await openrouter.chat.completions.create({
    model,
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.max_tokens ?? 4096,
    response_format: options?.response_format
  });

  // OpenRouter returns standardized usage
  const usage = response.usage;

  // Parse response
  const content = response.choices[0].message.content;
  const data = options?.response_format?.type === "json_object"
    ? JSON.parse(content)
    : content;

  return {
    data: data as T,
    operation: {
      operation_id: generateOperationId(),
      timestamp: new Date(),
      operation_type: agentType,
      model,
      native_tokens_prompt: usage?.prompt_tokens,
      native_tokens_completion: usage?.completion_tokens,
      // OpenRouter includes cost in response (via x-openrouter-cost header or usage)
      total_cost: calculateCostFromUsage(model, usage),
      metadata: {
        duration_ms: Date.now() - startTime,
        finish_reason: response.choices[0].finish_reason
      }
    }
  };
}

// Cost calculation (OpenRouter provides this, but fallback if needed)
function calculateCostFromUsage(
  model: string,
  usage: { prompt_tokens?: number; completion_tokens?: number }
): number {
  // OpenRouter pricing is available at: https://openrouter.ai/models
  // These are approximate - actual cost comes from OpenRouter response
  const PRICING: Record<string, { input: number; output: number }> = {
    "anthropic/claude-sonnet-4": { input: 3.0, output: 15.0 },
    "anthropic/claude-3.5-haiku": { input: 0.8, output: 4.0 },
    "google/gemini-2.5-flash": { input: 0.075, output: 0.30 },
    "google/gemini-2.5-pro": { input: 1.25, output: 10.0 },
    "openai/gpt-4o": { input: 2.5, output: 10.0 },
    "openai/gpt-4o-mini": { input: 0.15, output: 0.60 },
    "meta-llama/llama-3.1-8b-instruct": { input: 0.055, output: 0.055 }
  };

  const pricing = PRICING[model] || { input: 1.0, output: 1.0 };
  const promptCost = ((usage?.prompt_tokens || 0) / 1_000_000) * pricing.input;
  const completionCost = ((usage?.completion_tokens || 0) / 1_000_000) * pricing.output;

  return promptCost + completionCost;
}
```

### Internal Agent LLM Calls

Each LLM call returns both the parsed output AND the operation tracking data.
Node functions are responsible for including the operation in their state update.

```typescript
// Planning Agent uses OpenRouter
// Returns both data and operation - caller must include operation in state update
async function invokePlanningLLM(
  input: PlanningAgentInput
): Promise<LLMInvokeResult<PlanningAgentOutput>> {
  return invokeLLM<PlanningAgentOutput>(
    "planning_agent",
    [
      { role: "system", content: PLANNING_AGENT_SYSTEM_PROMPT },
      { role: "user", content: formatPlanningInput(input) }
    ],
    { response_format: { type: "json_object" } }
  );
}

// Plan Verifier uses OpenRouter
async function invokePlanVerifierLLM(
  input: PlanVerifierInput
): Promise<LLMInvokeResult<PlanVerification>> {
  return invokeLLM<PlanVerification>(
    "plan_verifier",
    [
      { role: "system", content: PLAN_VERIFIER_SYSTEM_PROMPT },
      { role: "user", content: formatVerifierInput(input) }
    ],
    { response_format: { type: "json_object" } }
  );
}

// Prompt Agent uses OpenRouter (faster model)
async function invokePromptLLM(
  input: PromptAgentInput
): Promise<LLMInvokeResult<PromptAgentOutput>> {
  return invokeLLM<PromptAgentOutput>(
    "prompt_agent",
    [
      { role: "system", content: PROMPT_AGENT_SYSTEM_PROMPT },
      { role: "user", content: formatPromptInput(input) }
    ],
    { response_format: { type: "json_object" }, temperature: 0.3 }
  );
}

// Generate unique operation ID for cost tracking
// Uses nanoid for compact, URL-safe unique IDs
import { nanoid } from "nanoid";

function generateOperationId(): string {
  return `op_${nanoid(12)}`;  // e.g., "op_V1StGXR8_Z5j"
}

// Helper to store operation - returns updated token_usage array for state update
// This is NOT a side-effect function - it returns the new array to be included in node output
function appendOperation(
  currentUsage: LLMOperation[],
  operation: LLMOperation
): LLMOperation[] {
  return [...currentUsage, operation];
}

// Example usage in a node function:
// The node returns the updated token_usage array as part of its Partial<GraphState> output
// LangGraph merges this into the state automatically
//
// async function planningAgentNode(state: GraphState): Promise<Partial<GraphState>> {
//   const result = await invokePlanningLLM(input);
//   return {
//     plan: result.data,
//     token_usage: appendOperation(state.token_usage, result.operation),
//     reasoning: "Created plan..."
//   };
// }

// For convenience, wrap LLM invoke functions to track operations automatically
async function invokePlanningLLMWithTracking(
  state: GraphState,
  input: PlanningAgentInput
): Promise<{ output: PlanningAgentOutput; token_usage: LLMOperation[] }> {
  const result = await invokeLLM<PlanningAgentOutput>(
    "planning_agent",
    [
      { role: "system", content: PLANNING_AGENT_SYSTEM_PROMPT },
      { role: "user", content: formatPlanningInput(input) }
    ],
    { response_format: { type: "json_object" } }
  );

  return {
    output: result.data,
    token_usage: appendOperation(state.token_usage, result.operation)
  };
}

// Helper to compute totals from operations array (for job summary/billing)
function computeTokenUsageTotals(operations: LLMOperation[]): {
  total_cost: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  by_operation_type: Record<string, { cost: number; count: number }>;
} {
  const totals = {
    total_cost: 0,
    total_prompt_tokens: 0,
    total_completion_tokens: 0,
    by_operation_type: {} as Record<string, { cost: number; count: number }>
  };

  for (const op of operations) {
    totals.total_cost += op.total_cost;
    totals.total_prompt_tokens += op.native_tokens_prompt ?? 0;
    totals.total_completion_tokens += op.native_tokens_completion ?? 0;

    if (!totals.by_operation_type[op.operation_type]) {
      totals.by_operation_type[op.operation_type] = { cost: 0, count: 0 };
    }
    totals.by_operation_type[op.operation_type].cost += op.total_cost;
    totals.by_operation_type[op.operation_type].count += 1;
  }

  return totals;
}
```

---

## LangSmith: Observability & Tracing

LangSmith provides comprehensive tracing for LangGraph execution.

### Why LangSmith?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  LANGSMITH FOR LANGGRAPH                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. NATIVE LANGGRAPH INTEGRATION                                            │
│     - Built by LangChain team - first-class support                         │
│     - Automatic tracing of graph nodes and edges                            │
│     - Visualize graph execution in real-time                                │
│                                                                              │
│  2. TRACE HIERARCHY                                                          │
│     - Job → Graph Run → Node Executions → LLM Calls                         │
│     - See exactly which node failed and why                                 │
│     - Trace input/output at every step                                      │
│                                                                              │
│  3. DEBUGGING                                                                │
│     - Replay failed runs with same inputs                                   │
│     - Compare runs side-by-side                                             │
│     - Filter by latency, cost, errors                                       │
│                                                                              │
│  4. DATASETS & EVALUATION                                                    │
│     - Create test datasets from production traces                           │
│     - Run evaluations on agent outputs                                      │
│     - Track quality metrics over time                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### LangSmith Setup

```typescript
// Environment variables
// LANGCHAIN_TRACING_V2=true
// LANGCHAIN_API_KEY=ls_...
// LANGCHAIN_PROJECT=agentstack-prod

import { Client } from "langsmith";
import { traceable } from "langsmith/traceable";
import { wrapOpenAI } from "langsmith/wrappers";

// Initialize LangSmith client
const langsmith = new Client({
  apiKey: process.env.LANGCHAIN_API_KEY,
  apiUrl: "https://api.smith.langchain.com"
});

// Wrap OpenRouter client for automatic tracing
const tracedOpenRouter = wrapOpenAI(openrouter);

// Configure LangGraph with LangSmith tracing
const graph = workflow.compile({
  checkpointer: mongoCheckpointer
});
// LangGraph automatically traces to LangSmith when LANGCHAIN_TRACING_V2=true
```

### Traceable Functions

```typescript
import { traceable } from "langsmith/traceable";

// Wrap agent functions for detailed tracing
const tracedPlanningAgent = traceable(
  async (input: PlanningAgentInput): Promise<PlanningAgentOutput> => {
    return invokePlanningLLM(input);
  },
  { name: "planning_agent", run_type: "chain" }
);

const tracedPlanVerifier = traceable(
  async (input: PlanVerifierInput): Promise<PlanVerification> => {
    return invokePlanVerifierLLM(input);
  },
  { name: "plan_verifier", run_type: "chain" }
);

const tracedPromptAgent = traceable(
  async (input: PromptAgentInput): Promise<PromptAgentOutput> => {
    return invokePromptLLM(input);
  },
  { name: "prompt_agent", run_type: "chain" }
);
```

### Custom Trace Metadata

```typescript
import { RunTree } from "langsmith";

async function executeJobWithTracing(
  job_id: string,
  input: JobInput
): Promise<JobResult> {
  // Create root trace for entire job
  const rootTrace = new RunTree({
    name: `job_${job_id}`,
    run_type: "chain",
    inputs: { job_id, prompt: input.prompt, budget: input.budget },
    extra: {
      metadata: {
        job_id,
        user_id: input.user_id,
        environment: process.env.NODE_ENV
      }
    }
  });

  try {
    await rootTrace.postRun();

    // Execute graph - LangGraph auto-traces to LangSmith
    const result = await graph.invoke(
      { ...input, job_id, trace_id: rootTrace.id },
      {
        configurable: { thread_id: job_id },
        callbacks: [rootTrace.getCallbacks()]  // Link to parent trace
      }
    );

    // End trace with success
    await rootTrace.patchRun({
      outputs: { status: "completed", work_items_count: result.completed_work_ids.length },
      end_time: Date.now()
    });

    return result;

  } catch (error) {
    // End trace with error
    await rootTrace.patchRun({
      error: error.message,
      end_time: Date.now()
    });
    throw error;
  }
}
```

### Trace Structure

```
Job Trace (job_001)
├── Graph Run
│   ├── main_agent (node)
│   │   └── LLM Call (anthropic/claude-sonnet-4)
│   │       ├── Input: { trigger: "new_job", prompt: "..." }
│   │       ├── Output: { decision: "call_planning" }
│   │       ├── Tokens: 450 in, 120 out
│   │       └── Cost: $0.0018
│   │
│   ├── planning_agent (node)
│   │   ├── Discovery (sub-trace)
│   │   │   ├── voyage_embed
│   │   │   └── voyage_rerank
│   │   └── LLM Call (anthropic/claude-sonnet-4)
│   │       ├── Input: { prompt: "...", budget: 0.50 }
│   │       ├── Output: { action_items: [...] }
│   │       ├── Tokens: 1200 in, 2500 out
│   │       └── Cost: $0.041
│   │
│   ├── plan_verifier (node)
│   │   └── LLM Call
│   │
│   ├── prompt_agent (node) [x6 - one per action item]
│   │   └── LLM Call (anthropic/claude-3.5-haiku)
│   │
│   ├── external_agent_dispatch (node)
│   │
│   ├── galileo_verify (node)
│   │
│   └── payment (node)
│
└── Total: 15 nodes, $0.12 cost, 45s duration
```

---

## LangGraph Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  LANGGRAPH STATE MACHINE                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  NODES (4 Internal Agents + 2 Service Calls):                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  main_agent     │  │ planning_agent  │  │  plan_verifier  │             │
│  │  (orchestrator) │  │ (plan+picks)    │  │  (GATE)         │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  prompt_agent   │  │ galileo_verify  │  │    payment      │             │
│  │  (prompt gen)   │  │ (API call)      │  │   (API call)    │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                              │
│  Note: galileo_verify and payment are NOT LLM agents - they're API calls   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Graph State Schema

```typescript
interface GraphState {
  // Job context
  job_id: string;
  user_id: string;
  trigger: "new_job" | "continue" | "recover";

  // Planning inputs
  prompt: string;
  budget: number;
  context?: Record<string, any>;

  // Continuation
  continuation_prompt?: string;
  context_summary?: string;
  context_refs?: ContextRef[];

  // Plan state
  plan?: PlanningAgentOutput;
  plan_verification?: PlanVerifierOutput;
  plan_verification_attempts: number;  // Tracks retry count (max 3)
  plan_verification_feedback?: string[];  // Issues from failed verification

  // Execution state
  current_work_items: WorkItem[];
  completed_work_ids: string[];

  // Resources (loaded from DB)
  available_agents: Agent[];
  available_templates: PromptTemplate[];

  // Output
  final_output?: any;
  error?: string;

  // Tracing
  trace_id: string;

  // Token Usage & Cost Tracking - stored per operation (not accumulated)
  // Each operation is stored separately for client visibility and auditing
  // Follows OpenRouter format: https://openrouter.ai/docs/api/reference/overview
  token_usage: LLMOperation[];
}

// Each LLM call is stored as a separate operation
interface LLMOperation {
  operation_id: string;           // Unique ID for this operation
  timestamp: Date;
  operation_type:                 // What triggered this LLM call
    | "main_agent"
    | "planning_agent"
    | "plan_verifier"
    | "prompt_agent"
    | "discovery_embed"
    | "discovery_rerank"
    | "summarization"
    | "external_agent";           // External agent LLM calls (when breakdown provided)
  model: string;                  // e.g., "anthropic/claude-sonnet-4", "voyage-3"
  native_tokens_prompt?: number;  // Input tokens - optional
  native_tokens_completion?: number; // Output tokens - optional
  total_cost: number;             // Cost in USD - REQUIRED
  metadata?: Record<string, any>; // Additional context (e.g., which work_id)
}

// Simple model usage from external agents (doesn't require operation tracking fields)
// External agents return this format - simpler than LLMOperation
interface ModelUsage {
  model: string;                  // e.g., "openai/gpt-4o", "anthropic/claude-sonnet-4"
  native_tokens_prompt?: number;  // Input tokens (native tokenizer) - optional
  native_tokens_completion?: number; // Output tokens (native tokenizer) - optional
  total_cost: number;             // Cost in USD for this model call
}

// For external agents - price mandatory, breakdown optional
// Uses ModelUsage (simpler) - transformed to LLMOperation when storing
interface AgentUsage {
  total_cost: number;             // REQUIRED: total cost in USD
  model_usage?: ModelUsage[];     // OPTIONAL: per-model breakdown
}

interface ContextRef {
  work_id: string;
  title: string;
  description: string;
}
```

---

## Graph Definition

```typescript
import { StateGraph, END } from "@langchain/langgraph";

const workflow = new StateGraph<GraphState>({
  channels: graphStateSchema
});

// Add nodes - ALL nodes are traced for observability
workflow.addNode("main_agent", withTracing("main", mainAgentNode));
workflow.addNode("planning_agent", withTracing("planning", planningAgentNode));
workflow.addNode("plan_verifier", withTracing("plan_verifier", planVerifierNode));
workflow.addNode("prompt_agent", withTracing("prompt", promptAgentNode));
workflow.addNode("galileo_verify", withApiTracing("galileo_verify", galileoVerifyNode));
workflow.addNode("payment", withApiTracing("payment", paymentNode));

// Add edges
workflow.setEntryPoint("main_agent");

workflow.addConditionalEdges("main_agent", mainAgentRouter, {
  "call_planning": "planning_agent",
  "execute_work": "prompt_agent",
  "job_completed": END,
  "job_failed": END
});

workflow.addEdge("planning_agent", "plan_verifier");

workflow.addConditionalEdges("plan_verifier", planVerifierRouter, {
  "pass": "main_agent",
  "fail": "planning_agent",           // Retry with feedback
  "max_attempts_exceeded": END        // Terminal failure
});

// NOTE: dispatch_and_poll node is implemented by ORCH_INTEGRATIONS module (Phase 3.4)
// This module imports the node function: import { dispatchAndPollNode } from "../integrations/dispatch";
// The node handles: HTTP dispatch to external agent, polling for completion, result retrieval
workflow.addEdge("prompt_agent", "dispatch_and_poll");
workflow.addEdge("dispatch_and_poll", "galileo_verify");

workflow.addConditionalEdges("galileo_verify", verificationRouter, {
  "pass": "payment",
  "retry": "prompt_agent",
  "reject": "main_agent"
});

workflow.addConditionalEdges("payment", paymentRouter, {
  "success": "main_agent",
  "retry": "payment",
  "failed": "main_agent"
});

const graph = workflow.compile({
  checkpointer: mongoCheckpointer  // Saves state to MongoDB
});
```

---

## Graph Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  EDGES (Flows):                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  start ──────────────────────► main_agent                                   │
│                                    │                                        │
│                                    ▼                                        │
│                             planning_agent                                  │
│                      (plan + priorities + agent picks + template picks)     │
│                                    │                                        │
│                                    ▼                                        │
│                         ┌─────────────────────┐                             │
│                         │   plan_verifier     │                             │
│                         │   (MANDATORY GATE)  │                             │
│                         └──────────┬──────────┘                             │
│                                    │                                        │
│                         ┌──────────┴──────────┐                             │
│                         ▼                     ▼                             │
│                      [PASS]               [FAIL]                            │
│                         │                     │                             │
│                         ▼                     ▼                             │
│                   main_agent            retry planning                      │
│                   (exec loop)                                               │
│                         │                                                   │
│     ┌───────────────────┼───────────────────┐                              │
│     │  FOR EACH TODO:   │                   │                              │
│     │                   ▼                   │                              │
│     │            prompt_agent               │                              │
│     │     (template + context → prompt)     │                              │
│     │                   │                   │                              │
│     │                   ▼                   │                              │
│     │            external_call              │                              │
│     │     (sub-agent receives prompt)       │                              │
│     │                   │                   │                              │
│     │                   ▼                   │                              │
│     │          galileo_verify (API)         │                              │
│     │                   │                   │                              │
│     │        ┌──────────┴──────────┐        │                              │
│     │        ▼                     ▼        │                              │
│     │    [PASS]               [FAIL]        │                              │
│     │        │                     │        │                              │
│     │        ▼                     ▼        │                              │
│     │     payment            retry (≤3x)    │                              │
│     │        │               with feedback  │                              │
│     │        └──────────┬──────────┘        │                              │
│     │                   │                   │                              │
│     └───────────────────┴───────────────────┘                              │
│                         │                                                   │
│                         ▼                                                   │
│                   spawn_check                                               │
│                         │                                                   │
│              ┌──────────┴──────────┐                                       │
│              ▼                     ▼                                        │
│           [MORE]               [DONE]                                       │
│              │                     │                                        │
│              └─── (cycle) ─────────┴──────────────────────────────► end     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Node Tracing with LangSmith

**All LangGraph node calls are automatically traced via LangSmith.**

LangSmith handles tracing when `LANGCHAIN_TRACING_V2=true` is set. The `withTracing` wrapper adds custom metadata and SSE event emission.

```typescript
import { traceable } from "langsmith/traceable";

// Wrap node functions for tracing + SSE events
function withTracing<T extends GraphState>(
  nodeName: "main" | "planning" | "plan_verifier" | "prompt",
  nodeFunction: (state: T) => Promise<Partial<T>>
): (state: T) => Promise<Partial<T>> {

  // Wrap with LangSmith traceable
  const traced = traceable(nodeFunction, {
    name: nodeName,
    run_type: "chain",
    metadata: (state: T) => ({
      job_id: state.job_id,
      trace_id: state.trace_id
    })
  });

  return async (state: T): Promise<Partial<T>> => {
    const startTime = Date.now();

    try {
      // Execute the traced node
      const output = await traced(state);

      // Emit reasoning event for SSE (frontend visibility)
      if (output.reasoning || output.decision) {
        emitEvent({
          type: "reasoning",
          agent: nodeName,
          step: "execute",
          thought: output.reasoning || "Processing...",
          decision: output.decision
        });
      }

      // Collect token usage if present in output
      if (output.token_usage) {
        // Token usage is already tracked via invokeLLM
      }

      return output;

    } catch (error) {
      // LangSmith automatically captures errors
      // Emit error event for SSE
      emitEvent({
        type: "reasoning",
        agent: nodeName,
        step: "error",
        thought: `Error: ${error.message}`,
        decision: "failed"
      });

      throw error;
    }
  };
}

// API call tracing (for non-LLM nodes like galileo_verify and payment)
function withApiTracing<T extends GraphState>(
  nodeName: string,
  nodeFunction: (state: T) => Promise<Partial<T>>
): (state: T) => Promise<Partial<T>> {

  const traced = traceable(nodeFunction, {
    name: nodeName,
    run_type: "tool"  // API calls are "tool" type in LangSmith
  });

  return async (state: T): Promise<Partial<T>> => {
    return traced(state);
  };
}
```

---

## Node Definitions

### Main Agent Node

```typescript
async function mainAgentNode(state: GraphState): Promise<Partial<GraphState>> {
  // Orchestrator - decides next action

  if (state.trigger === "new_job" && !state.plan) {
    return {
      decision: "call_planning",
      reasoning: "New job, need to create plan"
    };
  }

  if (state.trigger === "continue" && !state.plan) {
    return {
      decision: "call_planning",
      reasoning: `Continuation requested: "${state.continuation_prompt}"`
    };
  }

  // Check for work items to execute
  const actionable = getActionableTodos(state.plan, state.completed_work_ids);

  if (actionable.length > 0) {
    return {
      decision: "execute_work",
      current_work_items: actionable.map(todo => createWorkItem(todo)),
      reasoning: `Executing ${actionable.length} actionable TODOs`
    };
  }

  // Check if all done
  if (allTodosCompleted(state.plan, state.completed_work_ids)) {
    return {
      decision: "job_completed",
      final_output: synthesizeOutput(state),
      reasoning: "All TODOs completed successfully"
    };
  }

  return {
    decision: "job_failed",
    error: "No actionable items but job not complete",
    reasoning: "Stuck state - no progress possible"
  };
}
```

### Planning Agent Node

```typescript
async function planningAgentNode(state: GraphState): Promise<Partial<GraphState>> {
  // Creates plan, picks agents, picks templates
  // On retry: receives feedback from failed verification

  const isRetry = (state.plan_verification_attempts || 0) > 0;

  const planInput: PlanningAgentInput = {
    prompt: state.continuation_prompt || state.prompt,
    budget: state.budget,
    context: state.context,
    is_continuation: state.trigger === "continue",
    continuation_prompt: state.continuation_prompt,
    context_summary: state.context_summary,
    context_refs: state.context_refs,
    available_agents: state.available_agents,
    available_templates: state.available_templates,

    // Feedback from failed verification (for retry)
    is_plan_retry: isRetry,
    previous_plan: isRetry ? state.plan : undefined,
    verification_feedback: state.plan_verification_feedback  // Issues to address
  };

  // LLM call returns both data and operation for cost tracking
  const result = await invokePlanningLLM(planInput);

  // Return updated state including the new operation in token_usage
  // LangGraph merges this partial state into the full GraphState
  return {
    plan: result.data,
    token_usage: appendOperation(state.token_usage, result.operation),
    plan_verification_feedback: undefined,  // Clear feedback after use
    reasoning: isRetry
      ? `Revised plan addressing: ${state.plan_verification_feedback?.join(", ")}`
      : `Created plan with ${result.data.action_items.length} TODOs`,
    decision: "Plan created, sending to verification"
  };
}
```

### Planning Agent Retry Input

When plan verification fails, Planning Agent receives feedback:

```typescript
interface PlanningAgentInput {
  // ... standard fields ...

  // Retry-specific fields (when is_plan_retry = true)
  is_plan_retry?: boolean;
  previous_plan?: PlanningAgentOutput;      // The rejected plan
  verification_feedback?: string[];          // Issues identified by Plan Verifier
}

// Example feedback:
// [
//   "Agent 'copywriter_001' does not exist",
//   "TODO #3 depends on TODO #5 (circular dependency)",
//   "Total estimated cost $0.75 exceeds budget $0.50"
// ]
```

### Planning Agent Output: Agent Selection Reasoning

Planning Agent includes reasoning for every agent selection:

```typescript
interface PlanningAgentOutput {
  requirements: { deliverables: Deliverable[]; constraints: any };
  action_items: ActionItem[];

  // Agent selection reasoning (for audit trail)
  agent_selection_reasoning: Array<{
    todo_id: number;
    selected_agent: string;
    reasoning: string;
    candidates_considered: string[];
    scores: Record<string, number>;
  }>;
}

// Selection factors:
// 1. Quality (avg_score) - agent's historical verification scores
// 2. Price (base_price) - normalized inverse
// 3. Reliability (jobs_completed) - historical success rate
//
// Composite score by task criticality:
// - Critical: quality=0.6, price=0.2, reliability=0.2
// - Standard: quality=0.4, price=0.4, reliability=0.2
// - Simple:   quality=0.3, price=0.5, reliability=0.2
//
// Hard constraint: avg_score >= 0.80 required
```

### Plan Verifier Node

```typescript
const MAX_PLAN_VERIFICATION_ATTEMPTS = 3;

async function planVerifierNode(state: GraphState): Promise<Partial<GraphState>> {
  // MANDATORY GATE - validates plan before execution

  // LLM call returns both verification result and operation for cost tracking
  const result = await invokePlanVerifierLLM({
    plan: state.plan,
    available_agents: state.available_agents,
    available_templates: state.available_templates,
    budget: state.budget
  });

  const verification = result.data;
  const attempts = (state.plan_verification_attempts || 0) + 1;

  // Base state update - always includes token_usage
  const baseUpdate = {
    plan_verification: verification,
    plan_verification_attempts: attempts,
    token_usage: appendOperation(state.token_usage, result.operation)
  };

  if (verification.result === "PASS") {
    return {
      ...baseUpdate,
      reasoning: "Plan validated successfully",
      decision: "pass"
    };
  }

  // FAIL case - check if max attempts exceeded
  if (attempts >= MAX_PLAN_VERIFICATION_ATTEMPTS) {
    return {
      ...baseUpdate,
      reasoning: `Plan verification failed after ${attempts} attempts: ${verification.issues.join(", ")}`,
      decision: "max_attempts_exceeded",
      error: "Planning failed: max verification attempts exceeded"
    };
  }

  // FAIL with retries remaining - store feedback for Planning Agent
  return {
    ...baseUpdate,
    plan_verification_feedback: verification.issues,  // Pass feedback to Planning Agent
    reasoning: `Plan rejected (attempt ${attempts}/${MAX_PLAN_VERIFICATION_ATTEMPTS}): ${verification.issues.join(", ")}`,
    decision: "fail"
  };
}
```

### Prompt Agent Node

```typescript
async function promptAgentNode(state: GraphState): Promise<Partial<GraphState>> {
  // Generates final prompt from template + context

  const workItem = state.current_work_items[0];  // Process one at a time for tracing
  const actionItem = state.plan.action_items.find(a => a.id === workItem.action_item_id);
  const template = state.available_templates.find(t => t.template_id === actionItem.template_id);

  // LLM call returns both prompt output and operation for cost tracking
  const result = await invokePromptLLM({
    action_item: actionItem,
    template,
    context: {
      summary: state.context_summary,
      refs: state.context_refs
    },
    is_retry: workItem.attempt > 1,
    retry_context: workItem.retry_context
  });

  return {
    current_work_items: state.current_work_items.map(w =>
      w.work_id === workItem.work_id
        ? { ...w, generated_prompt: result.data.generated_prompt, requirements: result.data.requirements }
        : w
    ),
    token_usage: appendOperation(state.token_usage, result.operation),
    reasoning: `Generated prompt using template ${template.template_id}`,
    decision: "Prompt ready for dispatch"
  };
}
```

---

## Routing Functions

```typescript
function mainAgentRouter(state: GraphState): string {
  return state.decision;  // "call_planning" | "execute_work" | "job_completed" | "job_failed"
}

function planVerifierRouter(state: GraphState): string {
  // Three outcomes: pass, fail (retry), or max_attempts_exceeded (terminal)
  return state.decision;  // "pass" | "fail" | "max_attempts_exceeded"
}

function verificationRouter(state: GraphState): string {
  const workItem = state.current_work_items[0];
  const score = workItem.verification.score;

  if (score >= 0.90) return "pass";
  if (score >= 0.60 && workItem.attempt < 3) return "retry";
  return "reject";
}

function paymentRouter(state: GraphState): string {
  const workItem = state.current_work_items[0];

  if (workItem.payment.status === "confirmed") return "success";
  if (workItem.payment.retry_count < 3) return "retry";
  return "failed";
}
```

---

## Checkpointing to MongoDB

LangGraph automatically checkpoints graph state after each node execution.

### Configuration

```typescript
import { MongoDBSaver } from "@langchain/langgraph-checkpoint-mongodb";

const mongoCheckpointer = new MongoDBSaver({
  client: mongoClient,
  dbName: "agentstack",
  collectionName: "graph_checkpoints"
});

const graph = workflow.compile({
  checkpointer: mongoCheckpointer
});
```

### Checkpoint Schema

```typescript
interface GraphCheckpoint {
  thread_id: string;      // job_id (used as thread identifier)
  checkpoint_id: string;  // Unique checkpoint ID (auto-generated)
  parent_id: string | null;  // Previous checkpoint (for history)
  checkpoint: GraphState;    // Full graph state at this point
  metadata: {
    step: number;            // Node execution count
    timestamp: Date;
    node_name: string;       // Which node just completed
  };
}
```

### When Checkpoints Are Created

| Event | Checkpoint Created | State Captured |
|-------|-------------------|----------------|
| After `main_agent` node | Yes | Job decision, routing |
| After `planning_agent` node | Yes | Plan, action_items |
| After `plan_verifier` node | Yes | Verification result |
| After `prompt_agent` node | Yes | Generated prompt |
| After `galileo_verify` node | Yes | Verification score |
| After `payment` node | Yes | Payment status |

### Graph Resumption (Recovery)

```typescript
async function resumeGraph(job_id: string): Promise<void> {
  // Get latest checkpoint for this job
  const checkpoint = await mongoCheckpointer.get(job_id);

  if (!checkpoint) {
    throw new Error(`No checkpoint found for job ${job_id}`);
  }

  // Resume graph from checkpoint
  const result = await graph.invoke(
    null,  // No new input - resume from state
    {
      configurable: {
        thread_id: job_id,           // Use job_id as thread
        checkpoint_id: checkpoint.checkpoint_id  // Resume from this checkpoint
      }
    }
  );

  return result;
}
```

### Recovery Flow

```
System Restart
    ↓
recoverInFlightWork() [ORCH_INTEGRATIONS]
    ↓
Find jobs: status ∈ ["planning", "executing"]
    ↓
For each job:
    ↓
resumeGraph(job_id)
    ↓
LangGraph loads checkpoint → Resumes from last node
    ↓
Graph continues execution normally
```

### Checkpoint Cleanup

```typescript
// Retain checkpoints for 24 hours after job completion
async function cleanupCheckpoints(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Find completed/failed jobs older than 24h
  const oldJobs = await db.jobs.find({
    status: { $in: ["completed", "failed"] },
    completed_at: { $lt: cutoff }
  });

  for (const job of oldJobs) {
    await mongoCheckpointer.deleteThread(job.job_id);
  }
}
```

---

## Event Emission

Graph nodes emit events for SSE streaming to frontend.

```typescript
interface EventEmitter {
  emit(event: OrchestrationEvent): void;
}

// Called within nodes
function emitEvent(event: OrchestrationEvent): void {
  // Publish to event bus (Redis pub/sub or similar)
  eventBus.publish(`job:${event.job_id}`, event);
}

// Event types emitted by graph
type GraphEvent =
  | { type: "job:started"; job_id: string }
  | { type: "job:planning"; job_id: string }
  | { type: "job:plan_verified"; job_id: string; plan_id: string }
  | { type: "job:executing"; job_id: string }
  | { type: "job:completed"; job_id: string; version: number }
  | { type: "job:failed"; job_id: string; reason: string }
  | { type: "reasoning"; agent: string; step: string; thought: string; decision?: string };
```

---

## Interface: Dependencies

| Module | What We Need | Interface |
|--------|--------------|-----------|
| **ORCH_WORK_LIFECYCLE** | State transitions | `WorkLifecycle` |
| **ORCH_INTEGRATIONS** | External calls | `Integrations` |
| **ORCH_DISCOVERY** | Agent discovery | `DiscoveryService` |
| **DATA** | Checkpointing, resource loading | `DatabaseClient` |
| **OpenRouter** | LLM gateway | OpenAI-compatible client |
| **LangSmith** | Tracing & observability | `@langsmith/langsmith` |
| **GALILEO** | Output verification | `GalileoClient.verify()` |

---

## Interface: Provides

### GraphRunner

```typescript
interface GraphRunner {
  // Start new job
  startJob(input: {
    user_id: string;
    prompt: string;
    budget: number;
    context?: Record<string, any>;
  }): Promise<{ job_id: string; trace_id: string }>;

  // Continue existing job
  continueJob(input: {
    job_id: string;
    prompt: string;
  }): Promise<{ version: number }>;

  // Resume from checkpoint (recovery)
  recoverJob(job_id: string): Promise<void>;

  // Get current state
  getState(job_id: string): Promise<GraphState>;
}
```

---

## Trace Examples

### Planning Agent Trace

```json
{
  "trace_id": "trace_abc123",
  "job_id": "job_001",
  "timestamp": "2024-01-10T15:30:00Z",
  "agent": "planning",
  "step": "execute",
  "input": {
    "prompt": "Create marketing campaign for FocusFlow",
    "budget": 0.50
  },
  "output": {
    "action_items": [
      { "id": 1, "item": "Create campaign strategy" },
      { "id": 2, "item": "Write ad headlines" }
    ]
  },
  "reasoning": "Analyzed prompt, identified 6 deliverables needed",
  "decision": "Created plan with 6 action items",
  "duration_ms": 2500,
  "tokens_used": { "input": 450, "output": 1200 }
}
```

### Main Agent Trace

```json
{
  "trace_id": "trace_def456",
  "job_id": "job_001",
  "timestamp": "2024-01-10T15:30:05Z",
  "agent": "main",
  "step": "execute",
  "input": {
    "completed_work_ids": ["work_001"],
    "pending_count": 5
  },
  "output": {
    "decision": "execute_work",
    "current_work_items": ["work_002", "work_003", "work_004"]
  },
  "reasoning": "TODOs 2, 3, 4 have dependencies satisfied",
  "decision": "Execute 3 TODOs in parallel",
  "duration_ms": 150
}
```

---

## Planning Agent: Agent Selection Algorithm

Planning Agent uses discovery results (from ORCH_DISCOVERY) and applies selection logic.

### Selection Factors

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  AGENT SELECTION FACTORS                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  For each TODO, Planning Agent considers:                                    │
│                                                                              │
│  1. TASK REQUIREMENTS                                                        │
│     - Capabilities needed (does agent have them?)                           │
│     - Complexity level (simple copy vs strategic planning)                  │
│     - Quality criticality (hero image vs supporting graphic)                │
│                                                                              │
│  2. AGENT ATTRIBUTES (from discovery results)                               │
│     - relevance_score (from Voyage AI rerank)                               │
│     - base_price                                                            │
│     - stats.avg_score (historical verification scores)                      │
│     - stats.jobs_completed (reliability indicator)                          │
│                                                                              │
│  3. BUDGET CONTEXT                                                           │
│     - Budget remaining                                                       │
│     - Tasks remaining in plan                                               │
│     - Average cost per remaining task                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Selection Algorithm

```typescript
interface SelectionInput {
  candidates: RerankResult[];   // From ORCH_DISCOVERY
  action_item: ActionItem;
  budget_remaining: number;
  tasks_remaining: number;
  task_criticality: "critical" | "standard" | "simple";
}

interface SelectionOutput {
  selected_agent: string;
  reasoning: string;
  candidates_considered: string[];
  scores: Record<string, number>;
}

function selectBestAgent(input: SelectionInput): SelectionOutput {
  const {
    candidates,
    action_item,
    budget_remaining,
    tasks_remaining,
    task_criticality
  } = input;

  // STEP 1: Calculate budget per task
  const budgetPerTask = budget_remaining / tasks_remaining;

  // STEP 2: Filter by hard constraints
  const qualified = candidates.filter(c =>
    c.stats.avg_score >= 0.80 &&      // Quality threshold
    c.base_price <= budgetPerTask     // Affordable
  );

  if (qualified.length === 0) {
    throw new Error(`No qualified agents for task: ${action_item.item}`);
  }

  // STEP 3: Calculate composite scores
  const weights = getWeightsByTaskCriticality(task_criticality);
  const scored = qualified.map(candidate => {
    const score = calculateCompositeScore(candidate, qualified, weights);
    return { candidate, score };
  });

  // STEP 4: Sort by score (descending)
  scored.sort((a, b) => b.score - a.score);

  // STEP 5: Select top candidate
  const selected = scored[0];

  return {
    selected_agent: selected.candidate.agent_id,
    reasoning: generateReasoning(selected, input),
    candidates_considered: qualified.map(c => c.agent_id),
    scores: Object.fromEntries(scored.map(s => [s.candidate.agent_id, s.score]))
  };
}
```

### Composite Score Calculation

```typescript
interface SelectionWeights {
  quality: number;
  price: number;
  reliability: number;
  relevance: number;
}

function getWeightsByTaskCriticality(
  criticality: "critical" | "standard" | "simple"
): SelectionWeights {
  switch (criticality) {
    case "critical":
      // Foundational tasks - quality matters most
      return { quality: 0.45, price: 0.15, reliability: 0.20, relevance: 0.20 };
    case "standard":
      // Balanced approach
      return { quality: 0.30, price: 0.30, reliability: 0.20, relevance: 0.20 };
    case "simple":
      // Cost-effective is fine
      return { quality: 0.20, price: 0.40, reliability: 0.20, relevance: 0.20 };
  }
}

function calculateCompositeScore(
  candidate: RerankResult,
  allCandidates: RerankResult[],
  weights: SelectionWeights
): number {
  // Normalize price (lower is better, so invert)
  const prices = allCandidates.map(c => c.base_price);
  const maxPrice = Math.max(...prices);
  const normalizedPrice = 1 - (candidate.base_price / maxPrice);

  // Normalize reliability (jobs completed)
  const jobs = allCandidates.map(c => c.stats.jobs_completed);
  const maxJobs = Math.max(...jobs);
  const normalizedReliability = candidate.stats.jobs_completed / maxJobs;

  // Quality and relevance are already 0-1
  const quality = candidate.stats.avg_score;
  const relevance = candidate.relevance_score;

  // Composite score
  return (
    weights.quality * quality +
    weights.price * normalizedPrice +
    weights.reliability * normalizedReliability +
    weights.relevance * relevance
  );
}
```

### Task Criticality Determination

```typescript
function determineTaskCriticality(
  action_item: ActionItem,
  all_action_items: ActionItem[]
): "critical" | "standard" | "simple" {
  // Critical: foundational tasks that others depend on
  const dependents = all_action_items.filter(a =>
    a.depends_on.includes(action_item.id)
  );

  if (dependents.length >= 3) {
    return "critical";  // Many tasks depend on this
  }

  if (action_item.depends_on.length === 0 && dependents.length > 0) {
    return "critical";  // Root task with dependents
  }

  // Simple: leaf tasks with no dependents
  if (dependents.length === 0) {
    return "simple";
  }

  return "standard";
}
```

### Selection Reasoning Examples

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  EXAMPLE 1: Critical Task                                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Task: "Create campaign strategy" (foundation for everything)               │
│  Budget: $0.50, Tasks remaining: 6 → $0.08/task                             │
│                                                                              │
│  Candidates after discovery:                                                 │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  Agent A: $0.08, avg_score: 0.94, relevance: 0.92                     │ │
│  │  Agent B: $0.04, avg_score: 0.85, relevance: 0.88                     │ │
│  │  Agent C: $0.03, avg_score: 0.78, relevance: 0.75  ← FILTERED (< 0.80)│ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  Weights (critical): quality=0.45, price=0.15, reliability=0.20, rel=0.20  │
│                                                                              │
│  Scores:                                                                     │
│  Agent A: 0.45(0.94) + 0.15(0.5) + 0.20(1.0) + 0.20(0.92) = 0.88           │
│  Agent B: 0.45(0.85) + 0.15(1.0) + 0.20(0.25) + 0.20(0.88) = 0.73          │
│                                                                              │
│  → Pick Agent A                                                              │
│  Reasoning: "Critical task, prioritized quality. Agent A has highest       │
│              score (0.94) and strong relevance (0.92). Price $0.08 within  │
│              budget."                                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  EXAMPLE 2: Simple Task, Budget Tight                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Task: "Generate supporting graphics" (leaf task, no dependents)            │
│  Budget: $0.12, Tasks remaining: 3 → $0.04/task                             │
│                                                                              │
│  Candidates:                                                                 │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  Agent X: $0.08, avg_score: 0.95  ← FILTERED (over budget)            │ │
│  │  Agent Y: $0.03, avg_score: 0.88, relevance: 0.85                     │ │
│  │  Agent Z: $0.02, avg_score: 0.82, relevance: 0.80                     │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  Weights (simple): quality=0.20, price=0.40, reliability=0.20, rel=0.20    │
│                                                                              │
│  → Pick Agent Y                                                              │
│  Reasoning: "Simple task, prioritized cost. Agent Y offers good quality    │
│              (0.88) at low price ($0.03), saving budget for other tasks."  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Plan Verifier: Validation Rules

Plan Verifier is a MANDATORY GATE. No execution without verification pass.

### Validation Categories

```typescript
interface PlanVerification {
  result: "PASS" | "FAIL";
  issues: string[];           // List of problems found
  suggestions?: string[];     // How to fix (for Planning Agent retry)
}

async function verifyPlan(input: {
  plan: PlanningAgentOutput;
  available_agents: Agent[];
  available_templates: PromptTemplate[];
  budget: number;
}): Promise<PlanVerification> {
  const issues: string[] = [];
  const suggestions: string[] = [];

  // Run all validations
  validateCompleteness(input.plan, issues, suggestions);
  validateDependencies(input.plan, issues, suggestions);
  validateAgentPicks(input.plan, input.available_agents, issues, suggestions);
  validateTemplatePicks(input.plan, input.available_templates, issues, suggestions);
  validateBudget(input.plan, input.budget, issues, suggestions);

  return {
    result: issues.length === 0 ? "PASS" : "FAIL",
    issues,
    suggestions
  };
}
```

### 1. Completeness Validation

```typescript
function validateCompleteness(
  plan: PlanningAgentOutput,
  issues: string[],
  suggestions: string[]
): void {
  // Every deliverable must have at least one action item
  for (const deliverable of plan.requirements.deliverables) {
    const actionItems = plan.action_items.filter(
      a => a.deliverable_id === deliverable.id
    );

    if (actionItems.length === 0) {
      issues.push(`Deliverable "${deliverable.name}" has no action items`);
      suggestions.push(`Add action item(s) for deliverable ${deliverable.id}`);
    }
  }

  // Every action item must have required fields
  for (const item of plan.action_items) {
    if (!item.item || item.item.trim() === "") {
      issues.push(`Action item ${item.id} has empty description`);
    }
    if (!item.agent_id && item.resource_type !== "SELF") {
      issues.push(`Action item ${item.id} has no agent assigned`);
    }
    if (!item.template_id) {
      issues.push(`Action item ${item.id} has no template assigned`);
    }
  }
}
```

### 2. Dependency Validation

```typescript
function validateDependencies(
  plan: PlanningAgentOutput,
  issues: string[],
  suggestions: string[]
): void {
  const itemIds = new Set(plan.action_items.map(a => a.id));

  for (const item of plan.action_items) {
    // Check all dependencies exist
    for (const depId of item.depends_on) {
      if (!itemIds.has(depId)) {
        issues.push(
          `Action item ${item.id} depends on non-existent item ${depId}`
        );
        suggestions.push(`Remove dependency on ${depId} or add missing item`);
      }
    }
  }

  // Check for circular dependencies (DAG validation)
  const cycles = detectCycles(plan.action_items);
  if (cycles.length > 0) {
    issues.push(`Circular dependency detected: ${cycles.join(" → ")}`);
    suggestions.push("Break the cycle by removing one dependency");
  }

  // Check priority respects dependencies
  for (const item of plan.action_items) {
    for (const depId of item.depends_on) {
      const dep = plan.action_items.find(a => a.id === depId);
      if (dep && dep.priority > item.priority) {
        issues.push(
          `Item ${item.id} (priority ${item.priority}) depends on ` +
          `item ${depId} (priority ${dep.priority}) - dependency has lower priority`
        );
      }
    }
  }
}

function detectCycles(items: ActionItem[]): number[] {
  const visited = new Set<number>();
  const recursionStack = new Set<number>();
  const path: number[] = [];

  function dfs(id: number): boolean {
    visited.add(id);
    recursionStack.add(id);
    path.push(id);

    const item = items.find(a => a.id === id);
    if (item) {
      for (const depId of item.depends_on) {
        if (!visited.has(depId)) {
          if (dfs(depId)) return true;
        } else if (recursionStack.has(depId)) {
          path.push(depId);
          return true;  // Cycle found
        }
      }
    }

    path.pop();
    recursionStack.delete(id);
    return false;
  }

  for (const item of items) {
    if (!visited.has(item.id)) {
      if (dfs(item.id)) {
        return path;
      }
    }
  }
  return [];
}
```

### 3. Agent Picks Validation

```typescript
function validateAgentPicks(
  plan: PlanningAgentOutput,
  available_agents: Agent[],
  issues: string[],
  suggestions: string[]
): void {
  const agentIds = new Set(available_agents.map(a => a.agent_id));

  for (const item of plan.action_items) {
    if (item.resource_type === "SELF") continue;  // Internal agent

    // Agent must exist
    if (!agentIds.has(item.agent_id)) {
      issues.push(`Agent "${item.agent_id}" does not exist in marketplace`);
      suggestions.push(`Choose from available agents or use SELF`);
      continue;
    }

    // Agent must be active
    const agent = available_agents.find(a => a.agent_id === item.agent_id);
    if (agent.status !== "active") {
      issues.push(`Agent "${item.agent_id}" is not active (status: ${agent.status})`);
      suggestions.push(`Choose an active agent`);
    }

    // Agent quality must meet threshold
    if (agent.stats.avg_score < 0.80) {
      issues.push(
        `Agent "${item.agent_id}" has low quality score ` +
        `(${agent.stats.avg_score}) - minimum 0.80 required`
      );
    }
  }
}
```

### 4. Template Picks Validation

```typescript
function validateTemplatePicks(
  plan: PlanningAgentOutput,
  available_templates: PromptTemplate[],
  issues: string[],
  suggestions: string[]
): void {
  const templateIds = new Set(available_templates.map(t => t.template_id));

  for (const item of plan.action_items) {
    // Template must exist
    if (!templateIds.has(item.template_id)) {
      issues.push(`Template "${item.template_id}" does not exist`);
      suggestions.push(`Choose from available templates`);
      continue;
    }

    // Template must match agent type (if external agent)
    if (item.resource_type !== "SELF") {
      const template = available_templates.find(
        t => t.template_id === item.template_id
      );
      const agent = plan.action_items.find(a => a.id === item.id);

      // This check requires knowing agent types - simplified here
      // In practice, verify template.agent_type matches agent capabilities
    }
  }
}
```

### 5. Budget Validation

```typescript
function validateBudget(
  plan: PlanningAgentOutput,
  budget: number,
  issues: string[],
  suggestions: string[]
): void {
  // Calculate total estimated cost
  const totalCost = plan.action_items
    .filter(a => a.resource_type !== "SELF")
    .reduce((sum, a) => sum + a.estimated_cost, 0);

  if (totalCost > budget) {
    issues.push(
      `Total estimated cost ($${totalCost.toFixed(2)}) exceeds ` +
      `budget ($${budget.toFixed(2)})`
    );
    suggestions.push(
      `Reduce costs by ${((totalCost - budget) / totalCost * 100).toFixed(0)}% ` +
      `or use cheaper agents`
    );
  }

  // Warn if budget is tight (< 10% buffer)
  const buffer = (budget - totalCost) / budget;
  if (buffer > 0 && buffer < 0.10) {
    // Not an issue, but worth noting in reasoning
    suggestions.push(`Budget is tight (${(buffer * 100).toFixed(0)}% buffer)`);
  }
}
```

---

## Prompt Agent: Template Substitution Flow

Prompt Agent transforms template + context into final prompt for external agent.

### Template Substitution Process

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PROMPT AGENT FLOW                                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  INPUT:                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  template_id: "tpl_copywriting_headlines_001"                           ││
│  │  action_item: { item: "Write 5 headlines for FocusFlow" }               ││
│  │  context: {                                                              ││
│  │    summary: "Target: professionals 28-45. Tone: empowering...",         ││
│  │    refs: [{ work_id: "work_001", title: "Strategy", desc: "..." }],     ││
│  │    loaded_content: { "work_001": { ... } }  // If needed                ││
│  │  }                                                                       ││
│  │  requirements: ["Minimum 5 headlines", "Under 10 words each"]           ││
│  │  is_retry: false                                                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                              │                                               │
│                              ▼                                               │
│  STEP 1: FETCH TEMPLATE                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  template = db.prompt_templates.findOne({ template_id })                ││
│  │                                                                         ││
│  │  template.template =                                                     ││
│  │    "You are a copywriter. Create headlines for {{product_name}}.        ││
│  │     Target audience: {{target_audience}}                                 ││
│  │     Tone: {{tone}}                                                       ││
│  │     Context: {{context}}                                                 ││
│  │     Requirements: {{requirements}}"                                      ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                              │                                               │
│                              ▼                                               │
│  STEP 2: SUBSTITUTE PLACEHOLDERS                                            │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  {{product_name}} → "FocusFlow"                                         ││
│  │  {{target_audience}} → "professionals 28-45"                            ││
│  │  {{tone}} → "empowering, modern"                                        ││
│  │  {{context}} → context.summary + relevant loaded_content                ││
│  │  {{requirements}} → bullet list of requirements                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                              │                                               │
│                              ▼                                               │
│  STEP 3: IF RETRY, ADD FEEDBACK                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  (Only if is_retry = true)                                              ││
│  │                                                                         ││
│  │  Append to prompt:                                                       ││
│  │  "PREVIOUS ATTEMPT FEEDBACK:                                            ││
│  │   Your previous output had these issues:                                 ││
│  │   - Only 3 headlines instead of 5                                        ││
│  │   - Headline #2 was 15 words (should be under 10)                        ││
│  │   Please address these specific issues."                                 ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                              │                                               │
│                              ▼                                               │
│  OUTPUT:                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  {                                                                      ││
│  │    generated_prompt: "You are a copywriter. Create headlines for       ││
│  │      FocusFlow. Target audience: professionals 28-45. Tone:            ││
│  │      empowering, modern. Context: [...] Requirements: [...]",          ││
│  │    requirements: ["Minimum 5 headlines", "Under 10 words each"],       ││
│  │    template_used: "tpl_copywriting_headlines_001"                       ││
│  │  }                                                                      ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  → Sent to external agent via HTTP POST                                     │
│  → External agent sees FINAL PROMPT only (not template)                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation

```typescript
interface PromptAgentInput {
  template_id: string;
  action_item: ActionItem;
  context: {
    summary: string;
    refs: ContextRef[];
    loaded_content: Record<string, any>;
  };
  requirements: string[];
  is_retry: boolean;
  retry_context?: {
    previous_output: any;
    verification_issues: string[];
    suggestions: string[];
  };
}

interface PromptAgentOutput {
  generated_prompt: string;
  requirements: string[];
  template_used: string;
}

async function generatePrompt(input: PromptAgentInput): Promise<PromptAgentOutput> {
  // Step 1: Fetch template
  const template = await db.prompt_templates.findOne({
    template_id: input.template_id
  });

  if (!template) {
    throw new Error(`Template not found: ${input.template_id}`);
  }

  // Step 2: Build substitution values
  const values = await buildSubstitutionValues(input, template);

  // Step 3: Substitute placeholders
  let prompt = template.template;
  for (const [key, value] of Object.entries(values)) {
    prompt = prompt.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }

  // Step 4: Add retry feedback if applicable
  if (input.is_retry && input.retry_context) {
    prompt = addRetryFeedback(prompt, template, input.retry_context);
  }

  return {
    generated_prompt: prompt,
    requirements: input.requirements,
    template_used: input.template_id
  };
}

async function buildSubstitutionValues(
  input: PromptAgentInput,
  template: PromptTemplate
): Promise<Record<string, string>> {
  const values: Record<string, string> = {};

  // Extract values from action item and context
  // This uses LLM to intelligently map context to template fields
  const extraction = await invokePromptLLM({
    task: "Extract values for template placeholders",
    template_schema: template.input_schema,
    action_item: input.action_item,
    context_summary: input.context.summary,
    available_content: Object.keys(input.context.loaded_content)
  });

  // Map extracted values
  for (const [key, schema] of Object.entries(template.input_schema)) {
    if (extraction[key]) {
      values[key] = extraction[key];
    } else if (schema.required) {
      throw new Error(`Required template field "${key}" could not be filled`);
    }
  }

  // Always include context and requirements
  values.context = formatContext(input.context);
  values.requirements = formatRequirements(input.requirements);

  return values;
}

function formatContext(context: PromptAgentInput["context"]): string {
  let formatted = context.summary;

  // Add loaded content if any
  for (const [workId, content] of Object.entries(context.loaded_content)) {
    const ref = context.refs.find(r => r.work_id === workId);
    if (ref) {
      formatted += `\n\n[${ref.title}]:\n${JSON.stringify(content, null, 2)}`;
    }
  }

  return formatted;
}

function formatRequirements(requirements: string[]): string {
  return requirements.map((r, i) => `${i + 1}. ${r}`).join("\n");
}

function addRetryFeedback(
  prompt: string,
  template: PromptTemplate,
  retryContext: PromptAgentInput["retry_context"]
): string {
  const feedback = `

---

PREVIOUS ATTEMPT FEEDBACK:

Your previous output did not fully meet the requirements. Please address these specific issues:

${retryContext.verification_issues.map(i => `- ${i}`).join("\n")}

Suggestions for improvement:
${retryContext.suggestions.map(s => `- ${s}`).join("\n")}

Please provide a revised output that addresses ALL of the above issues.
`;

  return prompt + feedback;
}
```

### Retry Template Usage

```typescript
// Some templates have a specific retry_template for better retry prompts
interface PromptTemplate {
  template: string;
  retry_template?: string;  // Optional specialized retry template
  // ...
}

function addRetryFeedback(
  prompt: string,
  template: PromptTemplate,
  retryContext: PromptAgentInput["retry_context"]
): string {
  // Use specialized retry template if available
  if (template.retry_template) {
    return template.retry_template
      .replace("{{original_prompt}}", prompt)
      .replace("{{issues}}", retryContext.verification_issues.join("\n"))
      .replace("{{suggestions}}", retryContext.suggestions.join("\n"))
      .replace("{{previous_output}}", JSON.stringify(retryContext.previous_output));
  }

  // Fallback to generic retry feedback
  return prompt + formatGenericRetryFeedback(retryContext);
}
```
