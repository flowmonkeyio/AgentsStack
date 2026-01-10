/**
 * Context Management Module
 *
 * Handles lazy loading of work item context for prompt generation.
 * Implements the lightweight summary + lazy load pattern from the design.
 *
 * @see /docs/designs/orchestration/integrations/TECH_DESIGN.md
 */

import type { RequestContext } from "@/lib/logging";
import { createLogger } from "@/lib/logging";
import OpenAI from "openai";
import { nanoid } from "nanoid";
import type { DatabaseClient } from "@/lib/db/database-client";
import type { ExtendedDatabaseClient } from "@/lib/orchestration/work-lifecycle";
import type { WorkItem, ActionItem, LLMOperation } from "@/types";

const logger = createLogger("integrations");
import type {
  ContextRef,
  PreparedContext,
  SummarizationResult,
  TitleAndDescription,
} from "./types";

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Default summarization model (via OpenRouter)
 */
const SUMMARIZATION_MODEL =
  process.env.SUMMARIZATION_MODEL ?? "google/gemini-2.5-flash";

/**
 * Pricing for summarization models (per 1M tokens)
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "google/gemini-2.5-flash": { input: 0.075, output: 0.3 },
  "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
  "meta-llama/llama-3.1-8b-instruct": { input: 0.055, output: 0.055 },
  "mistralai/mistral-7b-instruct": { input: 0.06, output: 0.06 },
};

// =============================================================================
// OPENROUTER CLIENT
// =============================================================================

/**
 * OpenRouter client for summarization.
 * Lazily initialized on first use.
 */
let openrouterClient: OpenAI | null = null;

/**
 * Get or create the OpenRouter client.
 */
function getOpenRouterClient(): OpenAI {
  if (!openrouterClient) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY environment variable not set");
    }

    openrouterClient = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey,
      defaultHeaders: {
        "HTTP-Referer": process.env.APP_URL ?? "http://localhost:3000",
        "X-Title": "AgentStack Summarization",
      },
    });
  }
  return openrouterClient;
}

// =============================================================================
// OPERATION ID GENERATION
// =============================================================================

/**
 * Generate unique operation ID for LLM operations
 */
function generateOperationId(): string {
  return `op_${nanoid()}`;
}

// =============================================================================
// CONTEXT RETRIEVAL
// =============================================================================

/**
 * Get the context summary for a job.
 *
 * @param ctx - Request context for tracing
 * @param job_id - Job ID
 * @param db - Database client
 * @returns Context summary string
 */
export async function getContextSummary(
  ctx: RequestContext,
  job_id: string,
  db: DatabaseClient
): Promise<string> {
  logger.debug(ctx, `operation=get_context_summary job_id=${job_id}`);
  const job = await db.getJob(ctx, job_id);
  return job?.context_summary ?? "";
}

/**
 * Get context references for all completed work items in a job.
 * Returns metadata only (title, description) - not full content.
 *
 * @param ctx - Request context for tracing
 * @param job_id - Job ID
 * @param db - Database client
 * @returns Array of context references
 */
export async function getContextRefs(
  ctx: RequestContext,
  job_id: string,
  db: DatabaseClient
): Promise<ContextRef[]> {
  logger.debug(ctx, `operation=get_context_refs job_id=${job_id}`);
  const workItems = await db.getWorkItemsByJob(ctx, job_id);
  const completedItems = workItems.filter((w) => w.status === "completed");

  const refs = completedItems
    .filter((work) => work.output !== null)
    .map((work) => ({
      work_id: work.work_id,
      title: work.output!.title,
      description: work.output!.description,
    }));

  logger.debug(ctx, `operation=get_context_refs job_id=${job_id} refs_count=${refs.length}`);
  return refs;
}

/**
 * Load the full content for a work item.
 * Use sparingly - only when agent needs specific content.
 *
 * @param ctx - Request context for tracing
 * @param work_id - Work item ID
 * @param db - Database client
 * @returns Full content (heterogeneous)
 */
