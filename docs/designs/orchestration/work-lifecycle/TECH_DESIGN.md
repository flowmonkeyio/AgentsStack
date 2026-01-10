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

## Transition Implementation

```typescript
interface TransitionResult {
  success: boolean;
  new_status?: WorkItemStatus;
  error?: string;
  event?: OrchestrationEvent;
}

class WorkLifecycle {
  async transition(
    work_id: string,
    trigger: string,
    payload?: any
  ): Promise<TransitionResult> {

    const work = await db.work_items.findOne({ work_id });
    if (!work) {
      return { success: false, error: "Work item not found" };
    }

    const transition = this.getTransition(work.status, trigger);
    if (!transition) {
      return { success: false, error: `Invalid transition: ${work.status} + ${trigger}` };
    }

    // Check guard
    if (transition.guard && !transition.guard(work, payload)) {
      return { success: false, error: `Guard failed: ${transition.guardName}` };
    }

    // Execute transition
    const updates = transition.execute(work, payload);

    await db.work_items.updateOne(
      { work_id },
      { $set: { status: transition.to, ...updates } }
    );

    // Create event
    const event: OrchestrationEvent = {
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

  private getTransition(from: WorkItemStatus, trigger: string): Transition | null {
    return TRANSITIONS.find(t => t.from === from && t.trigger === trigger) || null;
  }
}
```

---

## Transition Definitions

