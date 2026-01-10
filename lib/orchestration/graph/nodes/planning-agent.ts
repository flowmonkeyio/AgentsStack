/**
 * Planning Agent Node
 *
 * Creates plan, picks agents, picks templates.
 * On retry: receives feedback from failed verification.
 *
 * @see /docs/designs/orchestration/graph/TECH_DESIGN.md
 */

import OpenAI from "openai";
import { nanoid } from "nanoid";
import type { LLMOperation, ActionItem, Agent, PromptTemplate, Deliverable } from "@/types";
import type { RerankResult } from "@/lib/orchestration/discovery";
import { withTracing } from "@/lib/galileo";
import type { RequestContext } from "@/lib/logging";
import { createLogger } from "@/lib/logging";
import type { OrchestrationState } from "../types";

const logger = createLogger("graph");

// =============================================================================
// OPENROUTER CLIENT
// =============================================================================

/**
 * OpenRouter client (OpenAI-compatible API)
 */
const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000",
    "X-Title": "AgentStack Orchestrator",
  },
});

/**
 * Model for planning agent (complex planning tasks)
 */
const PLANNING_AGENT_MODEL = "anthropic/claude-sonnet-4";

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Input for planning agent
 */
export interface PlanningAgentInput {
  prompt: string;
  budget: number;
  context?: Record<string, unknown>;

  // Continuation support
  is_continuation?: boolean;
  continuation_prompt?: string;
  context_summary?: string;
  context_refs?: Array<{
    work_id: string;
    title: string;
    description: string;
  }>;

  // Available resources
  available_agents: Agent[];
  available_templates: PromptTemplate[];

  // Retry support
  is_plan_retry?: boolean;
  previous_plan?: PlanningAgentOutput;
  verification_feedback?: string[];
}

/**
 * Output from planning agent
 */
export interface PlanningAgentOutput {
  requirements: {
    deliverables: Deliverable[];
    constraints: {
      budget: number;
      brand_tone?: string;
      [key: string]: unknown;
    };
  };
  action_items: ActionItem[];
  agent_selection_reasoning: AgentSelectionReasoning[];
}

/**
 * Reasoning for agent selection (audit trail)
 */
export interface AgentSelectionReasoning {
  todo_id: number;
  selected_agent: string;
  reasoning: string;
  candidates_considered: string[];
  scores: Record<string, number>;
}

/**
 * Weights for agent selection composite score
 */
interface SelectionWeights {
  quality: number;
  price: number;
  reliability: number;
  relevance: number;
}

/**
 * Result from LLM invocation
 */
interface LLMInvokeResult<T> {
  data: T;
  operation: LLMOperation;
}

// =============================================================================
// COST CALCULATION
// =============================================================================

/**
 * OpenRouter pricing per million tokens (approximate, actual cost from response)
 */
const PRICING: Record<string, { input: number; output: number }> = {
  "anthropic/claude-sonnet-4": { input: 3.0, output: 15.0 },
  "anthropic/claude-3.5-haiku": { input: 0.8, output: 4.0 },
  "google/gemini-2.5-flash": { input: 0.075, output: 0.3 },
  "google/gemini-2.5-pro": { input: 1.25, output: 10.0 },
  "openai/gpt-4o": { input: 2.5, output: 10.0 },
  "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
};

/**
 * Calculate cost from token usage
 */
function calculateCostFromUsage(
  model: string,
  usage: { prompt_tokens?: number; completion_tokens?: number }
): number {
  const pricing = PRICING[model] ?? { input: 1.0, output: 1.0 };
  const promptCost = ((usage?.prompt_tokens ?? 0) / 1_000_000) * pricing.input;
  const completionCost = ((usage?.completion_tokens ?? 0) / 1_000_000) * pricing.output;
  return promptCost + completionCost;
}

/**
 * Generate unique operation ID
 */
function generateOperationId(): string {
  return `op_${nanoid(12)}`;
}

/**
 * Append operation to usage array (pure function)
 */