export async function loadFullContent(
  ctx: RequestContext,
  work_id: string,
  db: DatabaseClient
): Promise<unknown> {
  logger.debug(ctx, `operation=load_full_content work_id=${work_id}`);
  const work = await db.getWorkItem(ctx, work_id);
  return work?.output?.content ?? null;
}

// =============================================================================
// CONTEXT PREPARATION
// =============================================================================

/**
 * Prepare context for prompt generation.
 * Loads summary, refs, and selectively loads dependency content.
 *
 * @param ctx - Request context for tracing
 * @param job_id - Job ID
 * @param action_item - Action item being processed
 * @param db - Database client
 * @returns Prepared context with loaded dependencies
 */
export async function prepareContextForPrompt(
  ctx: RequestContext,
  job_id: string,
  action_item: ActionItem,
  db: DatabaseClient & ExtendedDatabaseClient
): Promise<PreparedContext> {
  logger.debug(ctx, `operation=prepare_context job_id=${job_id} action_item_id=${action_item.id}`);

  // Get lightweight context (always available)
  const summary = await getContextSummary(ctx, job_id, db);
  const refs = await getContextRefs(ctx, job_id, db);

  // Determine what to load based on dependencies
  const loaded_content: Record<string, unknown> = {};

  // Check if this is a synthesis task (depends on ALL)
  if (action_item.depends_on.includes(-1)) {
    // Special case: -1 means "ALL" - load everything
    logger.debug(ctx, `operation=prepare_context job_id=${job_id} mode=load_all`);
    for (const ref of refs) {
      loaded_content[ref.work_id] = await loadFullContent(ctx, ref.work_id, db);
    }
  } else if (action_item.depends_on.length > 0) {
    // Standard task: load only dependencies
    logger.debug(ctx, `operation=prepare_context job_id=${job_id} mode=load_dependencies deps_count=${action_item.depends_on.length}`);
    const dependencyWorks = await db.getWorkItemsByActionItemIds(
      ctx,
      job_id,
      action_item.depends_on
    );

    for (const work of dependencyWorks) {
      if (work.status === "completed" && work.output) {
        loaded_content[work.work_id] = work.output.content;
      }
    }
  }
  // No dependencies = no content loaded

  logger.info(ctx, `operation=prepare_context job_id=${job_id} action_item_id=${action_item.id} loaded_count=${Object.keys(loaded_content).length}`);
  return { summary, refs, loaded_content };
}

/**
 * Load context for a task based on loading rules.
 * More general version that accepts loading mode explicitly.
 *
 * @param ctx - Request context for tracing
 * @param job_id - Job ID
 * @param loadMode - What to load: "none", "dependencies_only", or "all"
 * @param dependsOn - Array of action item IDs this task depends on
 * @param db - Database client
 * @returns Prepared context
 */
export async function loadContextForTask(
  ctx: RequestContext,
  job_id: string,
  loadMode: "none" | "dependencies_only" | "all",
  dependsOn: number[],
  db: DatabaseClient & ExtendedDatabaseClient
): Promise<PreparedContext> {
  logger.debug(ctx, `operation=load_context_for_task job_id=${job_id} mode=${loadMode}`);

  const summary = await getContextSummary(ctx, job_id, db);
  const refs = await getContextRefs(ctx, job_id, db);
  const loaded_content: Record<string, unknown> = {};

  if (loadMode === "all") {
    // Load everything
    for (const ref of refs) {
      loaded_content[ref.work_id] = await loadFullContent(ctx, ref.work_id, db);
    }
  } else if (loadMode === "dependencies_only" && dependsOn.length > 0) {
    // Load only dependencies
    const dependencyWorks = await db.getWorkItemsByActionItemIds(
      ctx,
      job_id,
      dependsOn
    );

    for (const work of dependencyWorks) {
      if (work.status === "completed" && work.output) {
        loaded_content[work.work_id] = work.output.content;
      }
    }
  }
  // "none" = no content loaded

  logger.info(ctx, `operation=load_context_for_task job_id=${job_id} mode=${loadMode} loaded_count=${Object.keys(loaded_content).length}`);
  return { summary, refs, loaded_content };
}

