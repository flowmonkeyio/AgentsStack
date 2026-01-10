# Project Structure

AgentStack platform - high-level architecture and configuration.

---

## Overview

AgentStack is an AI agent orchestration platform that:
- Accepts user prompts (e.g., "Create a marketing campaign")
- Plans and decomposes tasks using internal LLM agents
- Discovers and hires external agents from a marketplace
- Verifies output quality before payment
- Pays agents via x402 protocol (USDC on Base)

**Stack:** Next.js 14 + LangGraph + MongoDB Atlas + OpenRouter + Clerk + Coinbase CDP

---

## Directory Structure

```
agentstack/
├── app/           # Next.js 14 App Router (pages + API routes)
├── components/    # React components
├── lib/           # Shared libraries (db, orchestration, payments, etc.)
├── hooks/         # React hooks
├── types/         # TypeScript types
├── public/        # Static assets
├── docs/          # Documentation
└── scripts/       # Utility scripts
```

---

## NPM Dependencies

```json
{
  "dependencies": {
    "next": "14.x",
    "react": "18.x",
    "react-dom": "18.x",
    "@langchain/langgraph": "^0.2.x",
    "@langchain/langgraph-checkpoint-mongodb": "^0.1.x",
    "@langchain/core": "^0.3.x",
    "openai": "^4.x",
    "mongodb": "^6.x",
    "@clerk/nextjs": "^5.x",
    "@coinbase/cdp-sdk": "^1.x",
    "@coinbase/x402": "^0.x",
    "voyageai": "^0.x",
    "@rungalileo/observe": "^1.x",
    "zod": "^3.x",
    "uuid": "^9.x",
    "nanoid": "^5.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "@types/node": "^20.x",
    "@types/react": "^18.x",
    "@types/react-dom": "^18.x",
    "@types/uuid": "^9.x",
    "tailwindcss": "^3.x",
    "postcss": "^8.x",
    "autoprefixer": "^10.x",
    "tsx": "^4.x",
    "eslint": "^8.x",
    "eslint-config-next": "14.x"
  }
}
```

### Dependencies Summary

| Category | Packages |
|----------|----------|
| **Framework** | next, react, react-dom |
| **Orchestration** | @langchain/langgraph, @langchain/core |
| **LLM Gateway** | openai (for OpenRouter) |
| **Database** | mongodb |
| **Auth** | @clerk/nextjs |
| **Payments** | @coinbase/cdp-sdk, @coinbase/x402 |
| **AI Services** | voyageai, @rungalileo/observe |
| **Utilities** | zod, uuid, nanoid |

---

## Environment Variables

```bash
# MongoDB Atlas
MONGODB_URI=mongodb+srv://...

# OpenRouter (LLM Gateway)
OPENROUTER_API_KEY=sk-or-v1-...

# Voyage AI (Agent Discovery)
VOYAGE_API_KEY=pa-...

# Galileo AI (Verification)
GALILEO_API_KEY=
GALILEO_PROJECT_ID=
GALILEO_ENVIRONMENT=production

# Coinbase CDP (Payments)
CDP_API_KEY_ID=
CDP_API_KEY_SECRET=
CDP_WALLET_SECRET=
CDP_NETWORK=base-sepolia
PLATFORM_WALLET_ID=
PLATFORM_WALLET_ADDRESS=

# Clerk (Auth)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Fireworks AI (Demo agents)
FIREWORKS_API_KEY=

# LangSmith (Optional tracing)
# LANGCHAIN_TRACING_V2=true
# LANGCHAIN_API_KEY=ls_...
# LANGCHAIN_PROJECT=agentstack

# App
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Modules

7 modules with clear boundaries:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                        │
│                    Next.js UI + SSE consumption                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                 API                                          │
│               REST endpoints + SSE streaming + Webhooks                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ORCHESTRATION                                      │
│    LangGraph state machine with 4 internal agents + state management        │
│    ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                     │
│    │   Main   │ │ Planning │ │ Verifier │ │  Prompt  │                     │
│    │  Agent   │ │  Agent   │ │  (Gate)  │ │  Agent   │                     │
│    └──────────┘ └──────────┘ └──────────┘ └──────────┘                     │
└─────────────────────────────────────────────────────────────────────────────┘
          │              │              │              │
          ▼              ▼              ▼              ▼
┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐
│    DATA    │  │  GALILEO   │  │  PAYMENTS  │  │  EXTERNAL  │
│  MongoDB   │  │ Verify +   │  │ x402 + CDP │  │   AGENTS   │
│  7 colls   │  │ Tracing    │  │            │  │ Marketplace│
└────────────┘  └────────────┘  └────────────┘  └────────────┘
```

| Module | Owns |
|--------|------|
| **FRONTEND** | UI components, SSE consumption, state display |
| **API** | HTTP endpoints, SSE streaming, webhooks |
| **ORCHESTRATION** | LangGraph, 4 agents, state machine, discovery |
| **DATA** | MongoDB schema, 7 collections, indexes |
| **GALILEO** | Verification API, tracing, quality metrics |
| **PAYMENTS** | CDP wallets, x402 execution |
| **EXTERNAL_AGENTS** | Agent HTTP contract, marketplace |

---

## Database Collections

| Collection | Purpose |
|------------|---------|
| `users` | User accounts + wallets |
| `jobs` | Main task/conversation |
| `plans` | Planning output with action items |
| `work_items` | Execution records (16-state lifecycle) |
| `agents` | Marketplace registry with embeddings |
| `prompt_templates` | Template library |
| `transactions` | Payment audit log |

---

## LLM Configuration

Internal agents use OpenRouter:

```typescript
const MODEL_CONFIG = {
  main_agent: "anthropic/claude-sonnet-4",
  planning_agent: "anthropic/claude-sonnet-4",
  plan_verifier: "anthropic/claude-sonnet-4",
  prompt_agent: "anthropic/claude-3.5-haiku",
  summarization: "google/gemini-2.5-flash"
};
```

---

## Key Decisions

1. **LangGraph** - Orchestration with parallel execution, cycles, state persistence
2. **OpenRouter** - Unified LLM gateway (400+ models)
3. **Verify-before-pay** - Agents earn payment through quality work
4. **4 internal agents** - Main, Planning, Plan Verifier, Prompt
5. **16-state lifecycle** - Comprehensive work item state machine
6. **MongoDB** - Documents, vectors, checkpoints
7. **SSE** - Real-time updates to frontend

---

## Network

| Environment | Network | Currency |
|-------------|---------|----------|
| Development | base-sepolia | Test USDC |
| Production | base-mainnet | Real USDC |
