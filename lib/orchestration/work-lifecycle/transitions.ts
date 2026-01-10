/**
 * Work Lifecycle Transitions
 *
 * Defines all valid state transitions for work items.
 * Each transition includes guards and execute functions with typed payloads.
 *
 * @see /docs/designs/orchestration/work-lifecycle/TECH_DESIGN.md
 */

import type { WorkItem } from "@/types";
import type {
  Transition,
  PromptGeneratedPayload,
  AsyncResponsePayload,
  SyncResponsePayload,
  PollCompletedPayload,
  VerificationPayload,
  VerificationRetryPayload,
  TryNewAgentPayload,
  AgentReassignedPayload,
  PaymentConfirmedPayload,
  SpawnTrigger,
  SpawnableOutput,
} from "./types";

// =============================================================================
// TRANSITION DEFINITIONS
// =============================================================================

/**
 * All valid state transitions for work items.
 * Each transition defines:
 * - from/to states
 * - trigger that causes the transition
 * - optional guard condition
 * - execute function that returns field updates
 */
export const TRANSITIONS: Transition[] = [
  // -------------------------------------------------------------------------
  // pending -> ready
  // -------------------------------------------------------------------------
  {
    from: "pending",
    to: "ready",
    trigger: "dependencies_met",
    execute: () => ({}),
  },

  // -------------------------------------------------------------------------
  // ready -> prompting
  // -------------------------------------------------------------------------
  {
    from: "ready",
    to: "prompting",
    trigger: "picked_up",
    execute: () => ({ started_at: new Date() }),
  },

  // -------------------------------------------------------------------------
  // prompting -> dispatched
  // -------------------------------------------------------------------------
  {
    from: "prompting",
    to: "dispatched",
    trigger: "prompt_generated",
    guard: (_work: WorkItem, payload: PromptGeneratedPayload) =>
      payload.generated_prompt.length > 0,
    guardName: "has_prompt",
    execute: (_work: WorkItem, payload: PromptGeneratedPayload) => ({
      prompt: {
        template_id: "", // Set by caller
        generated_prompt: payload.generated_prompt,
        context_used: payload.context_used,
        generated_at: new Date(),
      },
    }),
  },

  // -------------------------------------------------------------------------
  // dispatched -> polling (async response)
  // -------------------------------------------------------------------------
  {
    from: "dispatched",
    to: "polling",
    trigger: "async_response",
    execute: (_work: WorkItem, payload: AsyncResponsePayload) => ({
      external_ref: {
        reference_id: payload.reference_id,
        status_url: payload.status_url,
        callback_url: payload.callback_url ?? "",
        dispatched_at: new Date(),
        last_poll_at: null,
        next_poll_at: new Date(Date.now() + 3000), // First poll in 3s
        polling: {
          initial_interval_ms: 3000,
          current_interval_ms: 3000,
          max_interval_ms: 15000,
          backoff_multiplier: 1.5,
          poll_count: 0,
          timeout_at: new Date(Date.now() + 600000), // 10 min
          timeout_ms: 600000,
        },
        last_response: null,
        last_error: null,
      },
    }),
  },

  // -------------------------------------------------------------------------
  // dispatched -> received (sync response)
  // -------------------------------------------------------------------------
  {
    from: "dispatched",
    to: "received",
    trigger: "sync_response",
    execute: (_work: WorkItem, payload: SyncResponsePayload) => ({
      output: payload.output,
    }),
  },

  // -------------------------------------------------------------------------
  // polling -> received
  // -------------------------------------------------------------------------
  {
    from: "polling",
    to: "received",
    trigger: "poll_completed",
    execute: (_work: WorkItem, payload: PollCompletedPayload) => ({
      output: payload.output,
    }),
  },

  // -------------------------------------------------------------------------
  // polling -> stale
  // -------------------------------------------------------------------------
  {
    from: "polling",
    to: "stale",
    trigger: "poll_timeout",
    execute: (work: WorkItem) => ({
      external_ref: work.external_ref
        ? {
            ...work.external_ref,
            last_error: "Polling timeout exceeded",
          }
        : null,
    }),
  },

  // -------------------------------------------------------------------------
  // stale -> dispatched (retry)
  // Stale retry count is tracked via retries array length with reason "stale"
  // -------------------------------------------------------------------------
  {
    from: "stale",
    to: "dispatched",
    trigger: "retry_dispatch",
    guard: (work: WorkItem) => {
      const staleRetries = work.retries.filter((r) => r.reason === "stale").length;
      return staleRetries < 3;
    },
    guardName: "stale_retries_remaining",
    execute: (work: WorkItem) => ({
      external_ref: work.external_ref
        ? {
            ...work.external_ref,
            dispatched_at: new Date(),
            last_error: null,
            polling: {
              ...work.external_ref.polling,
              poll_count: 0,
              timeout_at: new Date(Date.now() + 600000),
            },
          }
        : null,
      retries: [
        ...work.retries,
        {
          attempt: work.attempt,
          reason: "stale",
          score: 0,
          feedback_sent: "Retrying due to polling timeout",
          agent_id: work.agent?.agent_id ?? "",
          timestamp: new Date(),
        },
      ],
    }),
  },

  // -------------------------------------------------------------------------
  // stale -> failed (max retries)
  // -------------------------------------------------------------------------
  {
    from: "stale",
    to: "failed",
    trigger: "max_stale_retries",
    guard: (work: WorkItem) => {
      const staleRetries = work.retries.filter((r) => r.reason === "stale").length;
      return staleRetries >= 3;
    },
    guardName: "stale_retries_exhausted",
    execute: () => ({
      completed_at: new Date(),
    }),
  },

  // -------------------------------------------------------------------------
  // received -> verifying
  // -------------------------------------------------------------------------
  {
    from: "received",
    to: "verifying",
    trigger: "start_verification",
    execute: () => ({}),
  },

  // -------------------------------------------------------------------------
  // verifying -> verified (pass)
  // -------------------------------------------------------------------------
  {
    from: "verifying",
    to: "verified",
    trigger: "verification_pass",
    guard: (_work: WorkItem, payload: VerificationPayload) => payload.score >= 0.9,
    guardName: "score_passes",
    execute: (_work: WorkItem, payload: VerificationPayload) => ({
      verification: {
        score: payload.score,
        reasoning: payload.reasoning,
        criteria_results: payload.criteria_results,
        issues: payload.issues,
        verified_at: new Date(),
      },
    }),
  },

  // -------------------------------------------------------------------------
  // verifying -> retry_pending
  // -------------------------------------------------------------------------
  {
    from: "verifying",
    to: "retry_pending",
    trigger: "verification_retry",
    guard: (work: WorkItem, payload: VerificationRetryPayload) =>
      payload.score >= 0.6 && payload.score < 0.9 && work.attempt < work.max_attempts,
    guardName: "retriable_score_and_attempts",
    execute: (work: WorkItem, payload: VerificationRetryPayload) => ({
      verification: {
        score: payload.score,
        reasoning: payload.reasoning,
        criteria_results: payload.criteria_results,
        issues: payload.issues,
        verified_at: new Date(),
      },
      retry_context: {
        previous_attempt: work.attempt,
        previous_output: payload.previous_output,
        verification_feedback: {
          score: payload.score,
          reasoning: payload.reasoning,
          issues: payload.criteria_results
            .filter((cr) => !cr.passed)
            .map((cr) => ({
              criterion: cr.criterion,
              passed: cr.passed,
              detail: payload.issues.find((i) => i.includes(cr.criterion)) ?? "",
            })),
          suggestions: payload.suggestions,
        },
      },
    }),
  },

  // -------------------------------------------------------------------------
  // verifying -> rejected
  // -------------------------------------------------------------------------
  {
    from: "verifying",
    to: "rejected",
    trigger: "verification_reject",
    guard: (work: WorkItem, payload: VerificationPayload) =>
      payload.score < 0.6 || work.attempt >= work.max_attempts,
    guardName: "low_score_or_max_attempts",
    execute: (_work: WorkItem, payload: VerificationPayload) => ({
      verification: {
        score: payload.score,
        reasoning: payload.reasoning,
        criteria_results: payload.criteria_results,
        issues: payload.issues,
        verified_at: new Date(),
      },
    }),
  },

  // -------------------------------------------------------------------------
  // retry_pending -> prompting
  // -------------------------------------------------------------------------
  {
    from: "retry_pending",
    to: "prompting",
    trigger: "retry_initiated",
    execute: (work: WorkItem) => ({
      attempt: work.attempt + 1,
      retries: [
        ...work.retries,
        {
          attempt: work.attempt,
          reason: "verification",
          score: work.verification?.score ?? 0,
          feedback_sent:
            work.retry_context?.verification_feedback.suggestions.join("; ") ?? "",
          agent_id: work.agent?.agent_id ?? "",
          timestamp: new Date(),
        },
      ],
    }),
  },

  // -------------------------------------------------------------------------
  // rejected -> reassigning
  // -------------------------------------------------------------------------
  {
    from: "rejected",
    to: "reassigning",
    trigger: "try_new_agent",
    guard: (_work: WorkItem, payload: TryNewAgentPayload) =>
      payload.alternative_agents.length > 0,
    guardName: "alternatives_available",
    execute: () => ({}),
  },

  // -------------------------------------------------------------------------
  // rejected -> failed (no alternatives)
  // -------------------------------------------------------------------------
  {
    from: "rejected",
    to: "failed",
    trigger: "no_alternatives",
    execute: () => ({
      completed_at: new Date(),
    }),
  },

  // -------------------------------------------------------------------------
  // reassigning -> prompting
  // -------------------------------------------------------------------------
  {
    from: "reassigning",
    to: "prompting",
    trigger: "agent_reassigned",
    execute: (work: WorkItem, payload: AgentReassignedPayload) => ({
      agent: payload.new_agent,
      attempt: 1, // Reset attempts for new agent
      retries: [
        ...work.retries,
        {
          attempt: work.attempt,
          reason: "reassignment",
          score: work.verification?.score ?? 0,
          feedback_sent: `Reassigned from ${work.agent?.agent_id ?? "unknown"} to ${payload.new_agent.agent_id}`,
          agent_id: work.agent?.agent_id ?? "",
          timestamp: new Date(),
        },
      ],
    }),
  },

  // -------------------------------------------------------------------------
  // verified -> paying
  // -------------------------------------------------------------------------
  {
    from: "verified",
    to: "paying",
    trigger: "start_payment",
    execute: (work: WorkItem) => ({
      payment: {
        status: "processing" as const,
        amount: work.agent?.price ?? 0,
        tx_hash: null,
        original_price: work.agent?.price ?? 0,
        negotiated_price: work.agent?.price ?? 0,
        error: null,
        retry_count: 0,
        initiated_at: new Date(),
        confirmed_at: null,
      },
    }),
  },

  // -------------------------------------------------------------------------
  // paying -> completed
  // -------------------------------------------------------------------------
  {
    from: "paying",
    to: "completed",
    trigger: "payment_confirmed",
    execute: (work: WorkItem, payload: PaymentConfirmedPayload) => ({
      payment: work.payment
        ? {
            ...work.payment,
            status: "confirmed" as const,
            amount: payload.amount,
            tx_hash: payload.tx_hash,
            confirmed_at: new Date(),
          }
        : null,
      completed_at: new Date(),
    }),
  },

  // -------------------------------------------------------------------------
  // paying -> payment_retry
  // -------------------------------------------------------------------------
  {
    from: "paying",
    to: "payment_retry",
    trigger: "payment_failed",
    guard: (work: WorkItem) => (work.payment?.retry_count ?? 0) < 3,
    guardName: "payment_retries_remaining",
    execute: (work: WorkItem) => ({
      payment: work.payment
        ? {
            ...work.payment,
            status: "failed" as const,
            retry_count: (work.payment.retry_count ?? 0) + 1,
            error: "Payment failed, will retry",
          }
        : null,
    }),
  },

  // -------------------------------------------------------------------------
  // payment_retry -> paying
  // -------------------------------------------------------------------------
  {
    from: "payment_retry",
    to: "paying",
    trigger: "retry_payment",
    execute: (work: WorkItem) => ({
      payment: work.payment
        ? {
            ...work.payment,
            status: "processing" as const,
            error: null,
          }
        : null,
    }),
  },

  // -------------------------------------------------------------------------
  // payment_retry -> failed
  // -------------------------------------------------------------------------
  {
    from: "payment_retry",
    to: "failed",
    trigger: "max_payment_retries",
    execute: (work: WorkItem) => ({
      payment: work.payment
        ? {
            ...work.payment,
            status: "failed" as const,
            error: "Max payment retries exceeded",
          }
        : null,
      completed_at: new Date(),
    }),
  },
];

