# Module Delivery Sequence

Complete delivery plan with dependencies, integration points, and exact paths.

---

## Directory Structure

```
docs/designs/
├── DELIVERY_SEQUENCE.md              # This file
├── core-data-structure/
│   ├── TECH_DESIGN.md                # DONE
│   └── IMPLEMENTATION_PROGRESS.md
├── galileo/
│   └── TECH_DESIGN.md
├── payments/
│   └── TECH_DESIGN.md
├── external-agents/
│   └── TECH_DESIGN.md
├── orchestration/
│   ├── TECH_DESIGN.md                # Index
│   ├── discovery/
│   │   └── TECH_DESIGN.md
│   ├── graph/
│   │   └── TECH_DESIGN.md
│   ├── work-lifecycle/
│   │   └── TECH_DESIGN.md
│   └── integrations/
│       └── TECH_DESIGN.md
├── api/
│   └── TECH_DESIGN.md
└── frontend/
    └── TECH_DESIGN.md
```

---

## Delivery Phases

### PHASE 1: Foundation [DONE]

| # | Module | Path | Status |
|---|--------|------|--------|
| 1.1 | Core Data Structure | `core-data-structure/TECH_DESIGN.md` | **DONE** |

**Delivered:**
- 7 MongoDB collections (User, Job, Plan, WorkItem, Agent, PromptTemplate, Transaction)
- DatabaseClient interface (31 methods)
- MongoDB implementation
- 16-state WorkItemStatus type

---

### PHASE 2: External Dependencies [PARALLEL]

These modules depend only on DATA. Deliver in parallel.

| # | Module | Path | Depends On |
|---|--------|------|------------|
| 2.1 | Galileo | `galileo/TECH_DESIGN.md` | DATA |
| 2.2 | Payments | `payments/TECH_DESIGN.md` | DATA |
| 2.3 | External Agents | `external-agents/TECH_DESIGN.md` | DATA |

**Deliver Command:**
```bash
/deliver docs/designs/galileo/TECH_DESIGN.md
/deliver docs/designs/payments/TECH_DESIGN.md
/deliver docs/designs/external-agents/TECH_DESIGN.md
```

---

### PHASE 3: Orchestration [SEQUENTIAL]

Deliver sub-modules in order. Each builds on the previous.

| # | Sub-Module | Path | Depends On |
|---|------------|------|------------|
| 3.1 | Discovery | `orchestration/discovery/TECH_DESIGN.md` | DATA |
| 3.2 | Work Lifecycle | `orchestration/work-lifecycle/TECH_DESIGN.md` | DATA |
| 3.3 | Integrations | `orchestration/integrations/TECH_DESIGN.md` | DATA, 3.2, GALILEO, PAYMENTS, EXTERNAL_AGENTS |
| 3.4 | Graph | `orchestration/graph/TECH_DESIGN.md` | DATA, 3.1, 3.2, 3.3 (Integrations) |

**Deliver Command:**
```bash
# In order
/deliver docs/designs/orchestration/discovery/TECH_DESIGN.md
/deliver docs/designs/orchestration/work-lifecycle/TECH_DESIGN.md
/deliver docs/designs/orchestration/integrations/TECH_DESIGN.md
/deliver docs/designs/orchestration/graph/TECH_DESIGN.md
```

---

### PHASE 4: Interface Layer [SEQUENTIAL]

| # | Module | Path | Depends On |
|---|--------|------|------------|
| 4.1 | API | `api/TECH_DESIGN.md` | DATA, ORCHESTRATION (all) |
| 4.2 | Frontend | `frontend/TECH_DESIGN.md` | API |

**Deliver Command:**
```bash
/deliver docs/designs/api/TECH_DESIGN.md
/deliver docs/designs/frontend/TECH_DESIGN.md
```

---

## Full Dependency Graph

