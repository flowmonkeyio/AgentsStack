/**
 * Prompt Agent Node
 *
 * Generates final prompt from template + context for external agent execution.
 * Handles template substitution, context injection, and retry feedback.
 *
 * @see /docs/designs/orchestration/graph/TECH_DESIGN.md
 */

import OpenAI from "openai";
import { nanoid } from "nanoid";
import type { LLMOperation, ActionItem, PromptTemplate, WorkItem } from "@/types";
import { withTracing } from "@/lib/galileo";
import type { RequestContext } from "@/lib/logging";
import { createLogger } from "@/lib/logging";
import type { OrchestrationState, ContextRef, RetryContext as TypesRetryContext } from "../types";

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

/**
 * Model for prompt agent (fast model for prompt generation)
 */
const PROMPT_AGENT_MODEL = "anthropic/claude-3.5-haiku";

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Input for prompt agent
 */
export interface PromptAgentInput {
  action_item: ActionItem;
  template: PromptTemplate;
  context: {
    summary: string;
    refs: ContextRef[];
    loaded_content?: Record<string, unknown>;
  };
  is_retry: boolean;
  retry_context?: LocalRetryContext;
}

/**
 * Local context from previous failed attempt (simplified)
 */
interface LocalRetryContext {
  previous_output: unknown;
  verification_issues: string[];
  suggestions: string[];
}

/**
 * Output from prompt agent
 */
