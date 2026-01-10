/**
 * Plan Verifier Node
 *
 * MANDATORY GATE - validates plan before execution.
 * Checks completeness, dependencies, agent picks, template picks, and budget.
 *
 * @see /docs/designs/orchestration/graph/TECH_DESIGN.md
 */

import OpenAI from "openai";
import { nanoid } from "nanoid";
import type { LLMOperation, ActionItem, Agent, PromptTemplate } from "@/types";
import { withTracing } from "@/lib/galileo";
import type { RequestContext } from "@/lib/logging";
import { createLogger } from "@/lib/logging";
import type { OrchestrationState, PlanningAgentOutput, PlanVerifierOutput } from "../types";

const logger = createLogger("graph");

// =============================================================================
// OPENROUTER CLIENT
// =============================================================================

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000",
    "X-Title": "AgentStack Orchestrator",
  },
});

const PLAN_VERIFIER_MODEL = "anthropic/claude-sonnet-4";

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Maximum number of plan verification attempts before terminal failure
 */
export const MAX_PLAN_VERIFICATION_ATTEMPTS = 3;

/**
 * Minimum quality score required for agents
 */
const MIN_AGENT_QUALITY = 0.8;

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Input for plan verifier
 */
export interface PlanVerifierInput {
  plan: PlanningAgentOutput;
  available_agents: Agent[];
  available_templates: PromptTemplate[];
  budget: number;
}

/**
 * Result from LLM invocation
 */
interface LLMInvokeResult<T> {
  data: T;
  operation: LLMOperation;
}

/**
 * Local plan verification type (matches PlanVerifierOutput but for internal use)
 */
interface PlanVerification {
  result: "PASS" | "FAIL";
  issues: string[];
  suggestions?: string[];
}

// =============================================================================
// COST CALCULATION
// =============================================================================

const PRICING: Record<string, { input: number; output: number }> = {
  "anthropic/claude-sonnet-4": { input: 3.0, output: 15.0 },
  "anthropic/claude-3.5-haiku": { input: 0.8, output: 4.0 },
};

function calculateCostFromUsage(
  model: string,
  usage: { prompt_tokens?: number; completion_tokens?: number }
): number {
  const pricing = PRICING[model] ?? { input: 1.0, output: 1.0 };
  const promptCost = ((usage?.prompt_tokens ?? 0) / 1_000_000) * pricing.input;
  const completionCost = ((usage?.completion_tokens ?? 0) / 1_000_000) * pricing.output;
  return promptCost + completionCost;
}

function generateOperationId(): string {
  return `op_${nanoid(12)}`;
}

function appendOperation(
  currentUsage: LLMOperation[],
  operation: LLMOperation
): LLMOperation[] {
  return [...currentUsage, operation];
}

// =============================================================================
// SYSTEM PROMPT
// =============================================================================

const PLAN_VERIFIER_SYSTEM_PROMPT = `You are a plan verification agent. Your job is to validate execution plans before they run.

Check for:
1. COMPLETENESS: Every deliverable has at least one action item
2. DEPENDENCIES: No circular dependencies, no references to non-existent items
3. AGENTS: All selected agents exist and are active with quality >= 0.80
4. TEMPLATES: All selected templates exist
5. BUDGET: Total estimated cost does not exceed budget

Return a JSON response with:
{
  "result": "PASS" or "FAIL",
  "issues": ["list of problems found"],
  "suggestions": ["how to fix each issue"]
}

Be strict. If ANY issue is found, result must be "FAIL".`;

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

/**
 * Validate plan completeness - every deliverable must have action items
 */