```
                         PHASE 1 (DONE)
                    ┌─────────────────────┐
                    │  CORE DATA STRUCTURE │
                    │  core-data-structure/│
                    │  TECH_DESIGN.md      │
                    └──────────┬──────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
   PHASE 2.1              PHASE 2.2              PHASE 2.3
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   GALILEO   │       │  PAYMENTS   │       │  EXTERNAL   │
│  galileo/   │       │  payments/  │       │   AGENTS    │
│TECH_DESIGN  │       │TECH_DESIGN  │       │external-agents/
└──────┬──────┘       └──────┬──────┘       │TECH_DESIGN  │
       │                     │              └──────┬──────┘
       │                     │                     │
       │    PHASE 3.1        │    PHASE 3.2       │
       │   ┌─────────────────┴───┐ ┌─────────────┴───────┐
       │   │     DISCOVERY       │ │   WORK LIFECYCLE    │
       │   │  orchestration/     │ │  orchestration/     │
       │   │  discovery/         │ │  work-lifecycle/    │
       │   │  TECH_DESIGN.md     │ │  TECH_DESIGN.md     │
       │   └──────────┬──────────┘ └──────────┬──────────┘
       │              │                       │
       │              │    PHASE 3.3          │
       └──────────────┼───────────────────────┤
                      │                       │
                      ▼                       ▼
                  ┌─────────────────────────────┐
                  │        INTEGRATIONS         │
                  │  orchestration/integrations/│
                  │       TECH_DESIGN.md        │
                  └──────────────┬──────────────┘
                                 │
                            PHASE 3.4
                                 │
                                 ▼
                  ┌─────────────────────────────┐
                  │           GRAPH             │
                  │   orchestration/graph/      │
                  │       TECH_DESIGN.md        │
                  └──────────────┬──────────────┘
                                 │
                            PHASE 4.1
                                 │
                                 ▼
                  ┌─────────────────────────────┐
                  │            API              │
                  │           api/              │
                  │       TECH_DESIGN.md        │
                  └──────────────┬──────────────┘
                                 │
                            PHASE 4.2
                                 │
                                 ▼
                  ┌─────────────────────────────┐
                  │          FRONTEND           │
                  │         frontend/           │
                  │       TECH_DESIGN.md        │
                  └─────────────────────────────┘
```

---

## Delivery Checklist

### Phase 1: Foundation
- [x] `core-data-structure/TECH_DESIGN.md` - **DONE**

### Phase 2: External Dependencies (Parallel)
- [ ] `galileo/TECH_DESIGN.md`
- [ ] `payments/TECH_DESIGN.md`
- [ ] `external-agents/TECH_DESIGN.md`

### Phase 3: Orchestration (Sequential)
- [ ] `orchestration/discovery/TECH_DESIGN.md`
- [ ] `orchestration/work-lifecycle/TECH_DESIGN.md`
- [ ] `orchestration/integrations/TECH_DESIGN.md`
- [ ] `orchestration/graph/TECH_DESIGN.md`

### Phase 4: Interface Layer (Sequential)
- [ ] `api/TECH_DESIGN.md`
- [ ] `frontend/TECH_DESIGN.md`

---

## Module Details

### 2.1 Galileo
**Purpose:** Quality verification and observability
**Key Interface:** `GalileoClient.verify()`
**External API:** Galileo Observe
**Files Created:**
- `lib/galileo/client.ts`
- `lib/galileo/types.ts`
- `lib/galileo/index.ts`

### 2.2 Payments
**Purpose:** USDC payments via x402 protocol
**Key Interface:** `PaymentClient.pay()`
**External API:** Coinbase CDP, Base network
**Files Created:**
- `lib/payments/client.ts`
- `lib/payments/wallet.ts`
- `lib/payments/x402.ts`
- `lib/payments/lifecycle.ts`
- `lib/payments/retry.ts`
- `lib/payments/types.ts`
- `lib/payments/index.ts`