// =============================================================================
// SPAWN TRIGGERS
// =============================================================================

/**
 * Registry of spawn triggers.
 * Add new triggers here as needed.
 */
export const SPAWN_TRIGGERS: SpawnTrigger[] = [
  // -------------------------------------------------------------------------
  // Output reveals items needing individual attention
  // -------------------------------------------------------------------------
  {
    id: "detail_required_for_list_items",
    description: "Spawns detailed research tasks for each item in a list output",
    condition: (_work: WorkItem, output: SpawnableOutput) =>
      output.items !== undefined && output.items.length > 1 && output.needs_detail === true,
    spawn: (_work: WorkItem, output: SpawnableOutput) =>
      (output.items ?? []).map((item) => ({
        item: `Research ${item.name} in detail`,
        priority: 2,
      })),
  },

  // -------------------------------------------------------------------------
  // Quality issues require verification
  // -------------------------------------------------------------------------
  {
    id: "quality_review_needed",
    description: "Spawns a review task when verification score is marginal",
    condition: (work: WorkItem) =>
      work.verification !== null &&
      work.verification.score >= 0.8 &&
      work.verification.score < 0.9,
    spawn: () => [
      {
        item: "Review and verify output quality",
        priority: 1,
      },
    ],
  },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Find a transition by from state and trigger.
 *
 * @param from - Current work item status
 * @param trigger - Transition trigger
 * @returns The matching transition or null
 */
export function findTransition(
  from: WorkItem["status"],
  trigger: string
): Transition | null {
  return TRANSITIONS.find((t) => t.from === from && t.trigger === trigger) ?? null;
}

/**
 * Get all valid triggers for a given state.
 *
 * @param from - Current work item status
 * @returns Array of valid trigger names
 */
export function getValidTriggers(from: WorkItem["status"]): string[] {
  return TRANSITIONS.filter((t) => t.from === from).map((t) => t.trigger);
}

/**
 * Check if a transition is valid (exists in the transition table).
 *
 * @param from - Current work item status
 * @param trigger - Transition trigger
 * @returns True if the transition is valid
 */
export function isValidTransition(from: WorkItem["status"], trigger: string): boolean {
  return findTransition(from, trigger) !== null;
}