```typescript
interface Transition {
  from: WorkItemStatus;
  to: WorkItemStatus;
  trigger: string;
  guard?: (work: WorkItem, payload?: any) => boolean;
  guardName?: string;
  execute: (work: WorkItem, payload?: any) => Partial<WorkItem>;
}

const TRANSITIONS: Transition[] = [
  // pending → ready
  {
    from: "pending",
    to: "ready",
    trigger: "dependencies_met",
    execute: () => ({})
  },

  // ready → prompting
  {
    from: "ready",
    to: "prompting",
    trigger: "picked_up",
    execute: () => ({ picked_up_at: new Date() })
  },

  // prompting → dispatched
  {
    from: "prompting",
    to: "dispatched",
    trigger: "prompt_generated",
    guard: (_, payload) => payload?.generated_prompt?.length > 0,
    guardName: "has_prompt",
    execute: (_, payload) => ({
      generated_prompt: payload.generated_prompt,
      requirements: payload.requirements,
      dispatched_at: new Date()
    })
  },

  // dispatched → polling (async)
  {
    from: "dispatched",
    to: "polling",
    trigger: "async_response",
    execute: (_, payload) => ({
      external_ref: {
        reference_id: payload.reference_id,
        status_url: payload.status_url,
        polling: {
          started_at: new Date(),
          interval_ms: 3000,
          timeout_at: new Date(Date.now() + 600000)  // 10 min
        }
      }
    })
  },

  // dispatched → received (sync)
  {
    from: "dispatched",
    to: "received",
    trigger: "sync_response",
    execute: (_, payload) => ({
      output: payload.output,
      received_at: new Date()
    })
  },

  // polling → received
  {
    from: "polling",
    to: "received",
    trigger: "poll_completed",
    execute: (_, payload) => ({
      output: payload.output,
      received_at: new Date()
    })
  },

  // polling → stale
  {
    from: "polling",
    to: "stale",
    trigger: "poll_timeout",
    execute: (work) => ({
      stale_retry_count: (work.stale_retry_count || 0) + 1
    })
  },

  // stale → dispatched (retry)
  {
    from: "stale",
    to: "dispatched",
    trigger: "retry_dispatch",
    guard: (work) => (work.stale_retry_count || 0) < 3,
    guardName: "stale_retries_remaining",
    execute: () => ({ dispatched_at: new Date() })
  },

  // stale → failed
  {
    from: "stale",
    to: "failed",
    trigger: "max_stale_retries",
    guard: (work) => (work.stale_retry_count || 0) >= 3,
    guardName: "stale_retries_exhausted",
    execute: () => ({ failed_reason: "Max stale retries exceeded" })
  },

  // received → verifying
  {
    from: "received",
    to: "verifying",
    trigger: "start_verification",
    execute: () => ({})
  },

  // verifying → verified (pass)
  {
    from: "verifying",
    to: "verified",
    trigger: "verification_pass",
    guard: (_, payload) => payload.score >= 0.90,
    guardName: "score_passes",
    execute: (_, payload) => ({
      verification: {
        score: payload.score,
        passed: true,
        criteria_results: payload.criteria_results
      }
    })
  },

  // verifying → retry_pending
  {
    from: "verifying",
    to: "retry_pending",
    trigger: "verification_retry",
    guard: (work, payload) =>
      payload.score >= 0.60 &&
      payload.score < 0.90 &&
      work.attempt < 3,
    guardName: "retriable_score_and_attempts",
    execute: (_, payload) => ({
      verification: {
        score: payload.score,
        passed: false,
        criteria_results: payload.criteria_results
      },
      retry_context: {
        previous_output: payload.previous_output,
        verification_feedback: {
          score: payload.score,
          issues: payload.issues,
          suggestions: payload.suggestions
        }
      }
    })
  },

  // verifying → rejected
  {
    from: "verifying",
    to: "rejected",
    trigger: "verification_reject",
    guard: (work, payload) => payload.score < 0.60 || work.attempt >= 3,
    guardName: "low_score_or_max_attempts",
    execute: (_, payload) => ({
      verification: {
        score: payload.score,
        passed: false,
        criteria_results: payload.criteria_results
      },
      rejected_reason: payload.score < 0.60
        ? "Score below threshold"
        : "Max attempts exceeded"
    })
  },

  // retry_pending → prompting
  {
    from: "retry_pending",
    to: "prompting",
    trigger: "retry_initiated",
    execute: (work) => ({
      attempt: work.attempt + 1
    })
  },

  // rejected → reassigning
  {
    from: "rejected",
    to: "reassigning",
    trigger: "try_new_agent",
    guard: (_, payload) => payload.alternative_agents?.length > 0,
    guardName: "alternatives_available",
    execute: () => ({})
  },

  // rejected → failed (no alternatives)
  {
    from: "rejected",
    to: "failed",
    trigger: "no_alternatives",
    execute: () => ({ failed_reason: "No alternative agents available" })
  },

  // reassigning → prompting
  {
    from: "reassigning",
    to: "prompting",
    trigger: "agent_reassigned",
    execute: (_, payload) => ({
      agent: payload.new_agent,
      attempt: 1  // Reset attempts for new agent
    })
  },

  // verified → paying
  {
    from: "verified",
    to: "paying",
    trigger: "start_payment",
    execute: () => ({ payment: { status: "pending" } })
  },

  // paying → completed
  {
    from: "paying",
    to: "completed",
    trigger: "payment_confirmed",
    execute: (_, payload) => ({
      payment: {
        status: "confirmed",
        amount: payload.amount,
        tx_hash: payload.tx_hash,
        confirmed_at: new Date()
      }
    })
  },

  // paying → payment_retry
  {
    from: "paying",
    to: "payment_retry",
    trigger: "payment_failed",
    guard: (work) => (work.payment?.retry_count || 0) < 3,
    guardName: "payment_retries_remaining",
    execute: (work) => ({
      payment: {
        ...work.payment,
        status: "retry",
        retry_count: (work.payment?.retry_count || 0) + 1
      }
    })
  },

  // payment_retry → paying
  {
    from: "payment_retry",
    to: "paying",
    trigger: "retry_payment",
    execute: () => ({ payment: { status: "pending" } })
  },

  // payment_retry → failed
  {
    from: "payment_retry",
    to: "failed",
    trigger: "max_payment_retries",
    execute: () => ({ failed_reason: "Max payment retries exceeded" })
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

function checkDependencies(work_id: string): Promise<void> {
  const work = await db.work_items.findOne({ work_id });
  const actionItem = await getActionItemForWork(work);

  if (actionItem.depends_on.length === 0) {
    // No dependencies, ready immediately
    await lifecycle.transition(work_id, "dependencies_met");
    return;
  }

  // Check all dependencies
  const dependencyWorks = await db.work_items.find({
    job_id: work.job_id,
    action_item_id: { $in: actionItem.depends_on }
  });

  const allCompleted = dependencyWorks.every(w => w.status === "completed");

  if (allCompleted) {
    await lifecycle.transition(work_id, "dependencies_met");
  }
}
```