### 2.3 External Agents
**Purpose:** HTTP contract for external agents
**Key Interface:** `ExternalAgentClient.execute()`
**Files Created:**
- `lib/external-agents/types.ts`
- `lib/external-agents/client.ts`
- `lib/external-agents/index.ts`
- `lib/external-agents/demo/content-strategist.ts`
- `lib/external-agents/demo/copywriter.ts`
- `lib/external-agents/demo/image-gen.ts`
- `lib/external-agents/demo/image-gen-basic.ts`
- `lib/external-agents/demo/index.ts`
**Files Modified:**
- `lib/agents/executor.ts` (REPLACE with re-export)
- `lib/agents/index.ts` (UPDATE exports)

### 3.1 Discovery
**Purpose:** Agent search via embeddings + vector search
**Key Interface:** `DiscoveryService.discoverAgents()`
**External API:** Voyage AI
**Files Created:**
- `lib/orchestration/discovery/service.ts`
- `lib/orchestration/discovery/embeddings.ts`
- `lib/orchestration/discovery/rerank.ts`
- `lib/orchestration/discovery/vector-search.ts`
- `lib/orchestration/discovery/health.ts`
- `lib/orchestration/discovery/events.ts`
- `lib/orchestration/discovery/utils.ts`
- `lib/orchestration/discovery/types.ts`
- `lib/orchestration/discovery/index.ts`

### 3.2 Work Lifecycle
**Purpose:** 16-state machine for work items
**Key Interface:** `WorkLifecycle.transition()`
**Files Created:**
- `lib/orchestration/work-lifecycle/state-machine.ts`
- `lib/orchestration/work-lifecycle/transitions.ts`
- `lib/orchestration/work-lifecycle/parallel.ts`
- `lib/orchestration/work-lifecycle/types.ts`
- `lib/orchestration/work-lifecycle/index.ts`

### 3.3 Integrations
**Purpose:** External module calls + recovery
**Key Interface:** `verifyWork()`, `payForWork()`, `dispatchToAgent()`
**Files Created:**
- `lib/orchestration/integrations/galileo.ts`
- `lib/orchestration/integrations/payments.ts`
- `lib/orchestration/integrations/dispatch.ts`
- `lib/orchestration/integrations/context.ts`
- `lib/orchestration/integrations/recovery.ts`
- `lib/orchestration/integrations/events.ts`
- `lib/orchestration/integrations/security.ts`
- `lib/orchestration/integrations/types.ts`
- `lib/orchestration/integrations/index.ts`

### 3.4 Graph
**Purpose:** LangGraph state machine with 4 internal agents
**Key Interface:** `OrchestrationGraph.invoke()`
**External API:** OpenRouter, LangSmith
**Files Created:**
- `lib/orchestration/graph/graph.ts`
- `lib/orchestration/graph/nodes/planning-agent.ts`
- `lib/orchestration/graph/nodes/plan-verifier.ts`
- `lib/orchestration/graph/nodes/prompt-agent.ts`
- `lib/orchestration/graph/nodes/dispatch-poll.ts`
- `lib/orchestration/graph/state.ts`
- `lib/orchestration/graph/types.ts`
- `lib/orchestration/graph/utils.ts`
- `lib/orchestration/graph/index.ts`

### 4.1 API
**Purpose:** REST endpoints + SSE streaming
**Key Endpoints:** `/api/jobs`, `/api/webhooks`
**Files Created:**
- `app/api/jobs/route.ts`
- `app/api/jobs/[id]/route.ts`
- `app/api/jobs/[id]/continue/route.ts`
- `app/api/jobs/[id]/stream/route.ts`
- `app/api/jobs/[id]/work/[workId]/route.ts`
- `app/api/webhooks/work/[workId]/route.ts`
- `lib/api/index.ts`
- `lib/api/sse.ts`
- `lib/api/rate-limit.ts`
- `lib/api/validation.ts`
- `types/api.ts`

### 4.2 Frontend
**Purpose:** Next.js UI with real-time updates
**Key Pages:** `/`, `/jobs/new`, `/jobs/[job_id]`
**Files Created:**
- `app/layout.tsx`
- `app/page.tsx`
- `app/jobs/new/page.tsx`
- `app/jobs/[job_id]/page.tsx`
- `components/job/JobCreationForm.tsx`
- `components/job/JobStatusBadge.tsx`
- `components/job/WorkItemList.tsx`
- `components/job/WorkItemCard.tsx`
- `components/job/OutputRenderer.tsx`
- `components/job/ReasoningLog.tsx`
- `components/job/ContinuationInput.tsx`
- `components/job/BudgetDisplay.tsx`
- `components/job/PaymentTrail.tsx`
- `hooks/useJobStream.ts`
- `lib/api-client.ts`

