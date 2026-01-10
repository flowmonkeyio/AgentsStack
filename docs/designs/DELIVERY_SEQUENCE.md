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
| 3.3 | Graph | `orchestration/graph/TECH_DESIGN.md` | DATA, 3.1 (Discovery) |
| 3.4 | Integrations | `orchestration/integrations/TECH_DESIGN.md` | DATA, 3.2, GALILEO, PAYMENTS, EXTERNAL_AGENTS |

**Deliver Command:**
```bash
# In order
/deliver docs/designs/orchestration/discovery/TECH_DESIGN.md
/deliver docs/designs/orchestration/work-lifecycle/TECH_DESIGN.md
/deliver docs/designs/orchestration/graph/TECH_DESIGN.md
/deliver docs/designs/orchestration/integrations/TECH_DESIGN.md
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
       │              │   ┌───────────────────┘
       │              │   │
       │              ▼   ▼
       │         ┌─────────────┐
       │         │    GRAPH    │
       │         │orchestration/
       │         │   graph/    │
       │         │TECH_DESIGN  │
       │         └──────┬──────┘
       │                │
       │    PHASE 3.4   │
       └────────────────┼───────────────────────────┐
                        │                           │
                        ▼                           │
                  ┌─────────────┐                   │
                  │INTEGRATIONS │◄──────────────────┘
                  │orchestration/
                  │integrations/│
                  │TECH_DESIGN  │
                  └──────┬──────┘
                         │
                    PHASE 4.1
                         │
                         ▼
                  ┌─────────────┐
                  │     API     │
                  │    api/     │
                  │TECH_DESIGN  │
                  └──────┬──────┘
                         │
                    PHASE 4.2
                         │
                         ▼
                  ┌─────────────┐
                  │  FRONTEND   │
                  │  frontend/  │
                  │TECH_DESIGN  │
                  └─────────────┘
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
- [ ] `orchestration/graph/TECH_DESIGN.md`
- [ ] `orchestration/integrations/TECH_DESIGN.md`

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
- `lib/payments/types.ts`
- `lib/payments/index.ts`

### 2.3 External Agents
**Purpose:** HTTP contract for external agents
**Key Interface:** `ExternalAgentClient.execute()`
**Files Created:**
- `lib/external-agents/client.ts`
- `lib/external-agents/types.ts`
- `lib/external-agents/demo/` (demo agents)
- `lib/external-agents/index.ts`

### 3.1 Discovery
**Purpose:** Agent search via embeddings + vector search
**Key Interface:** `DiscoveryService.search()`
**External API:** Voyage AI
**Files Created:**
- `lib/orchestration/discovery/service.ts`
- `lib/orchestration/discovery/embeddings.ts`
- `lib/orchestration/discovery/rerank.ts`
- `lib/orchestration/discovery/types.ts`
- `lib/orchestration/discovery/index.ts`

### 3.2 Work Lifecycle
**Purpose:** 16-state machine for work items
**Key Interface:** `WorkLifecycle.transition()`
**Files Created:**
- `lib/orchestration/lifecycle/state-machine.ts`
- `lib/orchestration/lifecycle/transitions.ts`
- `lib/orchestration/lifecycle/parallel.ts`
- `lib/orchestration/lifecycle/types.ts`
- `lib/orchestration/lifecycle/index.ts`

### 3.3 Graph
**Purpose:** LangGraph state machine with 4 internal agents
**Key Interface:** `OrchestrationGraph.invoke()`
**External API:** OpenRouter, LangSmith
**Files Created:**
- `lib/orchestration/graph/graph.ts`
- `lib/orchestration/graph/nodes/main-agent.ts`
- `lib/orchestration/graph/nodes/planning-agent.ts`
- `lib/orchestration/graph/nodes/plan-verifier.ts`
- `lib/orchestration/graph/nodes/prompt-agent.ts`
- `lib/orchestration/graph/state.ts`
- `lib/orchestration/graph/types.ts`
- `lib/orchestration/graph/index.ts`

### 3.4 Integrations
**Purpose:** External module calls + recovery
**Key Interface:** `Integrations.verifyWork()`, `.payForWork()`, `.dispatchToAgent()`
**Files Created:**
- `lib/orchestration/integrations/galileo.ts`
- `lib/orchestration/integrations/payments.ts`
- `lib/orchestration/integrations/external-agents.ts`
- `lib/orchestration/integrations/context.ts`
- `lib/orchestration/integrations/recovery.ts`
- `lib/orchestration/integrations/types.ts`
- `lib/orchestration/integrations/index.ts`

### 4.1 API
**Purpose:** REST endpoints + SSE streaming
**Key Endpoints:** `/api/jobs`, `/api/agents`, `/api/webhooks`
**Files Created:**
- `app/api/jobs/route.ts`
- `app/api/jobs/[id]/route.ts`
- `app/api/jobs/[id]/continue/route.ts`
- `app/api/jobs/[id]/stream/route.ts`
- `app/api/agents/route.ts`
- `app/api/agents/discover/route.ts`
- `app/api/webhooks/work/[work_id]/route.ts`

### 4.2 Frontend
**Purpose:** Next.js UI with real-time updates
**Key Pages:** `/`, `/jobs/new`, `/jobs/[id]`, `/agents`
**Files Created:**
- `app/page.tsx`
- `app/jobs/new/page.tsx`
- `app/jobs/[id]/page.tsx`
- `app/agents/page.tsx`
- `components/job/*`
- `components/agent/*`
- `hooks/useJobStream.ts`

---

## Integration Points

| Consumer | Provider | Interface | When |
|----------|----------|-----------|------|
| Orchestration/Graph | Discovery | `DiscoveryService.search()` | Agent selection |
| Orchestration/Graph | Work Lifecycle | `WorkLifecycle.transition()` | State changes |
| Orchestration/Integrations | Galileo | `GalileoClient.verify()` | After output received |
| Orchestration/Integrations | Payments | `PaymentClient.pay()` | After verification pass |
| Orchestration/Integrations | External Agents | `ExternalAgentClient.execute()` | Work dispatch |
| API | Orchestration | `OrchestrationEngine.*` | All job operations |
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

## Quick Commands

```bash
# Phase 2 (parallel)
/deliver docs/designs/galileo/TECH_DESIGN.md
/deliver docs/designs/payments/TECH_DESIGN.md
/deliver docs/designs/external-agents/TECH_DESIGN.md

# Phase 3 (sequential)
/deliver docs/designs/orchestration/discovery/TECH_DESIGN.md
/deliver docs/designs/orchestration/work-lifecycle/TECH_DESIGN.md
/deliver docs/designs/orchestration/graph/TECH_DESIGN.md
/deliver docs/designs/orchestration/integrations/TECH_DESIGN.md

# Phase 4 (sequential)
/deliver docs/designs/api/TECH_DESIGN.md
/deliver docs/designs/frontend/TECH_DESIGN.md
```