function validateCompleteness(
  plan: PlanningAgentOutput,
  issues: string[],
  suggestions: string[]
): void {
  for (const deliverable of plan.requirements.deliverables) {
    const actionItems = plan.action_items.filter(
      (a) => a.deliverable_id === deliverable.id
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

/**
 * Validate dependencies - no circular deps, all deps exist
 */
function validateDependencies(
  plan: PlanningAgentOutput,
  issues: string[],
  suggestions: string[]
): void {
  const itemIds = new Set(plan.action_items.map((a) => a.id));

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

  // Check for circular dependencies
  const cycles = detectCycles(plan.action_items);
  if (cycles.length > 0) {
    issues.push(`Circular dependency detected: ${cycles.join(" -> ")}`);
    suggestions.push("Break the cycle by removing one dependency");
  }

  // Check priority respects dependencies
  for (const item of plan.action_items) {
    for (const depId of item.depends_on) {
      const dep = plan.action_items.find((a) => a.id === depId);
      if (dep && dep.priority > item.priority) {
        issues.push(
          `Item ${item.id} (priority ${item.priority}) depends on item ${depId} (priority ${dep.priority}) - dependency has lower priority`
        );
      }
    }
  }
}

/**
 * Detect circular dependencies using DFS
 */
function detectCycles(items: ActionItem[]): number[] {
  const visited = new Set<number>();
  const recursionStack = new Set<number>();
  const path: number[] = [];

  function dfs(id: number): boolean {
    visited.add(id);
    recursionStack.add(id);
    path.push(id);

    const item = items.find((a) => a.id === id);
    if (item) {
      for (const depId of item.depends_on) {
        if (!visited.has(depId)) {
          if (dfs(depId)) return true;
        } else if (recursionStack.has(depId)) {
          path.push(depId);
          return true; // Cycle found
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

/**
 * Validate agent picks - agents must exist, be active, and meet quality threshold
 */
function validateAgentPicks(
  plan: PlanningAgentOutput,
  availableAgents: Agent[],
  issues: string[],
  suggestions: string[]
): void {
  const agentIds = new Set(availableAgents.map((a) => a.agent_id));

  for (const item of plan.action_items) {
    if (item.resource_type === "SELF") continue;

    // Agent must exist
    if (!item.agent_id || !agentIds.has(item.agent_id)) {
      issues.push(`Agent "${item.agent_id}" does not exist in marketplace`);
      suggestions.push(`Choose from available agents or use SELF`);
      continue;
    }

    const agent = availableAgents.find((a) => a.agent_id === item.agent_id);
    if (!agent) continue;

    // Agent must be active (if status field exists - checking url as proxy)
    if (!agent.url) {
      issues.push(`Agent "${item.agent_id}" appears inactive`);
      suggestions.push(`Choose an active agent`);
    }

    // Agent quality must meet threshold
    if (agent.stats.avg_score < MIN_AGENT_QUALITY) {
      issues.push(
        `Agent "${item.agent_id}" has low quality score (${agent.stats.avg_score}) - minimum ${MIN_AGENT_QUALITY} required`
      );
    }
  }
}

/**
 * Validate template picks - templates must exist
 */
function validateTemplatePicks(
  plan: PlanningAgentOutput,
  availableTemplates: PromptTemplate[],
  issues: string[],
  suggestions: string[]
): void {
  const templateIds = new Set(availableTemplates.map((t) => t.template_id));

  for (const item of plan.action_items) {
    if (!item.template_id || !templateIds.has(item.template_id)) {
      issues.push(`Template "${item.template_id}" does not exist`);
      suggestions.push(`Choose from available templates`);
    }
  }
}

/**
 * Validate budget - total cost must not exceed budget
 */
function validateBudget(
  plan: PlanningAgentOutput,
  budget: number,
  issues: string[],
  suggestions: string[]
): void {
  const totalCost = plan.action_items
    .filter((a) => a.resource_type !== "SELF")
    .reduce((sum, a) => sum + a.estimated_cost, 0);

  if (totalCost > budget) {
    issues.push(
      `Total estimated cost ($${totalCost.toFixed(2)}) exceeds budget ($${budget.toFixed(2)})`
    );
    suggestions.push(
      `Reduce costs by ${(((totalCost - budget) / totalCost) * 100).toFixed(0)}% or use cheaper agents`
    );
  }

  // Warn if budget is tight (< 10% buffer) - not an issue but noted
  const buffer = (budget - totalCost) / budget;
  if (buffer > 0 && buffer < 0.1) {
    suggestions.push(`Budget is tight (${(buffer * 100).toFixed(0)}% buffer)`);
  }
}

/**
 * Run all validations on a plan
 */
function verifyPlan(input: PlanVerifierInput): PlanVerification {
  const issues: string[] = [];
  const suggestions: string[] = [];

  validateCompleteness(input.plan, issues, suggestions);
  validateDependencies(input.plan, issues, suggestions);
  validateAgentPicks(input.plan, input.available_agents, issues, suggestions);
  validateTemplatePicks(input.plan, input.available_templates, issues, suggestions);
  validateBudget(input.plan, input.budget, issues, suggestions);

  return {
    result: issues.length === 0 ? "PASS" : "FAIL",
    issues,
    suggestions,
  };
}

// =============================================================================
// LLM INVOCATION (OPTIONAL - for complex validation)
// =============================================================================

/**
 * Invoke plan verifier LLM for additional validation
 * This is optional - most validation is done via code
 */
async function invokePlanVerifierLLM(
  input: PlanVerifierInput
): Promise<LLMInvokeResult<PlanVerification>> {
  const startTime = Date.now();

  const userContent = formatVerifierInput(input);

  const response = await openrouter.chat.completions.create({
    model: PLAN_VERIFIER_MODEL,
    messages: [
      { role: "system", content: PLAN_VERIFIER_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    temperature: 0.3, // Lower temperature for validation
    max_tokens: 2048,
    response_format: { type: "json_object" },
  });

  const usage = response.usage;
  const content = response.choices[0]?.message?.content ?? "{}";
  const data = JSON.parse(content) as PlanVerification;

  return {
    data,
    operation: {
      operation_id: generateOperationId(),
      timestamp: new Date(),
      operation_type: "plan_verifier",
      model: PLAN_VERIFIER_MODEL,
      native_tokens_prompt: usage?.prompt_tokens,
      native_tokens_completion: usage?.completion_tokens,
      total_cost: calculateCostFromUsage(PLAN_VERIFIER_MODEL, usage ?? {}),
      metadata: {
        duration_ms: Date.now() - startTime,
        finish_reason: response.choices[0]?.finish_reason,
      },
    },
  };
}

/**
 * Format input for verifier LLM
 */
function formatVerifierInput(input: PlanVerifierInput): string {
  const sections: string[] = [];

  sections.push(`## Plan to Verify`);
  sections.push(`Budget: $${input.budget.toFixed(2)}`);

  sections.push(`\n## Deliverables`);
  for (const d of input.plan.requirements.deliverables) {
    sections.push(`- ${d.id}: ${d.name}`);
    if (d.criteria.length > 0) {
      sections.push(`  Criteria: ${d.criteria.join(", ")}`);
    }
  }

  sections.push(`\n## Action Items`);
  for (const item of input.plan.action_items) {
    sections.push(
      `- ID ${item.id}: ${item.item} (priority: ${item.priority}, depends_on: [${item.depends_on.join(",")}], agent: ${item.agent_id ?? "SELF"}, template: ${item.template_id}, cost: $${item.estimated_cost})`
    );
  }

  sections.push(`\n## Available Agents`);
  for (const a of input.available_agents.slice(0, 20)) {
    sections.push(`- ${a.agent_id}: quality=${a.stats.avg_score}, price=$${a.pricing.base_price}`);
  }

  sections.push(`\n## Available Templates`);
  for (const t of input.available_templates.slice(0, 20)) {
    sections.push(`- ${t.template_id}: ${t.name}`);
  }

  return sections.join("\n");
}

// =============================================================================
// NODE IMPLEMENTATION
// =============================================================================

/**
 * Plan Verifier Node Implementation
 *
 * MANDATORY GATE - validates plan before execution.
 *
 * @param ctx - Request context for logging
 * @param state - Current graph state
 * @returns Partial state update
 */
async function planVerifierNodeImpl(ctx: RequestContext, state: OrchestrationState): Promise<Partial<OrchestrationState>> {
  if (!state.plan) {
    logger.warn(ctx, `operation=plan_verify job_id=${state.job_id} result=fail reason=no_plan`);
    return {
      plan_verification: {
        result: "FAIL",
        issues: ["No plan to verify"],
      },
      error: "Plan verification failed: no plan present",
      reasoning: "No plan present in state",
      decision: "max_attempts_exceeded",
    };
  }

  const attempts = state.plan_verification_attempts + 1;
  logger.info(ctx, `operation=plan_verify job_id=${state.job_id} attempt=${attempts}`);

  // Build verification input
  const verifierInput: PlanVerifierInput = {
    plan: state.plan,
    available_agents: state.available_agents,
    available_templates: state.available_templates,
    budget: state.budget,
  };

  // Run code-based validation (fast, no LLM cost)
  const verification = verifyPlan(verifierInput);

  // Build verification output
  const planVerification: PlanVerifierOutput = {
    result: verification.result,
    issues: verification.issues,
    suggestions: verification.suggestions,
  };

  // Handle PASS
  if (verification.result === "PASS") {
    logger.info(ctx, `operation=plan_verify job_id=${state.job_id} result=pass attempts=${attempts}`);
    return {
      plan_verification: planVerification,
      plan_verification_attempts: attempts,
      plan_verification_feedback: undefined,
      reasoning: "Plan validated successfully",
      decision: "pass",
    };
  }

  // Handle FAIL - check max attempts
  if (attempts >= MAX_PLAN_VERIFICATION_ATTEMPTS) {
    logger.warn(ctx, `operation=plan_verify job_id=${state.job_id} result=fail reason=max_attempts attempts=${attempts}`);
    return {
      plan_verification: planVerification,
      plan_verification_attempts: attempts,
      plan_verification_feedback: verification.issues,
      error: `Planning failed: max verification attempts exceeded (${attempts})`,
      reasoning: `Plan verification failed after ${attempts} attempts: ${verification.issues.join(", ")}`,
      decision: "max_attempts_exceeded",
    };
  }

  // FAIL with retries remaining - send feedback to Planning Agent
  logger.info(ctx, `operation=plan_verify job_id=${state.job_id} result=fail attempts=${attempts} issues_count=${verification.issues.length}`);
  return {
    plan_verification: planVerification,
    plan_verification_attempts: attempts,
    plan_verification_feedback: verification.issues,
    reasoning: `Plan rejected (attempt ${attempts}/${MAX_PLAN_VERIFICATION_ATTEMPTS}): ${verification.issues.join(", ")}`,
    decision: "fail",
  };
}

/**
 * Exported plan verifier node (without tracing wrapper - tracing applied in graph.ts)
 */
export const planVerifierNode = planVerifierNodeImpl;

/**
 * Re-export for direct use
 */
export { planVerifierNodeImpl };

/**
 * Export validation utilities for testing
 */
export {
  validateCompleteness,
  validateDependencies,
  validateAgentPicks,
  validateTemplatePicks,
  validateBudget,
  detectCycles,
  verifyPlan,
};