### Parallel Execution Coordinator

```typescript
async function executeParallel(workItems: WorkItem[]): Promise<void> {
  // Execute all items in parallel
  const promises = workItems.map(work =>
    executeWorkItem(work).catch(error => ({
      work_id: work.work_id,
      error: error.message
    }))
  );

  const results = await Promise.allSettled(promises);

  // Handle results
  for (const result of results) {
    if (result.status === "rejected") {
      // Handle failure
      await lifecycle.transition(result.reason.work_id, "execution_failed", {
        error: result.reason.message
      });
    }
  }
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
interface SpawnRequest {
  job_id: string;
  parent_todo_id: number;
  new_todos: Array<{
    item: string;
    priority: number;
    depends_on: number[];
    agent_id: string;
    template_id: string;
  }>;
}

async function spawnTodos(request: SpawnRequest): Promise<ActionItem[]> {
  const plan = await db.plans.findOne({ job_id: request.job_id });

  // Generate new IDs
  const maxId = Math.max(...plan.action_items.map(a => a.id));
  const newTodos = request.new_todos.map((todo, index) => ({
    id: maxId + index + 1,
    item: todo.item,
    priority: todo.priority,
    depends_on: todo.depends_on,
    status: "pending" as const,
    agent_id: todo.agent_id,
    template_id: todo.template_id,
    spawned_from: request.parent_todo_id
  }));

  // Add to plan
  await db.plans.updateOne(
    { job_id: request.job_id },
    { $push: { action_items: { $each: newTodos } } }
  );

  // Create work items
  for (const todo of newTodos) {
    await createWorkItem(request.job_id, todo);
  }

  // Emit event
  emitEvent({
    type: "todo:spawned",
    parent_id: request.parent_todo_id,
    new_todos: newTodos
  });

  return newTodos;
}
```

### Spawning Triggers