function appendOperation(
  currentUsage: LLMOperation[],
  operation: LLMOperation
): LLMOperation[] {
  return [...currentUsage, operation];
}

// =============================================================================
// SYSTEM PROMPTS
// =============================================================================

const PLANNING_AGENT_SYSTEM_PROMPT = `You are a planning agent for an AI task orchestration system.

Your job is to:
1. Analyze the user's request and identify specific deliverables
2. Break down the request into discrete action items
3. Assign priorities and dependencies between action items
4. Select the best available agent for each action item
5. Select the best template for each action item's prompt

For each action item, you must provide:
- id: Unique integer ID
- item: Clear description of the task
- priority: 1 (highest) to N (lowest)
- depends_on: Array of action item IDs this depends on
- deliverable_id: Which deliverable this contributes to
- agent_id: Selected agent ID (or null if SELF)
- template_id: Selected template ID
- estimated_cost: Estimated cost in USD
- resource_type: "AGENT" or "SELF"
- status: "pending"
- work_id: null (assigned during execution)

For agent selection, consider:
- Quality (avg_score): Agent's historical verification scores
- Price (base_price): Cost per task
- Reliability (jobs_completed): Track record
- Relevance: How well capabilities match the task

Respond with valid JSON only.`;

// =============================================================================
// LLM INVOCATION
// =============================================================================

/**
 * Invoke planning LLM via OpenRouter
 */