---

## Integration Points

| Consumer | Provider | Interface | When |
|----------|----------|-----------|------|
| Orchestration/Graph | Discovery | `DiscoveryService.discoverAgents()` | Agent selection |
| Orchestration/Graph | Work Lifecycle | `WorkLifecycle.transition()` | State changes |
| Orchestration/Graph | Integrations | `verifyWork()`, `payForWork()`, `dispatchToAgent()` | Node execution |
| Orchestration/Integrations | Galileo | `GalileoClient.verify()` | After output received |
| Orchestration/Integrations | Payments | `PaymentClient.pay()` | After verification pass |
| Orchestration/Integrations | External Agents | `ExternalAgentClient.execute()` | Work dispatch |
| API | Orchestration | `OrchestrationEngine.startJob()`, `.continueJob()` | All job operations |
| Frontend | API | REST/SSE | All user interactions |

---

## Environment Variables

```env
# Phase 1: Core Data
MONGODB_URI=

# Phase 2: External Dependencies
GALILEO_API_KEY=
GALILEO_PROJECT_ID=
CDP_API_KEY_NAME=
CDP_API_KEY_PRIVATE_KEY=
BASE_RPC_URL=

# Phase 3: Orchestration
OPENROUTER_API_KEY=
VOYAGE_API_KEY=
LANGSMITH_API_KEY=        # Optional
LANGSMITH_PROJECT=        # Optional

# Phase 4: Interface
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
```

---

## Agent Spawning Plan

Split delivery into manageable chunks for context window. Each chunk spawns all agents in parallel via single message.

### Chunk 1: Phase 2 - External Dependencies (3 agents parallel)

All depend only on DATA (already done). Safe to parallelize.

| Agent | Module | Files | Est. Lines |
|-------|--------|-------|------------|
| Agent 2.1 | Galileo | 3 files | ~400 |
| Agent 2.2 | Payments | 7 files | ~800 |
| Agent 2.3 | External Agents | 8 files + 2 mods | ~600 |

```
Spawn: technical-implementor x 3 (parallel)
- Agent 2.1: Implement Galileo per docs/designs/galileo/TECH_DESIGN.md
- Agent 2.2: Implement Payments per docs/designs/payments/TECH_DESIGN.md
- Agent 2.3: Implement External Agents per docs/designs/external-agents/TECH_DESIGN.md
```

**Wait for completion before Chunk 2**

---

### Chunk 2: Phase 3.1-3.2 - Discovery + Work Lifecycle (2 agents parallel)

Both depend only on DATA. Safe to parallelize.

| Agent | Module | Files | Est. Lines |
|-------|--------|-------|------------|
| Agent 3.1 | Discovery | 9 files | ~700 |
| Agent 3.2 | Work Lifecycle | 5 files | ~600 |

```
Spawn: technical-implementor x 2 (parallel)
- Agent 3.1: Implement Discovery per docs/designs/orchestration/discovery/TECH_DESIGN.md
- Agent 3.2: Implement Work Lifecycle per docs/designs/orchestration/work-lifecycle/TECH_DESIGN.md
```

**Wait for completion before Chunk 3**

---

### Chunk 3: Phase 3.3 - Integrations (1 agent)

Depends on: Galileo, Payments, External Agents, Work Lifecycle (all done after Chunks 1-2)

| Agent | Module | Files | Est. Lines |
|-------|--------|-------|------------|
| Agent 3.3 | Integrations | 9 files | ~900 |

```
Spawn: technical-implementor x 1
- Agent 3.3: Implement Integrations per docs/designs/orchestration/integrations/TECH_DESIGN.md
```

**Wait for completion before Chunk 4**