// =============================================================================
// SUMMARIZATION
// =============================================================================

/**
 * Calculate cost for summarization based on token usage.
 *
 * @param model - Model ID
 * @param usage - Token usage from API
 * @returns Cost in USD
 */
function calculateSummarizationCost(
  model: string,
  usage?: { prompt_tokens?: number; completion_tokens?: number }
): number {
  const pricing = MODEL_PRICING[model] ?? { input: 0.1, output: 0.1 };
  const promptCost = ((usage?.prompt_tokens ?? 0) / 1_000_000) * pricing.input;
  const completionCost =
    ((usage?.completion_tokens ?? 0) / 1_000_000) * pricing.output;
  return promptCost + completionCost;
}

/**
 * Generate title and description for work output.
 * Used for context refs (lazy loading).
 *
 * @param ctx - Request context for tracing
 * @param output - Work output content
 * @param work_id - Work item ID (for operation metadata)
 * @returns Title, description, and LLM operation record
 */
export async function generateTitleAndDescription(
  ctx: RequestContext,
  output: unknown,
  work_id: string
): Promise<SummarizationResult<TitleAndDescription>> {
  logger.debug(ctx, `operation=generate_title_description work_id=${work_id}`);
  const client = getOpenRouterClient();
  const startTime = Date.now();

  const response = await client.chat.completions.create({
    model: SUMMARIZATION_MODEL,
    messages: [
      {
        role: "system",
        content: "You are a concise summarizer. Return JSON only.",
      },
      {
        role: "user",
        content: `Given this output, create:
- title: What this is (2-4 words)
- description: What it contains (20-30 words max)

Be specific. Don't use generic descriptions.
Example: {"title": "Ad Headlines", "description": "5 headline options. Lead: 'Your focus. Amplified.' Mix of statement and question formats."}

Output to summarize:
${JSON.stringify(output, null, 2)}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 200,
  });

  const content = JSON.parse(response.choices[0].message.content ?? "{}");
  const usage = response.usage;
  const cost = calculateSummarizationCost(SUMMARIZATION_MODEL, usage);

  logger.info(ctx, `operation=generate_title_description work_id=${work_id} title="${content.title ?? "Output"}" cost=${cost.toFixed(6)} duration_ms=${Date.now() - startTime}`);

  return {
    data: {
      title: content.title ?? "Output",
      description: content.description ?? "Work output",
    },
    operation: {
      operation_id: generateOperationId(),
      timestamp: new Date(),
      operation_type: "summarization",
      model: SUMMARIZATION_MODEL,
      native_tokens_prompt: usage?.prompt_tokens,
      native_tokens_completion: usage?.completion_tokens,
      total_cost: cost,
      metadata: {
        work_id,
        task: "title_description",
        duration_ms: Date.now() - startTime,
      },
    },
  };
}

// =============================================================================
// CONTEXT SUMMARY UPDATE
// =============================================================================

/**
 * Determine if context summary should be updated after work completion.
 * Uses heuristics to avoid unnecessary LLM calls.
 *
 * @param currentSummary - Current context summary
 * @param output - Work output
 * @returns true if summary should be updated
 */
export function shouldUpdateSummary(
  currentSummary: string,
  output: { title?: string; description?: string; content?: unknown }
): boolean {
  // Always update if no summary exists yet
  if (!currentSummary || currentSummary.trim().length === 0) {
    return true;
  }

  // Check content size
  const contentStr =
    typeof output.content === "string"
      ? output.content
      : JSON.stringify(output.content ?? {});

  // Skip very short outputs
  if (contentStr.length < 100) {
    return false;
  }

  // Always update for primary deliverables
  const title = (output.title ?? "").toLowerCase();
  const primaryDeliverables = ["strategy", "brief", "plan", "campaign", "summary"];
  if (primaryDeliverables.some((term) => title.includes(term))) {
    return true;
  }

  // Update if description suggests significant info
  const description = (output.description ?? "").toLowerCase();
  if (description.length > 50) {
    return true;
  }

  // Default: update for substantial content
  return contentStr.length > 500;
}

/**
 * Update the context summary after work completion.
 *
 * @param ctx - Request context for tracing
 * @param job_id - Job ID
 * @param work - Completed work item
 * @param db - Database client
 * @returns LLM operation if summary was updated, null otherwise
 */
export async function updateContextSummary(
  ctx: RequestContext,
  job_id: string,
  work: WorkItem,
  db: DatabaseClient
): Promise<LLMOperation | null> {
  logger.debug(ctx, `operation=update_context_summary job_id=${job_id} work_id=${work.work_id}`);

  const job = await db.getJob(ctx, job_id);
  if (!job) return null;

  const currentSummary = job.context_summary ?? "";

  // Check if update is needed
  if (!work.output) return null;
  if (!shouldUpdateSummary(currentSummary, work.output)) {
    logger.debug(ctx, `operation=update_context_summary job_id=${job_id} work_id=${work.work_id} skipped=true`);
    return null;
  }

  const client = getOpenRouterClient();
  const startTime = Date.now();

  const response = await client.chat.completions.create({
    model: SUMMARIZATION_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are a concise context summarizer. Return plain text summary only.",
      },
      {
        role: "user",
        content: `Current summary: "${currentSummary}"

New output completed: ${work.output.title}
${work.output.description}

Update the summary to incorporate key new information.
Keep it under 100 words. Focus on what future tasks need to know.`,
      },
    ],
    temperature: 0.3,
    max_tokens: 200,
  });

  const newSummary = response.choices[0].message.content ?? currentSummary;
  const usage = response.usage;
  const cost = calculateSummarizationCost(SUMMARIZATION_MODEL, usage);

  // Update in database
  await db.updateContextSummary(ctx, job_id, newSummary);

  logger.info(ctx, `operation=update_context_summary job_id=${job_id} work_id=${work.work_id} cost=${cost.toFixed(6)} duration_ms=${Date.now() - startTime}`);

  return {
    operation_id: generateOperationId(),
    timestamp: new Date(),
    operation_type: "summarization",
    model: SUMMARIZATION_MODEL,
    native_tokens_prompt: usage?.prompt_tokens,
    native_tokens_completion: usage?.completion_tokens,
    total_cost: cost,
    metadata: {
      work_id: work.work_id,
      task: "context_summary",
      duration_ms: Date.now() - startTime,
    },
  };
}

// =============================================================================
// CONTEXT UPDATE AFTER WORK COMPLETION
// =============================================================================

/**
 * Update context after a work item completes.
 * Generates title/description and updates rolling summary.
 *
 * @param ctx - Request context for tracing
 * @param job_id - Job ID
 * @param work_id - Completed work item ID
 * @param db - Database client
 * @returns Array of LLM operations for cost tracking
 */
export async function updateContextAfterWork(
  ctx: RequestContext,
  job_id: string,
  work_id: string,
  db: DatabaseClient
): Promise<LLMOperation[]> {
  logger.debug(ctx, `operation=update_context_after_work job_id=${job_id} work_id=${work_id}`);

  const work = await db.getWorkItem(ctx, work_id);
  if (!work || !work.output) return [];

  const operations: LLMOperation[] = [];

  // Generate title and description
  const titleResult = await generateTitleAndDescription(
    ctx,
    work.output,
    work_id
  );
  operations.push(titleResult.operation);

  // Add to context refs
  await db.addContextRef(ctx, job_id, {
    work_id,
    action_item_id: work.action_item_id,
    title: titleResult.data.title,
    description: titleResult.data.description,
  });

  // Update rolling summary if needed
  const summaryOperation = await updateContextSummary(ctx, job_id, work, db);
  if (summaryOperation) {
    operations.push(summaryOperation);
  }

  logger.info(ctx, `operation=update_context_after_work job_id=${job_id} work_id=${work_id} operations_count=${operations.length}`);
  return operations;
}
