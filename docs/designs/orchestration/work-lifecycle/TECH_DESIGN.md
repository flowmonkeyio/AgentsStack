# ORCH_WORK_LIFECYCLE

16-state work item machine, transitions, parallel execution, dynamic spawning.

---

## Scope

**Owns:**
- 16 work item states
- State transition rules and guards
- Status update logic
- Parallel execution coordination
- Dynamic TODO spawning
- Retry counting and limits

**Does NOT own:**
- Graph flow (that's ORCH_GRAPH)
- External API calls (that's ORCH_INTEGRATIONS)
- Database operations (that's DATA)

---

## Dependencies

This module depends on:
- `DatabaseClient` from `@/lib/db/database-client` for all database operations
- Types from `@/types` (WorkItem, WorkItemStatus, ActionItem, Plan, Agent, CriteriaResult)

---

## Required DatabaseClient Extensions

The following methods must be added to `DatabaseClient` to support this module:

```typescript
/**
 * Additional methods required in DatabaseClient for WorkLifecycle module.
 * These should be added to lib/db/database-client.ts
 */
interface DatabaseClientExtensions {
  /**
   * Update specific fields of a work item (partial update).
   * This is used by state transitions to update status and related fields.
   *
   * @param work_id - The work item ID
   * @param updates - Partial work item updates
   */
  updateWorkItemFields(work_id: string, updates: Partial<WorkItem>): Promise<void>;

  /**
   * Get work items for specific action item IDs within a job.
   * Used for dependency checking.
   *
   * @param job_id - The job ID
   * @param action_item_ids - Array of action item IDs
   */
  getWorkItemsByActionItemIds(job_id: string, action_item_ids: number[]): Promise<WorkItem[]>;

  /**
   * Add new action items to a plan.
   * Used for dynamic TODO spawning.
   *
   * @param plan_id - The plan ID
   * @param newItems - Array of new action items to add
   */
  pushActionItemsToPlan(plan_id: string, newItems: ActionItem[]): Promise<void>;
}
```

**Implementation Notes:**

1. `updateWorkItemFields` - Should use MongoDB's `$set` operator for partial updates
2. `getWorkItemsByActionItemIds` - Should use `$in` operator for efficient batch query
3. `pushActionItemsToPlan` - Should use `$push` with `$each` for array extension

These methods follow the existing DatabaseClient patterns and should be implemented in `lib/db/database-client-impl.ts`.

---

## Work Item States

```typescript
type WorkItemStatus =
  | "pending"        // Waiting for dependencies
  | "ready"          // Dependencies met, queued for execution
  | "prompting"      // Prompt Agent generating prompt
  | "dispatched"     // Sent to external agent
  | "polling"        // Waiting for async response
  | "stale"          // Polling timeout, needs recovery
  | "received"       // Output received from agent
  | "verifying"      // Galileo verification in progress
  | "verified"       // Passed verification
  | "retry_pending"  // Failed verification, will retry
  | "rejected"       // Failed verification, max retries exceeded
  | "reassigning"    // Finding new agent
  | "paying"         // Payment in progress
  | "payment_retry"  // Payment failed, retrying
  | "completed"      // Done (terminal)
  | "failed";        // Failed (terminal)
```

---

## State Machine Diagram

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                                                                               │
│                              ┌─────────────┐                                  │
│                              │   pending   │                                  │
│                              │ (wait deps) │                                  │
│                              └──────┬──────┘                                  │
│                                     │ dependencies met                        │
│                                     ▼                                         │
│                              ┌─────────────┐                                  │
│                              │    ready    │                                  │
│                              │  (queued)   │                                  │
│                              └──────┬──────┘                                  │
│                                     │ picked up                               │
│                                     ▼                                         │
│                              ┌─────────────┐                                  │
│        ┌─────────────────────│  prompting  │◄────────────────────┐            │
│        │  (retry w/feedback) │(Prompt Agent)│                    │            │
│        │                     └──────┬──────┘                     │            │
│        │                            │ prompt generated           │            │
│        │                            ▼                            │            │
│        │                     ┌─────────────┐                     │            │
│        │                     │ dispatched  │◄────────┐           │            │
│        │                     │(sent to agent)        │           │            │
│        │                     └──────┬──────┘         │           │            │
│        │                            │                │           │            │
│        │           ┌────────────────┼────────────────┤           │            │
│        │           ▼                │                ▼           │            │
│        │     (sync response)        │         (async response)   │            │
│        │           │                │                │           │            │
│        │           │                │                ▼           │            │
│        │           │                │         ┌─────────────┐    │            │
│        │           │                │         │   polling   │    │            │
│        │           │                │         │(3s→15s, 10m)│    │            │
│        │           │                │         └──────┬──────┘    │            │
│        │           │                │                │           │            │
│        │           │                │   ┌────────────┼───────────┤            │
│        │           │                │   ▼            ▼           ▼            │
│        │           │                │(success)  (timeout)    (error)          │
│        │           │                │   │            │           │            │
│        │           │                │   │            ▼           │            │
│        │           │                │   │     ┌─────────────┐    │            │
│        │           │                │   │     │    stale    │────┘            │
│        │           │                │   │     │ (self-heal) │  (retry)        │
│        │           │                │   │     └─────────────┘                 │
│        │           │                │   │                                     │
│        │           └────────────────┴───┴───────────┐                         │
│        │                                            ▼                         │
│        │                                     ┌─────────────┐                  │
│        │                                     │  received   │                  │
│        │                                     │(got output) │                  │
│        │                                     └──────┬──────┘                  │
│        │                                            │                         │
│        │                                            ▼                         │
│        │                                     ┌─────────────┐                  │
│        │                                     │  verifying  │                  │
│        │                                     │ (Galileo)   │                  │
│        │                                     └──────┬──────┘                  │
│        │                                            │                         │
│        │              ┌─────────────────────────────┼─────────────────────┐   │
│        │              ▼                             ▼                     ▼   │
│        │          [PASS]                    [RETRY needed]            [REJECT]│
│        │              │                             │                     │   │
│        │              ▼                             ▼                     ▼   │
│        │       ┌─────────────┐              ┌─────────────┐        ┌───────────┐
│        │       │  verified   │              │retry_pending│        │ rejected  │
│        │       └──────┬──────┘              │(w/ feedback)│        └─────┬─────┘
│        │              │                     └──────┬──────┘              │   │
│        │              ▼                            │                     │   │
│        │       ┌─────────────┐                     │                     ▼   │
│        │       │   paying    │                     │              ┌───────────┐
│        │       │   (x402)    │                     │              │reassigning│
│        │       └──────┬──────┘                     │              │(new agent)│
│        │              │                            │              └─────┬─────┘
│        │   ┌──────────┼──────────┐                 │                    │   │
│        │   ▼          ▼          │                 │                    │   │
│        │(success)  (failed)      │                 │                    │   │
│        │   │          │          │                 └────────────────────┘   │
│        │   ▼          ▼          │                          │               │
│        │┌──────┐ ┌───────────┐   │                          │               │
│        ││ done │ │pay_retry  │───┘                          │               │
│        │└──────┘ └───────────┘                              │               │
│        │   │                                                │               │
│        │   ▼                                                │               │
│        │┌─────────────┐                                     │               │
│        ││  completed  │                                     │               │
│        │└─────────────┘                                     │               │
│        │                                                    │               │
│        └────────────────────────────────────────────────────┘               │
│                          (back to prompting with feedback)                  │
│                                                                             │
│  TERMINAL STATES:                                                           │
│  ┌─────────────┐  ┌─────────────┐                                          │
│  │  completed  │  │   failed    │ (max retries exceeded)                   │
│  └─────────────┘  └─────────────┘                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## State Transition Table

| From | To | Trigger | Guard |
|------|-----|---------|-------|
| `pending` | `ready` | Dependencies completed | All `depends_on` IDs in completed set |
| `ready` | `prompting` | Worker picks up item | None |
| `prompting` | `dispatched` | Prompt generated | `generated_prompt` exists |
| `dispatched` | `polling` | Agent returns async ref | `response.type === "async"` |
| `dispatched` | `received` | Agent returns sync response | `response.type === "sync"` |
| `polling` | `received` | Poll returns completed | `poll.status === "completed"` |
| `polling` | `stale` | Timeout reached | `now > timeout_at` |
| `stale` | `dispatched` | Retry dispatched | `stale_retry_count < 3` |
| `stale` | `failed` | Max retries | `stale_retry_count >= 3` |
| `received` | `verifying` | Output ready | `output` exists |
| `verifying` | `verified` | High score | `score >= 0.90` |
| `verifying` | `retry_pending` | Medium score | `score >= 0.60 && score < 0.90 && attempt < 3` |
| `verifying` | `rejected` | Low score or max retries | `score < 0.60 \|\| attempt >= 3` |
| `retry_pending` | `prompting` | Retry initiated | Feedback attached |
| `rejected` | `reassigning` | Try new agent | Other agents available |
| `rejected` | `failed` | No alternatives | No other agents |
| `reassigning` | `prompting` | New agent assigned | `agent_id` updated |
| `verified` | `paying` | Start payment | None |
| `paying` | `completed` | Payment confirmed | `tx_hash` exists |
| `paying` | `payment_retry` | Payment failed | `payment_retry_count < 3` |
| `payment_retry` | `paying` | Retry payment | After backoff |
| `payment_retry` | `failed` | Max payment retries | `payment_retry_count >= 3` |

---

## Transition Payload Types

All transition payloads are strongly typed. Each trigger has a specific payload interface:

```typescript
import type {
  WorkItem,
  WorkItemStatus,
  ActionItem,
  Agent,
  CriteriaResult
} from "@/types";
import type { DatabaseClient } from "@/lib/db/database-client";

// =============================================================================
// TRANSITION TRIGGER TYPES
// =============================================================================

/**
 * Union type of all valid transition triggers
 */
type TransitionTrigger =
  | "dependencies_met"
  | "picked_up"
  | "prompt_generated"
  | "async_response"
  | "sync_response"
  | "poll_completed"
  | "poll_timeout"
  | "retry_dispatch"
  | "max_stale_retries"
  | "start_verification"
  | "verification_pass"
  | "verification_retry"
  | "verification_reject"
  | "retry_initiated"
  | "try_new_agent"
  | "no_alternatives"
  | "agent_reassigned"
  | "start_payment"
  | "payment_confirmed"
  | "payment_failed"
  | "retry_payment"
  | "max_payment_retries";

// =============================================================================
// PAYLOAD INTERFACES FOR EACH TRIGGER
// =============================================================================

/**
 * Payload for "prompt_generated" trigger
 */
interface PromptGeneratedPayload {
  generated_prompt: string;
  requirements: string[];
  context_used: {
    summary: string;
    refs_fetched: string[];
  };
}

/**
 * Payload for "async_response" trigger (agent returned async reference)
 */
interface AsyncResponsePayload {
  reference_id: string;
  status_url: string;
  callback_url?: string;
}

/**
 * Payload for "sync_response" trigger (agent returned immediate result)
 */
interface SyncResponsePayload {
  output: {
    title: string;
    description: string;
    content: unknown;
  };
}

/**
 * Payload for "poll_completed" trigger
 */
interface PollCompletedPayload {
  output: {
    title: string;
    description: string;
    content: unknown;
  };
}

/**
 * Payload for verification triggers (pass, retry, reject)
 */
interface VerificationPayload {
  score: number;
  reasoning: string;
  criteria_results: CriteriaResult[];
  issues: string[];
}

/**
 * Extended payload for verification_retry (includes retry context)
 */
interface VerificationRetryPayload extends VerificationPayload {
  previous_output: unknown;
  suggestions: string[];
}

/**
 * Payload for "try_new_agent" trigger
 */
interface TryNewAgentPayload {
  alternative_agents: Agent[];
}

/**
 * Payload for "agent_reassigned" trigger
 */
interface AgentReassignedPayload {
  new_agent: {
    agent_id: string;
    name: string;
    url: string;
    price: number;
  };
}

/**
 * Payload for "payment_confirmed" trigger
 */
interface PaymentConfirmedPayload {
  amount: number;
  tx_hash: string;
}

// =============================================================================
// TRANSITION PAYLOAD TYPE MAP
// =============================================================================

/**
 * Maps each trigger to its payload type.
 * Triggers with undefined payload require no additional data.
 */
interface TransitionPayloadMap {
  dependencies_met: undefined;
  picked_up: undefined;
  prompt_generated: PromptGeneratedPayload;
  async_response: AsyncResponsePayload;
  sync_response: SyncResponsePayload;
  poll_completed: PollCompletedPayload;
  poll_timeout: undefined;
  retry_dispatch: undefined;
  max_stale_retries: undefined;
  start_verification: undefined;
  verification_pass: VerificationPayload;
  verification_retry: VerificationRetryPayload;
  verification_reject: VerificationPayload;
  retry_initiated: undefined;
  try_new_agent: TryNewAgentPayload;
  no_alternatives: undefined;
  agent_reassigned: AgentReassignedPayload;
  start_payment: undefined;
  payment_confirmed: PaymentConfirmedPayload;
  payment_failed: undefined;
  retry_payment: undefined;
  max_payment_retries: undefined;
}

/**
 * Helper type to get payload type for a trigger
 */
type PayloadFor<T extends TransitionTrigger> = TransitionPayloadMap[T];
```

---

## Transition Result and Implementation

```typescript
// =============================================================================
// TRANSITION RESULT
// =============================================================================

interface TransitionResult {
  success: boolean;
  new_status?: WorkItemStatus;
  error?: string;
  event?: WorkLifecycleEvent;
}

// =============================================================================
// WORK LIFECYCLE CLASS
// =============================================================================

/**
 * WorkLifecycle manages state transitions for work items.
 * Uses DatabaseClient for all database operations (never direct MongoDB access).
 */
class WorkLifecycle {
  constructor(private readonly db: DatabaseClient) {}

  /**
   * Execute a state transition for a work item.
   *
   * @param work_id - The work item ID
   * @param trigger - The transition trigger (must be valid TransitionTrigger)
   * @param payload - Optional payload data (type depends on trigger)
   */
  async transition<T extends TransitionTrigger>(
    work_id: string,
    trigger: T,
    payload?: PayloadFor<T>
  ): Promise<TransitionResult> {
    // Use DatabaseClient to fetch work item
    const work = await this.db.getWorkItem(work_id);
    if (!work) {
      return { success: false, error: "Work item not found" };
    }

    const transition = this.getTransition(work.status, trigger);
    if (!transition) {
      return {
        success: false,
        error: `Invalid transition: ${work.status} + ${trigger}`
      };
    }

    // Check guard (guard functions are typed per transition)
    if (transition.guard && !transition.guard(work, payload)) {
      return { success: false, error: `Guard failed: ${transition.guardName}` };
    }

    // Execute transition to get field updates
    const updates = transition.execute(work, payload);

    // Use DatabaseClient method to update work item
    // The updateWorkItemFields method performs a partial update
    await this.db.updateWorkItemFields(work_id, {
      status: transition.to,
      ...updates
    });

    // Create event for emission
    const event: WorkLifecycleEvent = {
      type: "work:status_changed",
      work_id,
      status: transition.to
    };

    return {
      success: true,
      new_status: transition.to,
      event
    };
  }

  private getTransition(
    from: WorkItemStatus,
    trigger: TransitionTrigger
  ): Transition | null {
    return TRANSITIONS.find(
      t => t.from === from && t.trigger === trigger
    ) || null;
  }
}
```

---

## Transition Definitions

Each transition is strongly typed. Guards and execute functions receive typed payloads based on the trigger.

```typescript
// =============================================================================
// TRANSITION INTERFACE (TYPED)
// =============================================================================

/**
 * Generic transition definition with typed payload.
 * The guard and execute functions receive the correct payload type for their trigger.
 */
interface Transition<T extends TransitionTrigger = TransitionTrigger> {
  from: WorkItemStatus;
  to: WorkItemStatus;
  trigger: T;
  guard?: (work: WorkItem, payload: PayloadFor<T>) => boolean;
  guardName?: string;
  execute: (work: WorkItem, payload: PayloadFor<T>) => Partial<WorkItem>;
}

// =============================================================================
// TRANSITION DEFINITIONS
// =============================================================================

const TRANSITIONS: Transition[] = [
  // -------------------------------------------------------------------------
  // pending → ready
  // -------------------------------------------------------------------------
  {
    from: "pending",
    to: "ready",
    trigger: "dependencies_met",
    execute: () => ({})
  },

  // -------------------------------------------------------------------------
  // ready → prompting
  // -------------------------------------------------------------------------
  {
    from: "ready",
    to: "prompting",
    trigger: "picked_up",
    execute: () => ({ started_at: new Date() })
  },

  // -------------------------------------------------------------------------
  // prompting → dispatched
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
        generated_at: new Date()
      }
    })
  },

  // -------------------------------------------------------------------------
  // dispatched → polling (async response)
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
          timeout_ms: 600000
        },
        last_response: null,
        last_error: null
      }
    })
  },

  // -------------------------------------------------------------------------
  // dispatched → received (sync response)
  // -------------------------------------------------------------------------
  {
    from: "dispatched",
    to: "received",
    trigger: "sync_response",
    execute: (_work: WorkItem, payload: SyncResponsePayload) => ({
      output: payload.output
    })
  },

  // -------------------------------------------------------------------------
  // polling → received
  // -------------------------------------------------------------------------
  {
    from: "polling",
    to: "received",
    trigger: "poll_completed",
    execute: (_work: WorkItem, payload: PollCompletedPayload) => ({
      output: payload.output
    })
  },

  // -------------------------------------------------------------------------
  // polling → stale
  // -------------------------------------------------------------------------
  {
    from: "polling",
    to: "stale",
    trigger: "poll_timeout",
    execute: (work: WorkItem) => {
      const currentPolling = work.external_ref?.polling;
      return {
        external_ref: work.external_ref ? {
          ...work.external_ref,
          last_error: "Polling timeout exceeded"
        } : null
      };
    }
  },

  // -------------------------------------------------------------------------
  // stale → dispatched (retry)
  // Stale retry count is tracked via retries array length with reason "stale"
  // -------------------------------------------------------------------------
  {
    from: "stale",
    to: "dispatched",
    trigger: "retry_dispatch",
    guard: (work: WorkItem) => {
      const staleRetries = work.retries.filter(r => r.reason === "stale").length;
      return staleRetries < 3;
    },
    guardName: "stale_retries_remaining",
    execute: (work: WorkItem) => ({
      external_ref: work.external_ref ? {
        ...work.external_ref,
        dispatched_at: new Date(),
        last_error: null,
        polling: {
          ...work.external_ref.polling,
          poll_count: 0,
          timeout_at: new Date(Date.now() + 600000)
        }
      } : null,
      retries: [
        ...work.retries,
        {
          attempt: work.attempt,
          reason: "stale",
          score: 0,
          feedback_sent: "Retrying due to polling timeout",
          agent_id: work.agent?.agent_id ?? "",
          timestamp: new Date()
        }
      ]
    })
  },

  // -------------------------------------------------------------------------
  // stale → failed (max retries)
  // -------------------------------------------------------------------------
  {
    from: "stale",
    to: "failed",
    trigger: "max_stale_retries",
    guard: (work: WorkItem) => {
      const staleRetries = work.retries.filter(r => r.reason === "stale").length;
      return staleRetries >= 3;
    },
    guardName: "stale_retries_exhausted",
    execute: () => ({
      completed_at: new Date()
    })
  },

  // -------------------------------------------------------------------------
  // received → verifying
  // -------------------------------------------------------------------------
  {
    from: "received",
    to: "verifying",
    trigger: "start_verification",
    execute: () => ({})
  },

  // -------------------------------------------------------------------------
  // verifying → verified (pass)
  // -------------------------------------------------------------------------
  {
    from: "verifying",
    to: "verified",
    trigger: "verification_pass",
    guard: (_work: WorkItem, payload: VerificationPayload) =>
      payload.score >= 0.90,
    guardName: "score_passes",
    execute: (_work: WorkItem, payload: VerificationPayload) => ({
      verification: {
        score: payload.score,
        reasoning: payload.reasoning,
        criteria_results: payload.criteria_results,
        issues: payload.issues,
        verified_at: new Date()
      }
    })
  },

  // -------------------------------------------------------------------------
  // verifying → retry_pending
  // -------------------------------------------------------------------------
  {
    from: "verifying",
    to: "retry_pending",
    trigger: "verification_retry",
    guard: (work: WorkItem, payload: VerificationRetryPayload) =>
      payload.score >= 0.60 &&
      payload.score < 0.90 &&
      work.attempt < work.max_attempts,
    guardName: "retriable_score_and_attempts",
    execute: (work: WorkItem, payload: VerificationRetryPayload) => ({
      verification: {
        score: payload.score,
        reasoning: payload.reasoning,
        criteria_results: payload.criteria_results,
        issues: payload.issues,
        verified_at: new Date()
      },
      retry_context: {
        previous_attempt: work.attempt,
        previous_output: payload.previous_output,
        verification_feedback: {
          score: payload.score,
          reasoning: payload.reasoning,
          issues: payload.criteria_results
            .filter(cr => !cr.passed)
            .map(cr => ({
              criterion: cr.criterion,
              passed: cr.passed,
              detail: payload.issues.find(i => i.includes(cr.criterion)) ?? ""
            })),
          suggestions: payload.suggestions
        }
      }
    })
  },

  // -------------------------------------------------------------------------
  // verifying → rejected
  // -------------------------------------------------------------------------
  {
    from: "verifying",
    to: "rejected",
    trigger: "verification_reject",
    guard: (work: WorkItem, payload: VerificationPayload) =>
      payload.score < 0.60 || work.attempt >= work.max_attempts,
    guardName: "low_score_or_max_attempts",
    execute: (work: WorkItem, payload: VerificationPayload) => ({
      verification: {
        score: payload.score,
        reasoning: payload.reasoning,
        criteria_results: payload.criteria_results,
        issues: payload.issues,
        verified_at: new Date()
      }
    })
  },

  // -------------------------------------------------------------------------
  // retry_pending → prompting
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
          feedback_sent: work.retry_context?.verification_feedback.suggestions.join("; ") ?? "",
          agent_id: work.agent?.agent_id ?? "",
          timestamp: new Date()
        }
      ]
    })
  },

  // -------------------------------------------------------------------------
  // rejected → reassigning
  // -------------------------------------------------------------------------
  {
    from: "rejected",
    to: "reassigning",
    trigger: "try_new_agent",
    guard: (_work: WorkItem, payload: TryNewAgentPayload) =>
      payload.alternative_agents.length > 0,
    guardName: "alternatives_available",
    execute: () => ({})
  },

  // -------------------------------------------------------------------------
  // rejected → failed (no alternatives)
  // -------------------------------------------------------------------------
  {
    from: "rejected",
    to: "failed",
    trigger: "no_alternatives",
    execute: () => ({
      completed_at: new Date()
    })
  },

  // -------------------------------------------------------------------------
  // reassigning → prompting
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
          timestamp: new Date()
        }
      ]
    })
  },

  // -------------------------------------------------------------------------
  // verified → paying
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
        confirmed_at: null
      }
    })
  },

  // -------------------------------------------------------------------------
  // paying → completed
  // -------------------------------------------------------------------------
  {
    from: "paying",
    to: "completed",
    trigger: "payment_confirmed",
    execute: (work: WorkItem, payload: PaymentConfirmedPayload) => ({
      payment: work.payment ? {
        ...work.payment,
        status: "confirmed" as const,
        amount: payload.amount,
        tx_hash: payload.tx_hash,
        confirmed_at: new Date()
      } : null,
      completed_at: new Date()
    })
  },

  // -------------------------------------------------------------------------
  // paying → payment_retry
  // -------------------------------------------------------------------------
  {
    from: "paying",
    to: "payment_retry",
    trigger: "payment_failed",
    guard: (work: WorkItem) =>
      (work.payment?.retry_count ?? 0) < 3,
    guardName: "payment_retries_remaining",
    execute: (work: WorkItem) => ({
      payment: work.payment ? {
        ...work.payment,
        status: "failed" as const,
        retry_count: (work.payment.retry_count ?? 0) + 1,
        error: "Payment failed, will retry"
      } : null
    })
  },

  // -------------------------------------------------------------------------
  // payment_retry → paying
  // -------------------------------------------------------------------------
  {
    from: "payment_retry",
    to: "paying",
    trigger: "retry_payment",
    execute: (work: WorkItem) => ({
      payment: work.payment ? {
        ...work.payment,
        status: "processing" as const,
        error: null
      } : null
    })
  },

  // -------------------------------------------------------------------------
  // payment_retry → failed
  // -------------------------------------------------------------------------
  {
    from: "payment_retry",
    to: "failed",
    trigger: "max_payment_retries",
    execute: (work: WorkItem) => ({
      payment: work.payment ? {
        ...work.payment,
        status: "failed" as const,
        error: "Max payment retries exceeded"
      } : null,
      completed_at: new Date()
    })
  }
];
```

---

## Agent Reassignment

When a work item is rejected (score < 0.60 or max retries exceeded), the system attempts to find an alternative agent.

### Reassignment Criteria

```typescript
interface ReassignmentCriteria {
  // Exclude
  excluded_agent_ids: string[];  // Already failed with this agent

  // Required
  min_quality_score: number;     // 0.80 (hard constraint)
  capabilities: string[];        // Must match task requirements

  // Preferred
  prefer_higher_quality: boolean;  // Prioritize quality over price
}

async function findAlternativeAgent(
  work: WorkItem,
  availableAgents: Agent[]
): Promise<Agent | null> {
  // Get failed agent IDs for this work item
  const failedAgentIds = work.failed_agents || [];
  failedAgentIds.push(work.agent.agent_id);

  // Filter candidates
  const candidates = availableAgents.filter(agent => {
    // Must not have already failed
    if (failedAgentIds.includes(agent.agent_id)) return false;

    // Must meet quality threshold
    if (agent.stats.avg_score < 0.80) return false;

    // Must have required capabilities
    const requiredCaps = work.action.required_capabilities || [];
    if (!requiredCaps.every(cap => agent.capabilities.includes(cap))) return false;

    return true;
  });

  if (candidates.length === 0) return null;

  // Sort by quality (since previous agent failed, prioritize quality)
  candidates.sort((a, b) => b.stats.avg_score - a.stats.avg_score);

  return candidates[0];
}
```

### Reassignment Limits

```typescript
const MAX_REASSIGNMENTS = 2;  // Maximum 2 different agents can try

function canReassign(work: WorkItem): boolean {
  const reassignmentCount = work.failed_agents?.length || 0;
  return reassignmentCount < MAX_REASSIGNMENTS;
}
```

### Reassignment Flow

```
rejected → canReassign?
              │
    ┌─────────┴─────────┐
    ▼                   ▼
  [YES]               [NO]
    │                   │
    ▼                   ▼
reassigning          failed
    │          "No alternative agents"
    ▼
findAlternativeAgent()
    │
    ├── found → prompting (with new agent, attempt=1)
    │
    └── not found → failed
```

---

## Parallel Execution

TODOs with satisfied dependencies execute in parallel.

```
Time →
─────────────────────────────────────────────────────────────────────────────
Iter 1:  [████ TODO #1 ████]
             │
Iter 2:      └─┬─────────────────────────────────────────┐
               │                                         │
               [████ TODO #2 ████]                       │
               [████ TODO #3 ████]  ← PARALLEL           │
               [████ TODO #4 ████]                       │
                              │                          │
Iter 3:                       └───[████ TODO #5 ████]    │
                                              │          │
Iter 4:                                       └──────────┴──[██ #6 ██]
                                                               │
                                                               ▼
                                                            DONE
```

### Resolution Logic

```typescript
/**
 * Get action items that have all dependencies satisfied.
 * Uses Plan's action_items and a set of completed action item IDs.
 */
function getActionableTodos(
  plan: Plan,
  completedIds: Set<number>
): ActionItem[] {
  return plan.action_items.filter(item => {
    // Must be pending
    if (item.status !== "pending") return false;

    // All dependencies must be completed
    return item.depends_on.every(depId => completedIds.has(depId));
  });
}

/**
 * Check if a work item's dependencies are satisfied.
 * Uses DatabaseClient for all database operations.
 *
 * @param db - DatabaseClient instance
 * @param lifecycle - WorkLifecycle instance for transitions
 * @param work_id - The work item to check
 * @param plan - The plan containing action items
 */
async function checkDependencies(
  db: DatabaseClient,
  lifecycle: WorkLifecycle,
  work_id: string,
  plan: Plan
): Promise<void> {
  // Use DatabaseClient to get work item
  const work = await db.getWorkItem(work_id);
  if (!work) {
    throw new Error(`Work item not found: ${work_id}`);
  }

  // Find the action item for this work
  const actionItem = plan.action_items.find(
    ai => ai.id === work.action_item_id
  );
  if (!actionItem) {
    throw new Error(`Action item not found for work: ${work_id}`);
  }

  if (actionItem.depends_on.length === 0) {
    // No dependencies, ready immediately
    await lifecycle.transition(work_id, "dependencies_met");
    return;
  }

  // Use DatabaseClient to get dependency work items
  const dependencyWorks = await db.getWorkItemsByActionItemIds(
    work.job_id,
    actionItem.depends_on
  );

  const allCompleted = dependencyWorks.every(w => w.status === "completed");

  if (allCompleted) {
    await lifecycle.transition(work_id, "dependencies_met");
  }
}
```

### Parallel Execution Coordinator

```typescript
/**
 * Result of executing a single work item
 */
interface WorkExecutionResult {
  work_id: string;
  success: boolean;
  error?: string;
}

/**
 * Execute multiple work items in parallel.
 * Uses Promise.allSettled to ensure all items are attempted regardless of failures.
 *
 * @param lifecycle - WorkLifecycle instance for transitions
 * @param workItems - Work items to execute in parallel
 * @param executeWorkItem - Function that executes a single work item
 */
async function executeParallel(
  lifecycle: WorkLifecycle,
  workItems: WorkItem[],
  executeWorkItem: (work: WorkItem) => Promise<WorkExecutionResult>
): Promise<WorkExecutionResult[]> {
  // Execute all items in parallel
  const promises = workItems.map(work =>
    executeWorkItem(work).catch((error: Error) => ({
      work_id: work.work_id,
      success: false,
      error: error.message
    }))
  );

  const results = await Promise.allSettled(promises);
  const executionResults: WorkExecutionResult[] = [];

  // Process results
  for (const result of results) {
    if (result.status === "fulfilled") {
      executionResults.push(result.value);

      // If execution failed, the work item is already in a terminal state
      // (handled within executeWorkItem)
    } else {
      // Unexpected rejection (executeWorkItem should not throw)
      console.error("Unexpected rejection in parallel execution:", result.reason);
    }
  }

  return executionResults;
}
```

---

## Dynamic TODO Spawning

Main Agent can spawn new TODOs based on output analysis.

```
TODO #1: "Identify competitors"
    │
    ▼ Output: "Found 3 competitors: Cassandra, DynamoDB, CockroachDB"
    │
    ▼ Main Agent analyzes output
    │
    ▼ Decision: "Need specific research for each competitor"
    │
    ▼ SPAWN NEW TODOs:
        ├── TODO #7: "Research Cassandra in detail" (depends_on: [1])
        ├── TODO #8: "Research DynamoDB in detail" (depends_on: [1])
        └── TODO #9: "Research CockroachDB in detail" (depends_on: [1])
```

### Spawning Implementation

```typescript
/**
 * Request to spawn new TODO items from a parent TODO.
 */
interface SpawnRequest {
  job_id: string;
  plan_id: string;
  parent_todo_id: number;
  new_todos: Array<{
    item: string;
    priority: number;
    depends_on: number[];
    deliverable_id: string;
    agent_id: string | null;
    template_id: string;
    resource_type: "AGENT" | "SELF";
    estimated_cost: number;
  }>;
}

/**
 * Result of spawning new TODOs
 */
interface SpawnResult {
  spawned_items: ActionItem[];
  created_work_ids: string[];
}

/**
 * Spawn new TODO items from a parent TODO.
 * Uses DatabaseClient for all database operations.
 *
 * @param db - DatabaseClient instance
 * @param request - The spawn request with new TODO definitions
 * @param emitEvent - Function to emit events
 */
async function spawnTodos(
  db: DatabaseClient,
  request: SpawnRequest,
  emitEvent: (event: WorkLifecycleEvent) => void
): Promise<SpawnResult> {
  // Use DatabaseClient to get plan
  const plan = await db.getPlan(request.plan_id);
  if (!plan) {
    throw new Error(`Plan not found: ${request.plan_id}`);
  }

  // Generate new IDs (incrementing from max existing ID)
  const maxId = Math.max(0, ...plan.action_items.map(a => a.id));
  const newActionItems: ActionItem[] = request.new_todos.map((todo, index) => ({
    id: maxId + index + 1,
    item: todo.item,
    priority: todo.priority,
    depends_on: todo.depends_on,
    deliverable_id: todo.deliverable_id,
    agent_id: todo.agent_id,
    template_id: todo.template_id,
    estimated_cost: todo.estimated_cost,
    status: "pending" as const,
    work_id: null,
    resource_type: todo.resource_type
  }));

  // Use DatabaseClient to add action items to plan
  await db.pushActionItemsToPlan(request.plan_id, newActionItems);

  // Create work items for each new action item
  const createdWorkIds: string[] = [];
  for (const actionItem of newActionItems) {
    const workItem = await db.createWorkItem({
      work_id: `work_${Date.now()}_${actionItem.id}`,
      job_id: request.job_id,
      plan_id: request.plan_id,
      action_item_id: actionItem.id,
      status: "pending",
      attempt: 1,
      max_attempts: 3,
      action: {
        item: actionItem.item,
        deliverable_id: actionItem.deliverable_id,
        requirements: [] // Will be populated during prompting
      },
      agent: null,
      prompt: null,
      external_ref: null,
      output: null,
      verification: null,
      retry_context: null,
      payment: null,
      token_usage: {
        internal: [],
        external: null,
        total_internal_cost_usd: 0,
        total_external_cost_usd: 0,
        total_cost_usd: 0
      },
      retries: [],
      started_at: null,
      completed_at: null
    });
    createdWorkIds.push(workItem.work_id);
  }

  // Emit event for spawned TODOs
  emitEvent({
    type: "todo:spawned",
    parent_id: request.parent_todo_id,
    new_todos: newActionItems
  });

  return {
    spawned_items: newActionItems,
    created_work_ids: createdWorkIds
  };
}
```

### Spawning Triggers

Spawn triggers define conditions under which new TODOs should be created based on work item output.

```typescript
/**
 * Output structure that may trigger spawning (for list-type outputs)
 */
interface SpawnableOutput {
  items?: Array<{ name: string; [key: string]: unknown }>;
  needs_detail?: boolean;
}

/**
 * Definition for a new TODO to spawn
 */
interface SpawnedTodoDefinition {
  item: string;
  priority: number;
}

/**
 * A spawn trigger defines when and what new TODOs to create.
 */
interface SpawnTrigger {
  /** Unique identifier for this trigger */
  id: string;
  /** Human-readable description */
  description: string;
  /** Condition function - returns true if trigger should fire */
  condition: (work: WorkItem, output: SpawnableOutput) => boolean;
  /** Generate new TODO definitions when condition is met */
  spawn: (work: WorkItem, output: SpawnableOutput) => SpawnedTodoDefinition[];
}

/**
 * Registry of spawn triggers.
 * Add new triggers here as needed.
 */
const SPAWN_TRIGGERS: SpawnTrigger[] = [
  // -------------------------------------------------------------------------
  // Output reveals items needing individual attention
  // -------------------------------------------------------------------------
  {
    id: "detail_required_for_list_items",
    description: "Spawns detailed research tasks for each item in a list output",
    condition: (work: WorkItem, output: SpawnableOutput) =>
      output.items !== undefined &&
      output.items.length > 1 &&
      output.needs_detail === true,
    spawn: (_work: WorkItem, output: SpawnableOutput) =>
      (output.items ?? []).map(item => ({
        item: `Research ${item.name} in detail`,
        priority: 2
      }))
  },

  // -------------------------------------------------------------------------
  // Quality issues require verification
  // -------------------------------------------------------------------------
  {
    id: "quality_review_needed",
    description: "Spawns a review task when verification score is marginal",
    condition: (work: WorkItem) =>
      work.verification !== null &&
      work.verification.score >= 0.80 &&
      work.verification.score < 0.90,
    spawn: () => [{
      item: "Review and verify output quality",
      priority: 1
    }]
  }
];
```

---

## Continuation Action Types

When user continues a job with feedback, work items are created with specific action types:

| Type | Description | State Handling |
|------|-------------|----------------|
| `CREATE_NEW` | New deliverable | Normal flow: `pending` → full lifecycle |
| `MODIFY_EXISTING` | Change specific part of existing work | Starts at `prompting` with previous output in context |
| `REPLACE_EXISTING` | Redo entire work item | `pending` → full lifecycle, original marked `superseded` |
| `RERUN_WITH_CONTEXT` | Same task with updated context | `pending` → full lifecycle with new context_refs |

### Continuation Work Item Creation

```typescript
/**
 * Extended WorkItem for continuation scenarios.
 * Includes action type and reference to original work.
 */
interface ContinuationWorkItemData {
  action_type: ContinuationActionType;
  original_work_id?: string;
  modification_context?: {
    specific_item: string;
    current_value: unknown;
  };
}

/**
 * Extended ActionItem for continuation scenarios.
 */
interface ContinuationActionItem extends ActionItem {
  action_type: ContinuationActionType;
  original_work_id?: string;
  specific_item?: string;
  current_value?: unknown;
}

/**
 * Create a work item for a continuation action.
 * Uses DatabaseClient for all database operations.
 *
 * @param db - DatabaseClient instance
 * @param job_id - The job ID
 * @param plan_id - The plan ID
 * @param action_item - The continuation action item
 * @param emitEvent - Function to emit events
 */
async function createContinuationWorkItem(
  db: DatabaseClient,
  job_id: string,
  plan_id: string,
  action_item: ContinuationActionItem,
  emitEvent: (event: WorkLifecycleEvent) => void
): Promise<WorkItem> {
  const work_id = `work_${Date.now()}_${action_item.id}`;

  // Determine initial status based on action type
  let initialStatus: WorkItemStatus;
  switch (action_item.action_type) {
    case "CREATE_NEW":
    case "REPLACE_EXISTING":
    case "RERUN_WITH_CONTEXT":
      initialStatus = "pending";
      break;
    case "MODIFY_EXISTING":
      // Skip to prompting - we already have the content
      initialStatus = "prompting";
      break;
  }

  // Build work item using DatabaseClient
  const workItem = await db.createWorkItem({
    work_id,
    job_id,
    plan_id,
    action_item_id: action_item.id,
    status: initialStatus,
    attempt: 1,
    max_attempts: 3,
    action: {
      item: action_item.item,
      deliverable_id: action_item.deliverable_id,
      requirements: []
    },
    agent: null,
    prompt: null,
    external_ref: null,
    output: null,
    verification: null,
    retry_context: action_item.action_type === "MODIFY_EXISTING" ? {
      previous_attempt: 0,
      previous_output: action_item.current_value ?? null,
      verification_feedback: {
        score: 0,
        reasoning: "",
        issues: [],
        suggestions: []
      }
    } : null,
    payment: null,
    token_usage: {
      internal: [],
      external: null,
      total_internal_cost_usd: 0,
      total_external_cost_usd: 0,
      total_cost_usd: 0
    },
    retries: [],
    started_at: action_item.action_type === "MODIFY_EXISTING" ? new Date() : null,
    completed_at: null
  });

  // Handle REPLACE_EXISTING - mark original as superseded
  if (action_item.action_type === "REPLACE_EXISTING" && action_item.original_work_id) {
    await db.updateWorkItemFields(action_item.original_work_id, {
      // Note: superseded_by is not in the base WorkItem type
      // This would need to be added or handled via a separate method
    });
  }

  // Emit creation event
  emitEvent({
    type: "work:created",
    work_id,
    action_item_id: action_item.id
  });

  return workItem;
}
```

---

## Retry Counting

```typescript
interface RetryLimits {
  verification_retries: number;  // 3
  stale_retries: number;         // 3
  payment_retries: number;       // 3
  agent_reassignments: number;   // 2
}

const DEFAULT_LIMITS: RetryLimits = {
  verification_retries: 3,
  stale_retries: 3,
  payment_retries: 3,
  agent_reassignments: 2
};

function canRetry(work: WorkItem, type: keyof RetryLimits): boolean {
  switch (type) {
    case "verification_retries":
      return work.attempt < DEFAULT_LIMITS.verification_retries;
    case "stale_retries":
      return (work.stale_retry_count || 0) < DEFAULT_LIMITS.stale_retries;
    case "payment_retries":
      return (work.payment?.retry_count || 0) < DEFAULT_LIMITS.payment_retries;
    case "agent_reassignments":
      return (work.reassignment_count || 0) < DEFAULT_LIMITS.agent_reassignments;
  }
}
```

---

## Events Emitted

```typescript
type WorkLifecycleEvent =
  | { type: "work:created"; work_id: string; action_item_id: number }
  | { type: "work:status_changed"; work_id: string; status: WorkItemStatus }
  | { type: "work:retry"; work_id: string; attempt: number; reason: string; issues: string[] }
  | { type: "work:failed"; work_id: string; reason: string }
  | { type: "todo:spawned"; parent_id: number; new_todos: ActionItem[] };
```

---

## Interface: Dependencies

| Module | What We Need | Interface |
|--------|--------------|-----------|
| **DATA** | Work item CRUD | `DatabaseClient` |
| **ORCH_GRAPH** | Event emission | `EventEmitter` |

---

## Interface: Provides

### WorkLifecycle

```typescript
/**
 * Retry type for canRetry check
 */
type RetryType = keyof RetryLimits;

/**
 * WorkLifecycle interface - the main API for work item state management.
 * All methods use DatabaseClient internally (injected via constructor).
 */
interface IWorkLifecycle {
  /**
   * Execute a state transition for a work item.
   * Uses typed triggers and payloads.
   *
   * @param work_id - The work item ID
   * @param trigger - The transition trigger
   * @param payload - Optional payload (type depends on trigger)
   */
  transition<T extends TransitionTrigger>(
    work_id: string,
    trigger: T,
    payload?: PayloadFor<T>
  ): Promise<TransitionResult>;

  /**
   * Get all work items that are ready for execution.
   * Returns items in "ready" status for the given job.
   *
   * @param job_id - The job ID
   */
  getActionable(job_id: string): Promise<WorkItem[]>;

  /**
   * Check if a work item can retry for a specific retry type.
   *
   * @param work_id - The work item ID
   * @param type - The type of retry to check
   */
  canRetry(work_id: string, type: RetryType): Promise<boolean>;

  /**
   * Spawn new TODO items from a parent TODO.
   *
   * @param request - The spawn request
   */
  spawnTodos(request: SpawnRequest): Promise<SpawnResult>;

  /**
   * Check if a work item's dependencies are satisfied.
   * If all dependencies are completed, transitions to "ready".
   *
   * @param work_id - The work item to check
   * @param plan - The plan containing action items
   */
  checkDependencies(work_id: string, plan: Plan): Promise<void>;

  /**
   * Called when a work item completes.
   * Checks all pending items that depend on this one.
   *
   * @param work_id - The completed work item ID
   * @param plan - The plan containing action items
   */
  onWorkCompleted(work_id: string, plan: Plan): Promise<void>;
}
```

---

## User Continuation Flow

When user sends a follow-up message after job completion, the system runs a new planning cycle.

### Continuation Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  USER CONTINUATION FLOW                                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  VERSION 1 COMPLETE                     VERSION 2                           │
│       │                                      │                              │
│       ▼                                      ▼                              │
│  User: "Make headline #3             Main Agent picks up with:              │
│         shorter"                     ├── context_summary (lightweight)      │
│       │                              └── context_refs (index only)          │
│       │                                      │                              │
│       │                                      ▼                              │
│       └─────────────────────────────► Planning Agent                        │
│                                      (loads work_items on demand)           │
│                                              │                              │
│                                              ▼                              │
│                                       Plan Verifier                         │
│                                              │                              │
│                                              ▼                              │
│                                       Execute action items                  │
│                                              │                              │
│                                              ▼                              │
│                                       Version 2 Complete                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Planning Agent Continuation Process

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PLANNING AGENT (Continuation Mode)                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  INPUT:                                                                      │
│  {                                                                           │
│    user_message: "Make headline #3 shorter",                                │
│    context_summary: "Target: professionals 28-45...",                       │
│    context_refs: [                                                           │
│      { work_id: "work_001", title: "Strategy", desc: "..." },               │
│      { work_id: "work_002", title: "Headlines", desc: "5 headlines..." },   │
│      { work_id: "work_003", title: "Posts", desc: "3 posts..." },           │
│      { work_id: "work_004", title: "Hero Image", desc: "..." }              │
│    ]                                                                         │
│    // NOTE: Full content NOT included - just the index                      │
│  }                                                                           │
│                                                                              │
│  STEP 1: Analyze user request                                               │
│          "What is user asking for?"                                         │
│          → Modify specific item (headline #3)                               │
│                                                                              │
│  STEP 2: Identify source from context_refs                                  │
│          "Where is this item?"                                              │
│          → work_002 contains headlines (visible from title/description)    │
│                                                                              │
│  STEP 3: Load needed content (ON DEMAND)                                    │
│          fetch_work_item("work_002")                                        │
│          → { headlines: ["...", "...", "This headline #3 is long...", ...]}│
│                                                                              │
│  STEP 4: Create plan with specific action                                   │
│          {                                                                   │
│            action_items: [{                                                  │
│              id: 7,                                                          │
│              type: "MODIFY_EXISTING",                                       │
│              source_work_id: "work_002",                                    │
│              specific_item: "headlines[2]",                                 │
│              instruction: "Shorten this headline to under 10 words",        │
│              current_value: "This headline #3 is too long...",              │
│              agent_id: "agent_copywriter_001",                              │
│              template_id: "tpl_headline_edit_001"                           │
│            }]                                                                │
│          }                                                                   │
│                                                                              │
│  STEP 5: Consider dependencies (if applicable)                              │
│          "Is headline #3 used elsewhere?"                                   │
│          → Check if any posts reference it                                  │
│          → May add additional action items if needed                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Action Types for Continuation

```typescript
type ContinuationActionType =
  | "CREATE_NEW"           // New deliverable that doesn't exist
  | "MODIFY_EXISTING"      // Change specific part of existing work
  | "REPLACE_EXISTING"     // Redo entire work item
  | "RERUN_WITH_CONTEXT";  // Same task with updated context

interface ContinuationActionItem extends ActionItem {
  action_type: ContinuationActionType;
  original_work_id?: string;      // For MODIFY/REPLACE/RERUN
  specific_item?: string;         // For MODIFY (e.g., "headlines[2]")
  current_value?: unknown;        // Current value being modified (unknown used for flexibility with type narrowing)
}
```

### Action Type Decision Table

| User Request | Action Type | What Happens |
|--------------|-------------|--------------|
| "Make headline #3 shorter" | `MODIFY_EXISTING` | Load work_002, modify headlines[2] only |
| "Add TikTok script" | `CREATE_NEW` | New deliverable, new work item |
| "Rewrite all headlines" | `REPLACE_EXISTING` | Original marked superseded, new work item |
| "Make images more playful" | `RERUN_WITH_CONTEXT` | Same task but with updated tone in context |

### State Handling by Action Type

The `createContinuationWorkItem` function (defined above) handles all four action types with proper initial state and context setup. See the implementation in the "Continuation Work Item Creation" section.

**Key behaviors by action type:**

| Action Type | Initial Status | Special Handling |
|-------------|---------------|------------------|
| `CREATE_NEW` | `pending` | Normal lifecycle flow |
| `MODIFY_EXISTING` | `prompting` | Skips pending, loads `retry_context` with previous output |
| `REPLACE_EXISTING` | `pending` | Marks original work item as superseded |
| `RERUN_WITH_CONTEXT` | `pending` | Context refs updated by Planning Agent before creation |

```typescript
/**
 * Mark a work item as superseded by a newer version.
 * Uses DatabaseClient for database operations.
 *
 * Note: The WorkItem type would need to be extended with optional
 * superseded_by and superseded_at fields for full continuation support.
 *
 * @param db - DatabaseClient instance
 * @param original_work_id - The work item being replaced
 * @param new_work_id - The replacement work item
 */
async function markSuperseded(
  db: DatabaseClient,
  original_work_id: string,
  new_work_id: string
): Promise<void> {
  // This requires extending WorkItem type or using a separate tracking mechanism
  // For now, this can be tracked in the Job's versions array
  // or by adding superseded_by/superseded_at to WorkItem type
  await db.updateWorkItemFields(original_work_id, {
    // Extended fields (would need to be added to WorkItem type):
    // superseded_by: new_work_id,
    // superseded_at: new Date()
  });
}
```

### Version Tracking

```typescript
interface VersionedContextRef extends ContextRef {
  version: number;
  current: boolean;
  replaces?: string;  // work_id this replaces
}

// After continuation modifies headline #3:
// BEFORE (version 1)
context_refs: [
  { work_id: "work_002", title: "Headlines", desc: "5 headlines...", version: 1 }
]

// AFTER (version 2) - append with lineage
context_refs: [
  { work_id: "work_002", title: "Headlines", desc: "...", version: 1, current: false },
  {
    work_id: "work_007",
    title: "Headlines",
    desc: "5 headlines, #3 shortened to 8 words...",
    version: 2,
    current: true,
    replaces: "work_002"
  }
]
```

### Different Requests → Different Loading

```typescript
const CONTINUATION_LOADING_PATTERNS: Array<{
  pattern: string;
  loads: string;
  reason: string;
}> = [
  {
    pattern: "Make headline #3 shorter",
    loads: "work_002 only",
    reason: "Need to see headlines to identify and modify #3"
  },
  {
    pattern: "Add TikTok script",
    loads: "work_001 (strategy) maybe",
    reason: "Need tone/audience context, not existing outputs"
  },
  {
    pattern: "Make images match playful tone",
    loads: "work_004, work_005",
    reason: "Need to see current images to understand what to change"
  },
  {
    pattern: "Rewrite everything for Gen Z",
    loads: "work_001 (strategy)",
    reason: "Need current approach as baseline, will regenerate all"
  },
  {
    pattern: "Add more headlines like #2",
    loads: "work_002 only",
    reason: "Need to see what #2 looks like as reference"
  }
];
```

### Dependency Cascade on Modification

When modifying a work item, we need to check if any downstream items depend on it and may need re-running.

```typescript
/**
 * Result of cascade analysis
 */
interface CascadeAnalysisResult {
  needs_cascade: boolean;
  items_to_rerun: number[];
}

/**
 * Check if modifying a work item requires cascading updates to dependents.
 * Uses DatabaseClient for all database operations.
 *
 * @param db - DatabaseClient instance
 * @param job_id - The job ID
 * @param plan_id - The plan ID
 * @param modified_work_id - The work item that was modified
 * @param invokePlanningLLM - Function to invoke Planning Agent for decisions
 */
async function checkDependencyCascade(
  db: DatabaseClient,
  job_id: string,
  plan_id: string,
  modified_work_id: string,
  invokePlanningLLM: (input: CascadeDecisionInput) => Promise<CascadeAnalysisResult>
): Promise<ContinuationActionItem[]> {
  // Use DatabaseClient to get modified work item
  const modifiedWork = await db.getWorkItem(modified_work_id);
  if (!modifiedWork) {
    throw new Error(`Work item not found: ${modified_work_id}`);
  }

  // Use DatabaseClient to get plan
  const plan = await db.getPlan(plan_id);
  if (!plan) {
    throw new Error(`Plan not found: ${plan_id}`);
  }

  // Find items that depend on the modified action item
  const dependents = plan.action_items.filter(item =>
    item.depends_on.includes(modifiedWork.action_item_id)
  );

  if (dependents.length === 0) {
    return []; // No cascade needed
  }

  // Ask Planning Agent to decide if dependents need re-running
  const cascadeDecision = await invokePlanningLLM({
    task: "Determine cascade impact",
    modified_item: modifiedWork.action,
    modification_description: `Modified ${modifiedWork.action.item}`,
    dependents: dependents.map(d => ({
      id: d.id,
      item: d.item
    })),
    question: "Do any dependents need to be updated due to this change?"
  });

  if (cascadeDecision.needs_cascade) {
    return cascadeDecision.items_to_rerun.map(id => {
      const actionItem = plan.action_items.find(a => a.id === id);
      if (!actionItem) {
        throw new Error(`Action item not found: ${id}`);
      }
      return {
        ...actionItem,
        action_type: "RERUN_WITH_CONTEXT" as const,
        original_work_id: modified_work_id
      };
    });
  }

  return [];
}

/**
 * Input for cascade decision LLM call
 */
interface CascadeDecisionInput {
  task: string;
  modified_item: WorkItem["action"];
  modification_description: string;
  dependents: Array<{ id: number; item: string }>;
  question: string;
}
```

### Continuation Events

```typescript
type ContinuationEvent =
  | { type: "continuation:started"; job_id: string; user_message: string }
  | { type: "continuation:planning"; job_id: string }
  | { type: "continuation:work_created"; work_id: string; action_type: ContinuationActionType }
  | { type: "continuation:superseded"; original_work_id: string; new_work_id: string }
  | { type: "continuation:version_complete"; job_id: string; version: number };
```