---

### Chunk 4: Phase 3.4 - Graph (2 agents parallel)

Depends on: Discovery, Work Lifecycle, Integrations (all done after Chunk 3)
Split into: Core graph + Node implementations

| Agent | Scope | Files | Est. Lines |
|-------|-------|-------|------------|
| Agent 3.4a | Graph Core | state.ts, types.ts, utils.ts, graph.ts, index.ts | ~500 |
| Agent 3.4b | Graph Nodes | nodes/*.ts (4 files) | ~600 |

```
Spawn: technical-implementor x 2 (parallel)
- Agent 3.4a: Implement Graph core (state, types, graph definition) per TECH_DESIGN.md
- Agent 3.4b: Implement Graph nodes (planning-agent, plan-verifier, prompt-agent, dispatch-poll) per TECH_DESIGN.md
```

**Wait for completion before Chunk 5**

---

### Chunk 5: Phase 4.1 - API (2 agents parallel)

Depends on: Full Orchestration (done after Chunk 4)
Split into: Routes + Lib utilities

| Agent | Scope | Files | Est. Lines |
|-------|-------|-------|------------|
| Agent 4.1a | API Routes | app/api/**/*.ts (6 files) | ~500 |
| Agent 4.1b | API Lib | lib/api/*.ts, types/api.ts (5 files) | ~400 |

```
Spawn: technical-implementor x 2 (parallel)
- Agent 4.1a: Implement API routes per docs/designs/api/TECH_DESIGN.md
- Agent 4.1b: Implement API lib utilities (sse, rate-limit, validation, types) per TECH_DESIGN.md
```

**Wait for completion before Chunk 6**

---

### Chunk 6: Phase 4.2 - Frontend (3 agents parallel)

Depends on: API (done after Chunk 5)
Split into: Pages + Components + Hooks/Client

| Agent | Scope | Files | Est. Lines |
|-------|-------|-------|------------|
| Agent 4.2a | Pages | app/*.tsx, app/jobs/**/*.tsx (4 files) | ~400 |
| Agent 4.2b | Components | components/job/*.tsx (9 files) | ~800 |
| Agent 4.2c | Hooks/Client | hooks/*.ts, lib/api-client.ts (2 files) | ~300 |

```
Spawn: technical-implementor x 3 (parallel)
- Agent 4.2a: Implement Frontend pages per docs/designs/frontend/TECH_DESIGN.md
- Agent 4.2b: Implement Frontend components per TECH_DESIGN.md
- Agent 4.2c: Implement useJobStream hook and APIClient per TECH_DESIGN.md
```

---

### Summary

| Chunk | Phase | Agents | Parallel? | Depends On |
|-------|-------|--------|-----------|------------|
| 1 | 2.1, 2.2, 2.3 | 3 | Yes | DATA |
| 2 | 3.1, 3.2 | 2 | Yes | DATA |
| 3 | 3.3 | 1 | - | Chunks 1, 2 |
| 4 | 3.4 | 2 | Yes | Chunk 3 |
| 5 | 4.1 | 2 | Yes | Chunk 4 |
| 6 | 4.2 | 3 | Yes | Chunk 5 |

**Total: 6 chunks, 13 agent spawns**
**Max parallel: 3 agents per chunk**

---

## Quick Commands

```bash
# Phase 2 (parallel)
/deliver docs/designs/galileo/TECH_DESIGN.md
/deliver docs/designs/payments/TECH_DESIGN.md
/deliver docs/designs/external-agents/TECH_DESIGN.md

# Phase 3 (sequential)
/deliver docs/designs/orchestration/discovery/TECH_DESIGN.md
/deliver docs/designs/orchestration/work-lifecycle/TECH_DESIGN.md
/deliver docs/designs/orchestration/integrations/TECH_DESIGN.md
/deliver docs/designs/orchestration/graph/TECH_DESIGN.md

# Phase 4 (sequential)
/deliver docs/designs/api/TECH_DESIGN.md
/deliver docs/designs/frontend/TECH_DESIGN.md
```