async function invokePlanningLLM(
  ctx: RequestContext,
  input: PlanningAgentInput
): Promise<LLMInvokeResult<PlanningAgentOutput>> {
  const startTime = Date.now();

  logger.info(ctx, `operation=invoke_planning_llm model=${PLANNING_AGENT_MODEL} status=started`);

  const userContent = formatPlanningInput(input);

  try {
    const response = await openrouter.chat.completions.create({
      model: PLANNING_AGENT_MODEL,
      messages: [
        { role: "system", content: PLANNING_AGENT_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      temperature: 0.7,
      max_tokens: 4096,
      response_format: { type: "json_object" },
    });

    const usage = response.usage;
    const content = response.choices[0]?.message?.content ?? "{}";
    const data = JSON.parse(content) as PlanningAgentOutput;
    const durationMs = Date.now() - startTime;

    logger.info(ctx, `operation=invoke_planning_llm model=${PLANNING_AGENT_MODEL} input_tokens=${usage?.prompt_tokens ?? 0} output_tokens=${usage?.completion_tokens ?? 0} duration_ms=${durationMs} status=completed`);

    return {
      data,
      operation: {
        operation_id: generateOperationId(),
        timestamp: new Date(),
        operation_type: "planning_agent",
        model: PLANNING_AGENT_MODEL,
        native_tokens_prompt: usage?.prompt_tokens,
        native_tokens_completion: usage?.completion_tokens,
        total_cost: calculateCostFromUsage(PLANNING_AGENT_MODEL, usage ?? {}),
        metadata: {
          duration_ms: durationMs,
          finish_reason: response.choices[0]?.finish_reason,
          is_retry: input.is_plan_retry ?? false,
        },
      },
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    logger.error(ctx, `operation=invoke_planning_llm model=${PLANNING_AGENT_MODEL} duration_ms=${durationMs} status=failed`, error instanceof Error ? error : undefined);
    throw error;
  }
}

/**
 * Format input for planning LLM
 */
function formatPlanningInput(input: PlanningAgentInput): string {
  const sections: string[] = [];

  // User request
  sections.push(`## User Request\n${input.prompt}`);

  // Budget
  sections.push(`## Budget\n$${input.budget.toFixed(2)} USD`);

  // Context (if continuation)
  if (input.is_continuation && input.context_summary) {
    sections.push(`## Context Summary\n${input.context_summary}`);

    if (input.context_refs && input.context_refs.length > 0) {
      const refs = input.context_refs
        .map((r) => `- ${r.title}: ${r.description}`)
        .join("\n");
      sections.push(`## Previous Work References\n${refs}`);
    }
  }

  // Additional context
  if (input.context) {
    sections.push(`## Additional Context\n${JSON.stringify(input.context, null, 2)}`);
  }

  // Retry feedback
  if (input.is_plan_retry && input.verification_feedback) {
    sections.push(`## Previous Plan Issues (ADDRESS THESE)\n${input.verification_feedback.join("\n")}`);
  }

  // Available agents
  const agentList = input.available_agents
    .map(
      (a) =>
        `- ${a.agent_id}: ${a.name} (price: $${a.pricing.base_price}, score: ${a.stats.avg_score}, capabilities: ${a.capabilities.substring(0, 100)}...)`
    )
    .join("\n");
  sections.push(`## Available Agents\n${agentList}`);

  // Available templates
  const templateList = input.available_templates
    .map((t) => `- ${t.template_id}: ${t.name} (type: ${t.agent_type})`)
    .join("\n");
  sections.push(`## Available Templates\n${templateList}`);

  return sections.join("\n\n");
}

// =============================================================================
// AGENT SELECTION ALGORITHM
// =============================================================================

/**
 * Get weights based on task criticality
 */
function getWeightsByTaskCriticality(
  criticality: "critical" | "standard" | "simple"
): SelectionWeights {
  switch (criticality) {
    case "critical":
      return { quality: 0.45, price: 0.15, reliability: 0.2, relevance: 0.2 };
    case "standard":
      return { quality: 0.3, price: 0.3, reliability: 0.2, relevance: 0.2 };
    case "simple":
      return { quality: 0.2, price: 0.4, reliability: 0.2, relevance: 0.2 };
  }
}

/**
 * Determine task criticality based on dependencies
 */
function determineTaskCriticality(
  actionItem: ActionItem,
  allActionItems: ActionItem[]
): "critical" | "standard" | "simple" {
  const dependents = allActionItems.filter((a) =>
    a.depends_on.includes(actionItem.id)
  );

  if (dependents.length >= 3) {
    return "critical"; // Many tasks depend on this
  }

  if (actionItem.depends_on.length === 0 && dependents.length > 0) {
    return "critical"; // Root task with dependents
  }

  if (dependents.length === 0) {
    return "simple"; // Leaf task
  }

  return "standard";
}

/**
 * Calculate composite score for agent selection
 */
function calculateCompositeScore(
  candidate: RerankResult,
  allCandidates: RerankResult[],
  weights: SelectionWeights
): number {
  // Normalize price (lower is better)
  const prices = allCandidates.map((c) => c.base_price);
  const maxPrice = Math.max(...prices);
  const normalizedPrice = maxPrice > 0 ? 1 - candidate.base_price / maxPrice : 0;

  // Normalize reliability
  const jobs = allCandidates.map((c) => c.stats.jobs_completed);
  const maxJobs = Math.max(...jobs);
  const normalizedReliability = maxJobs > 0 ? candidate.stats.jobs_completed / maxJobs : 0;

  // Quality and relevance are already 0-1
  const quality = candidate.stats.avg_score;
  const relevance = candidate.relevance_score;

  return (
    weights.quality * quality +
    weights.price * normalizedPrice +
    weights.reliability * normalizedReliability +
    weights.relevance * relevance
  );
}

/**
 * Select best agent for a task
 */
export function selectBestAgent(
  candidates: RerankResult[],
  actionItem: ActionItem,
  budgetRemaining: number,
  tasksRemaining: number,
  allActionItems: ActionItem[]
): AgentSelectionReasoning {
  const budgetPerTask = budgetRemaining / tasksRemaining;
  const criticality = determineTaskCriticality(actionItem, allActionItems);

  // Filter by hard constraints
  const qualified = candidates.filter(
    (c) => c.stats.avg_score >= 0.8 && c.base_price <= budgetPerTask
  );

  if (qualified.length === 0) {
    // Fallback to any candidate if none meet constraints
    const bestAvailable = candidates.sort(
      (a, b) => b.stats.avg_score - a.stats.avg_score
    )[0];
    return {
      todo_id: actionItem.id,
      selected_agent: bestAvailable?.agent_id ?? "unknown",
      reasoning: `No agents met constraints (quality >= 0.80, price <= $${budgetPerTask.toFixed(2)}). Selected best available.`,
      candidates_considered: candidates.map((c) => c.agent_id),
      scores: {},
    };
  }

  // Calculate composite scores
  const weights = getWeightsByTaskCriticality(criticality);
  const scored = qualified.map((candidate) => ({
    candidate,
    score: calculateCompositeScore(candidate, qualified, weights),
  }));

  // Sort by score
  scored.sort((a, b) => b.score - a.score);
  const selected = scored[0];

  return {
    todo_id: actionItem.id,
    selected_agent: selected.candidate.agent_id,
    reasoning: `${criticality} task, weighted quality=${weights.quality}, price=${weights.price}. Agent ${selected.candidate.agent_id} scored ${selected.score.toFixed(3)} with quality=${selected.candidate.stats.avg_score}, price=$${selected.candidate.base_price}.`,
    candidates_considered: qualified.map((c) => c.agent_id),
    scores: Object.fromEntries(scored.map((s) => [s.candidate.agent_id, s.score])),
  };
}

// =============================================================================
// NODE IMPLEMENTATION
// =============================================================================

/**
 * Planning Agent Node
 *
 * Creates plan, picks agents, picks templates.
 * On retry: receives feedback from failed verification.
 */
async function planningAgentNodeImpl(ctx: RequestContext, state: OrchestrationState): Promise<Partial<OrchestrationState>> {
  const isRetry = state.plan_verification_attempts > 0;

  logger.info(ctx, `operation=planning_agent job_id=${state.job_id} is_retry=${isRetry} budget=${state.budget}`);

  // Build input for planning LLM
  const planInput: PlanningAgentInput = {
    prompt: state.continuation_prompt ?? state.prompt,
    budget: state.budget,
    context: state.context,
    is_continuation: state.trigger === "continue",
    continuation_prompt: state.continuation_prompt,
    context_summary: state.context_summary,
    context_refs: state.context_refs,

    // Available resources from state
    available_agents: state.available_agents,
    available_templates: state.available_templates,

    // Retry support
    is_plan_retry: isRetry,
    previous_plan: isRetry && state.plan ? state.plan : undefined,
    verification_feedback: state.plan_verification_feedback,
  };

  // Invoke LLM
  const result = await invokePlanningLLM(ctx, planInput);

  // Calculate total estimated cost from action items
  const totalEstimatedCost = result.data.action_items
    .filter((a) => a.resource_type !== "SELF")
    .reduce((sum, a) => sum + a.estimated_cost, 0);

  const todosCount = result.data.action_items.length;
  const tokens = (result.operation.native_tokens_prompt ?? 0) + (result.operation.native_tokens_completion ?? 0);

  logger.info(ctx, `operation=planning_agent job_id=${state.job_id} todos_count=${todosCount} tokens=${tokens} estimated_cost=${totalEstimatedCost.toFixed(2)}`);

  // Build reasoning
  const reasoning = isRetry
    ? `Revised plan addressing: ${state.plan_verification_feedback?.join(", ")}`
    : `Created plan with ${todosCount} action items, estimated cost: $${totalEstimatedCost.toFixed(2)}`;

  // Log state mutations
  logger.debug(ctx, `operation=planning_agent_state_update job_id=${state.job_id} fields=plan,token_usage,reasoning,decision decision=call_planning_complete`);

  return {
    plan: result.data,
    token_usage: appendOperation(state.token_usage, result.operation),
    plan_verification_feedback: undefined, // Clear after use
    reasoning,
    decision: "call_planning_complete",
  };
}

/**
 * Exported planning agent node (without tracing wrapper - tracing applied in graph.ts)
 */
export const planningAgentNode = planningAgentNodeImpl;

/**
 * Re-export for direct use
 */
export { planningAgentNodeImpl };
