# Module: ORCHESTRATION

LangGraph state machine with 4 internal agents.

**This is an index file. See sub-modules for implementation details.**

---

## Sub-Modules

| Sub-Module | File | Owns |
|------------|------|------|
| **Discovery** | [discovery/TECH_DESIGN.md](./discovery/TECH_DESIGN.md) | Voyage AI embeddings, MongoDB vector search, agent reranking |
| **Graph** | [graph/TECH_DESIGN.md](./graph/TECH_DESIGN.md) | LangGraph setup, nodes, routing, agent selection algorithm, plan verification rules |
| **Work Lifecycle** | [work-lifecycle/TECH_DESIGN.md](./work-lifecycle/TECH_DESIGN.md) | 16 work item states, transitions, parallel execution, dynamic spawning, user continuation |
| **Integrations** | [integrations/TECH_DESIGN.md](./integrations/TECH_DESIGN.md) | Galileo verify, Payments, External Agents, Context passing, Recovery |

---

## Scope

**Owns:**
- Agent discovery via Voyage AI embeddings and MongoDB vector search
- LangGraph graph definition and state machine
- 4 internal agents: Main, Planning, Plan Verifier, Prompt
- Agent selection algorithm (quality, price, reliability scoring)
- Plan verification rules (completeness, dependencies, budget)
- Work item state transitions (16 states)
- Context management and lazy loading
- User continuation flow (MODIFY, REPLACE, RERUN)
- Dynamic TODO spawning
- Parallel execution coordination
- Retry logic with feedback
- Recovery and self-heal mechanisms
- Checkpointing to MongoDB