export interface PromptAgentOutput {
  generated_prompt: string;
  requirements: string[];
  template_used: string;
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

const PRICING: Record<string, { input: number; output: number }> = {
  "anthropic/claude-sonnet-4": { input: 3.0, output: 15.0 },
  "anthropic/claude-3.5-haiku": { input: 0.8, output: 4.0 },
  "google/gemini-2.5-flash": { input: 0.075, output: 0.3 },
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

const PROMPT_AGENT_SYSTEM_PROMPT = `You are a prompt generation agent. Your job is to:
1. Take a template with placeholders and context
2. Extract appropriate values from the context
3. Substitute placeholders to create a final prompt
4. Add any retry feedback if this is a retry attempt

Template placeholders use {{placeholder}} syntax.
Common placeholders: product_name, target_audience, tone, context, requirements

Return valid JSON with:
{
  "generated_prompt": "the final prompt text",
  "requirements": ["list of requirements extracted"],
  "template_used": "template_id"
}`;

// =============================================================================
// TEMPLATE SUBSTITUTION
// =============================================================================

/**
 * Format context for inclusion in prompt
 */
function formatContext(context: PromptAgentInput["context"]): string {
  let formatted = context.summary;

  // Add loaded content if any
  if (context.loaded_content) {
    for (const [workId, content] of Object.entries(context.loaded_content)) {
      const ref = context.refs.find((r) => r.work_id === workId);
      if (ref) {
        formatted += `\n\n[${ref.title}]:\n${JSON.stringify(content, null, 2)}`;
      }
    }
  }

  return formatted;
}

/**
 * Format requirements as numbered list
 */
function formatRequirements(requirements: string[]): string {
  return requirements.map((r, i) => `${i + 1}. ${r}`).join("\n");
}

/**
 * Add retry feedback to prompt
 */
function addRetryFeedback(
  prompt: string,
  template: PromptTemplate,
  retryContext: LocalRetryContext
): string {
  // Use specialized retry template if available
  if (template.retry_template) {
    return template.retry_template
      .replace("{{original_prompt}}", prompt)
      .replace("{{issues}}", retryContext.verification_issues.join("\n"))
      .replace("{{suggestions}}", retryContext.suggestions.join("\n"))
      .replace("{{previous_output}}", JSON.stringify(retryContext.previous_output));
  }

  // Generic retry feedback
  const feedback = `

---

PREVIOUS ATTEMPT FEEDBACK:

Your previous output did not fully meet the requirements. Please address these specific issues:

${retryContext.verification_issues.map((i) => `- ${i}`).join("\n")}

Suggestions for improvement:
${retryContext.suggestions.map((s) => `- ${s}`).join("\n")}

Please provide a revised output that addresses ALL of the above issues.
`;

  return prompt + feedback;
}

/**
 * Simple template substitution without LLM (for well-structured templates)
 */
function substituteTemplate(
  template: string,
  values: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}

// =============================================================================
// LLM INVOCATION
// =============================================================================

/**
 * Invoke prompt agent LLM for intelligent template filling
 */
async function invokePromptLLM(
  input: PromptAgentInput
): Promise<LLMInvokeResult<PromptAgentOutput>> {
  const startTime = Date.now();

  const userContent = formatPromptInput(input);

  const response = await openrouter.chat.completions.create({
    model: PROMPT_AGENT_MODEL,
    messages: [
      { role: "system", content: PROMPT_AGENT_SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    temperature: 0.3, // Low temperature for consistent prompt generation
    max_tokens: 2048,
    response_format: { type: "json_object" },
  });

  const usage = response.usage;
  const content = response.choices[0]?.message?.content ?? "{}";
  const data = JSON.parse(content) as PromptAgentOutput;

  return {
    data,
    operation: {
      operation_id: generateOperationId(),
      timestamp: new Date(),
      operation_type: "prompt_agent",
      model: PROMPT_AGENT_MODEL,
      native_tokens_prompt: usage?.prompt_tokens,
      native_tokens_completion: usage?.completion_tokens,
      total_cost: calculateCostFromUsage(PROMPT_AGENT_MODEL, usage ?? {}),
      metadata: {
        duration_ms: Date.now() - startTime,
        finish_reason: response.choices[0]?.finish_reason,
        template_id: input.template.template_id,
        is_retry: input.is_retry,
        action_item_id: input.action_item.id,
      },
    },
  };
}

/**
 * Format input for prompt LLM
 */
function formatPromptInput(input: PromptAgentInput): string {
  const sections: string[] = [];

  // Task description
  sections.push(`## Task\n${input.action_item.item}`);

  // Template
  sections.push(`## Template (ID: ${input.template.template_id})\n${input.template.template}`);

  // Template schema
  sections.push(
    `## Template Variables\n${JSON.stringify(input.template.input_schema, null, 2)}`
  );

  // Context
  sections.push(`## Context Summary\n${input.context.summary}`);

  // Context references
  if (input.context.refs.length > 0) {
    const refs = input.context.refs
      .map((r) => `- ${r.work_id}: ${r.title} - ${r.description}`)
      .join("\n");
    sections.push(`## Available Context\n${refs}`);
  }

  // Loaded content
  if (input.context.loaded_content && Object.keys(input.context.loaded_content).length > 0) {
    sections.push(
      `## Loaded Content\n${JSON.stringify(input.context.loaded_content, null, 2)}`
    );
  }

  // Retry context
  if (input.is_retry && input.retry_context) {
    sections.push(`## RETRY: Previous Attempt Issues\n${input.retry_context.verification_issues.join("\n")}`);
    sections.push(`## RETRY: Suggestions\n${input.retry_context.suggestions.join("\n")}`);
  }

  return sections.join("\n\n");
}

// =============================================================================
// NODE IMPLEMENTATION
// =============================================================================

/**
 * Prompt Agent Node Implementation
 *
 * Generates final prompt from template + context.
 * Note: This node expects current_work_items to have at least one work item
 * that needs prompt generation.
 *
 * @param ctx - Request context for logging
 * @param state - Current graph state
 * @returns Partial state update
 */
async function promptAgentNodeImpl(ctx: RequestContext, state: OrchestrationState): Promise<Partial<OrchestrationState>> {
  // Get current work item that needs prompt generation
  const currentWork = state.current_work_items.find((w) => w.status === "pending");
  if (!currentWork || !state.plan) {
    logger.warn(ctx, `operation=prompt_agent job_id=${state.job_id} result=fail reason=no_pending_work`);
    return {
      error: "No pending work item to generate prompt for",
      reasoning: "No pending work item in state",
      decision: "failed",
    };
  }

  logger.info(ctx, `operation=prompt_agent work_id=${currentWork.work_id} job_id=${state.job_id}`);

  // Find corresponding action item
  const actionItem = state.plan.action_items.find(
    (a) => a.id === currentWork.action_item_id
  );
  if (!actionItem) {
    logger.warn(ctx, `operation=prompt_agent work_id=${currentWork.work_id} result=fail reason=action_item_not_found`);
    return {
      error: "Action item not found in plan",
      reasoning: "Could not find action item for work",
      decision: "failed",
    };
  }

  // Find template for this action item
  const template = state.available_templates.find(
    (t) => t.template_id === actionItem.template_id
  ) ?? createDefaultTemplate(actionItem.template_id);

  logger.debug(ctx, `operation=prompt_agent work_id=${currentWork.work_id} template_id=${template.template_id}`);

  // Build prompt input
  const promptInput: PromptAgentInput = {
    action_item: actionItem,
    template,
    context: {
      summary: state.context_summary ?? "",
      refs: state.context_refs ?? [],
      loaded_content: undefined,
    },
    is_retry: false, // Would be determined by work item retry count
    retry_context: undefined,
  };

  // Generate prompt via LLM
  const result = await invokePromptLLM(promptInput);

  const tokens = (result.operation.native_tokens_prompt ?? 0) + (result.operation.native_tokens_completion ?? 0);
  logger.info(ctx, `operation=prompt_agent work_id=${currentWork.work_id} template_id=${template.template_id} tokens=${tokens}`);

  // Build reasoning
  const reasoning = `Generated prompt using template ${template.template_id}`;

  return {
    token_usage: appendOperation(state.token_usage, result.operation),
    reasoning,
    decision: "prompt_generated",
  };
}

/**
 * Create a default template if none found
 */
function createDefaultTemplate(templateId: string): PromptTemplate {
  return {
    template_id: templateId,
    name: "Default Template",
    agent_type: "general",
    version: "1.0",
    template: `You are an expert assistant. Complete the following task:

{{task}}

Context: {{context}}

Requirements:
{{requirements}}

Please provide a high-quality output that meets all requirements.`,
    retry_template: `You are an expert assistant. Your previous attempt needs revision.

Original task: {{task}}

Context: {{context}}

Requirements:
{{requirements}}

ISSUES WITH PREVIOUS ATTEMPT:
{{issues}}

SUGGESTIONS FOR IMPROVEMENT:
{{suggestions}}

Please provide a revised output that addresses all issues above.`,
    input_schema: {
      task: { type: "string", required: true },
      context: { type: "string", required: true },
      requirements: { type: "string", required: true },
    },
    examples: [],
    created_at: new Date(),
    updated_at: new Date(),
  };
}

/**
 * Exported prompt agent node (without tracing wrapper - tracing applied in graph.ts)
 */
export const promptAgentNode = promptAgentNodeImpl;

/**
 * Re-export for direct use
 */
export { promptAgentNodeImpl };

/**
 * Export utilities for testing
 */
export {
  formatContext,
  formatRequirements,
  addRetryFeedback,
  substituteTemplate,
};