```typescript
const SPAWN_TRIGGERS = [
  // Output reveals items needing individual attention
  {
    condition: (output: any) =>
      output.items && output.items.length > 1 && output.needs_detail,
    spawn: (output: any) =>
      output.items.map(item => ({
        item: `Research ${item.name} in detail`,
        priority: 2
      }))
  },

  // Quality issues require verification
  {
    condition: (work: WorkItem) =>
      work.verification?.score >= 0.80 &&
      work.verification?.score < 0.90,
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
interface ContinuationWorkItem extends WorkItem {
  action_type: "CREATE_NEW" | "MODIFY_EXISTING" | "REPLACE_EXISTING" | "RERUN_WITH_CONTEXT";
  original_work_id?: string;  // For MODIFY/REPLACE/RERUN
}

async function createContinuationWorkItem(
  job_id: string,
  action_item: ActionItem,
  action_type: ContinuationWorkItem["action_type"]
): Promise<WorkItem> {
  const work: Partial<ContinuationWorkItem> = {
    work_id: generateWorkId(),
    job_id,
    action_item_id: action_item.id,
    action_type,
    attempt: 1,
    created_at: new Date()
  };

  switch (action_type) {
    case "CREATE_NEW":
      work.status = "pending";
      break;

    case "MODIFY_EXISTING":
      // Skip to prompting with previous output loaded
      work.status = "prompting";
      work.original_work_id = action_item.original_work_id;
      work.context_loaded = await loadFullContent(action_item.original_work_id);
      break;

    case "REPLACE_EXISTING":
      work.status = "pending";
      work.original_work_id = action_item.original_work_id;
      // Mark original as superseded
      await db.work_items.updateOne(
        { work_id: action_item.original_work_id },
        { $set: { superseded_by: work.work_id } }
      );
      break;

    case "RERUN_WITH_CONTEXT":
      work.status = "pending";
      work.original_work_id = action_item.original_work_id;
      // Context refs already updated by Planning Agent
      break;
  }

  await db.work_items.insertOne(work);
  return work as WorkItem;
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
interface WorkLifecycle {
  // State transitions
  transition(work_id: string, trigger: string, payload?: any): Promise<TransitionResult>;

  // Queries
  getActionable(job_id: string): Promise<WorkItem[]>;
  canRetry(work_id: string, type: RetryType): Promise<boolean>;

  // Dynamic spawning
  spawnTodos(request: SpawnRequest): Promise<ActionItem[]>;

  // Dependency checking
  checkDependencies(work_id: string): Promise<void>;
  onWorkCompleted(work_id: string): Promise<void>;  // Checks dependents
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
  current_value?: any;            // Current value being modified
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

```typescript
async function createContinuationWorkItem(
  job_id: string,
  action_item: ContinuationActionItem
): Promise<WorkItem> {
  const work: Partial<WorkItem> = {
    work_id: generateWorkId(),
    job_id,
    action_item_id: action_item.id,
    action_type: action_item.action_type,
    attempt: 1,
    created_at: new Date()
  };

  switch (action_item.action_type) {
    case "CREATE_NEW":
      // Normal flow - start from pending
      work.status = "pending";
      break;

    case "MODIFY_EXISTING":
      // Skip to prompting - we already have the content
      work.status = "prompting";
      work.original_work_id = action_item.original_work_id;
      work.modification_context = {
        specific_item: action_item.specific_item,
        current_value: action_item.current_value
      };
      break;

    case "REPLACE_EXISTING":
      // Start fresh but mark original as superseded
      work.status = "pending";
      work.original_work_id = action_item.original_work_id;
      await markSuperseded(action_item.original_work_id, work.work_id);
      break;

    case "RERUN_WITH_CONTEXT":
      // Start fresh with updated context
      work.status = "pending";
      work.original_work_id = action_item.original_work_id;
      // Context refs already updated by Planning Agent
      break;
  }

  await db.work_items.insertOne(work);
  emitEvent({ type: "work:created", work_id: work.work_id, action_item_id: action_item.id });

  return work as WorkItem;
}

async function markSuperseded(
  original_work_id: string,
  new_work_id: string
): Promise<void> {
  await db.work_items.updateOne(
    { work_id: original_work_id },
    {
      $set: {
        superseded_by: new_work_id,
        superseded_at: new Date()
      }
    }
  );
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

```typescript
// When modifying an item, check if anything depends on it

async function checkDependencyCascade(
  job_id: string,
  modified_work_id: string
): Promise<ActionItem[]> {
  const modifiedWork = await db.work_items.findOne({ work_id: modified_work_id });
  const plan = await db.plans.findOne({ job_id });

  // Find items that depended on the modified action item
  const dependents = plan.action_items.filter(item =>
    item.depends_on.includes(modifiedWork.action_item_id)
  );

  if (dependents.length === 0) {
    return [];  // No cascade needed
  }

  // Planning Agent decides if dependents need re-running
  const cascadeDecision = await invokePlanningLLM({
    task: "Determine cascade impact",
    modified_item: modifiedWork.action,
    modification: "headline #3 shortened",
    dependents: dependents.map(d => d.item),
    question: "Do any dependents need to be updated due to this change?"
  });

  if (cascadeDecision.needs_cascade) {
    return cascadeDecision.items_to_rerun.map(id => ({
      ...plan.action_items.find(a => a.id === id),
      action_type: "RERUN_WITH_CONTEXT"
    }));
  }

  return [];
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