**Does NOT own:**
- HTTP endpoints (that's API)
- Database schema (that's DATA)
- Galileo API implementation (that's GALILEO)
- Payment execution implementation (that's PAYMENTS)
- External agent implementation (that's EXTERNAL_AGENTS)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ORCHESTRATION MODULE                                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  DISCOVERY                                                         ││
│  │  Voyage AI embed → MongoDB vector search → Voyage AI rerank             ││
│  │  Returns: ranked agent candidates for selection                         ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                              │                                               │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  GRAPH                                                             ││
│  │  LangGraph state machine with 4 internal agents                         ││
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                   ││
│  │  │  Main    │ │ Planning │ │ Verifier │ │  Prompt  │                   ││
│  │  │  Agent   │ │  Agent   │ │  (Gate)  │ │  Agent   │                   ││
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘                   ││
│  │  Planning Agent uses Discovery → applies selection algorithm           ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                              │                                               │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  WORK_LIFECYCLE                                                    ││
│  │  16-state machine: pending → ready → prompting → dispatched → ...      ││
│  │  + User continuation: MODIFY, REPLACE, RERUN                            ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                              │                                               │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  INTEGRATIONS                                                      ││
│  │  Calls to: Galileo, Payments, External Agents                           ││
│  │  + Context passing rules per agent type                                 ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Interface: Dependencies

| Module | What We Need | Interface |
|--------|--------------|-----------|
| **DATA** | All DB operations | `DatabaseClient` |
| **GALILEO** | Verification + Tracing | `GalileoClient.verify()`, `GalileoClient.trace()` |
| **PAYMENTS** | Payment execution | `PaymentClient.pay()` |
| **EXTERNAL_AGENTS** | Agent HTTP calls | `ExternalAgentClient.execute()` |

---

## Interface: Provides

### OrchestrationEngine

```typescript
interface OrchestrationEngine {
  // Start new job
  startJob(input: {
    user_id: string;
    prompt: string;
    budget: number;
  }): Promise<{ job_id: string }>;

  // Continue existing job
  continueJob(input: {
    job_id: string;
    prompt: string;
  }): Promise<{ version: number }>;

  // Resume from checkpoint (recovery)
  recoverJob(job_id: string): Promise<void>;

  // Get current state
  getJobState(job_id: string): Promise<JobState>;

  // Subscribe to events
  subscribe(job_id: string, callback: (event: OrchestrationEvent) => void): () => void;
}

interface JobState {
  job_id: string;
  status: "planning" | "plan_verification" | "executing" | "completed" | "failed";
  current_work_items: Array<{
    work_id: string;
    status: WorkItemStatus;
    action_item_id: number;
  }>;
  completed_work_ids: string[];
  reasoning_log: ReasoningEntry[];
}
```

---

## Events Emitted

Orchestration emits events for SSE streaming to frontend:

```typescript
type OrchestrationEvent =
  // Job lifecycle
  | { type: "job:started"; job_id: string }
  | { type: "job:planning"; job_id: string }
  | { type: "job:plan_verified"; job_id: string; plan_id: string }
  | { type: "job:executing"; job_id: string }
  | { type: "job:completed"; job_id: string; version: number }
  | { type: "job:failed"; job_id: string; reason: string }
  | { type: "job:continued"; job_id: string; version: number }

  // Work item lifecycle
  | { type: "work:created"; work_id: string; action_item_id: number; action: string }
  | { type: "work:status_changed"; work_id: string; status: WorkItemStatus }
  | { type: "work:prompt_generated"; work_id: string; template_id: string }
  | { type: "work:output_received"; work_id: string; title: string; description: string; content: any }
  | { type: "work:verified"; work_id: string; score: number; passed: boolean }
  | { type: "work:retry"; work_id: string; attempt: number; reason: string; issues: string[] }
  | { type: "work:payment_confirmed"; work_id: string; amount: number; tx_hash: string }
  | { type: "work:failed"; work_id: string; reason: string }

  // Dynamic spawning
  | { type: "todo:spawned"; parent_id: number; new_todos: ActionItem[] }

  // Reasoning (for UI display)
  | { type: "reasoning"; agent: string; step: string; thought: string; decision?: string };
```

---

## Work Item States (16)

```typescript
type WorkItemStatus =
  | "pending"        // Waiting for dependencies
  | "ready"          // Dependencies met, queued
  | "prompting"      // Prompt Agent generating prompt
  | "dispatched"     // Sent to external agent
  | "polling"        // Waiting for async response
  | "stale"          // Polling timeout
  | "received"       // Output received
  | "verifying"      // Galileo verification
  | "verified"       // Passed verification
  | "retry_pending"  // Will retry with feedback
  | "rejected"       // Failed verification
  | "reassigning"    // Finding new agent
  | "paying"         // Payment in progress
  | "payment_retry"  // Payment retry
  | "completed"      // Done (terminal)
  | "failed";        // Failed (terminal)
```

See [work-lifecycle/TECH_DESIGN.md](./work-lifecycle/TECH_DESIGN.md) for full state machine.

---

## Quick Reference

| Topic | Sub-Module |
|-------|------------|
| Voyage AI embeddings | [discovery/TECH_DESIGN.md](./discovery/TECH_DESIGN.md) |
| MongoDB vector search | [discovery/TECH_DESIGN.md](./discovery/TECH_DESIGN.md) |
| Agent reranking | [discovery/TECH_DESIGN.md](./discovery/TECH_DESIGN.md) |
| LangGraph graph definition | [graph/TECH_DESIGN.md](./graph/TECH_DESIGN.md) |
| Node definitions (4 agents) | [graph/TECH_DESIGN.md](./graph/TECH_DESIGN.md) |
| Galileo tracing wrapper | [graph/TECH_DESIGN.md](./graph/TECH_DESIGN.md) |
| Agent selection reasoning | [graph/TECH_DESIGN.md](./graph/TECH_DESIGN.md) |
| State machine (16 states) | [work-lifecycle/TECH_DESIGN.md](./work-lifecycle/TECH_DESIGN.md) |
| Parallel execution | [work-lifecycle/TECH_DESIGN.md](./work-lifecycle/TECH_DESIGN.md) |
| Dynamic TODO spawning | [work-lifecycle/TECH_DESIGN.md](./work-lifecycle/TECH_DESIGN.md) |
| Continuation action types | [work-lifecycle/TECH_DESIGN.md](./work-lifecycle/TECH_DESIGN.md) |
| Agent reassignment | [work-lifecycle/TECH_DESIGN.md](./work-lifecycle/TECH_DESIGN.md) |
| Galileo verify calls | [integrations/TECH_DESIGN.md](./integrations/TECH_DESIGN.md) |
| Payment execution | [integrations/TECH_DESIGN.md](./integrations/TECH_DESIGN.md) |
| External agent dispatch/poll | [integrations/TECH_DESIGN.md](./integrations/TECH_DESIGN.md) |
| Context lazy loading | [integrations/TECH_DESIGN.md](./integrations/TECH_DESIGN.md) |
| Recovery mechanisms | [integrations/TECH_DESIGN.md](./integrations/TECH_DESIGN.md) |
