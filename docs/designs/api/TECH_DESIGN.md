# Module: API

REST endpoints, SSE streaming, webhooks.

---

## Scope

**Owns:**
- REST API endpoints
- SSE (Server-Sent Events) streaming
- Webhook handlers for external agent callbacks
- Request validation
- Authentication middleware
- Error handling and responses

**Does NOT own:**
- Business logic (that's ORCHESTRATION)
- Database operations (that's DATA)
- UI rendering (that's FRONTEND)

---

## Directory Structure (Authoritative)

This section defines the exact file structure for implementation. **This design is the source of truth** - existing scaffolded code that differs must be replaced.

```
app/
  api/
    jobs/
      route.ts                          # POST /api/jobs (create), GET /api/jobs (list)
      [id]/
        route.ts                        # GET /api/jobs/:id
        continue/
          route.ts                      # POST /api/jobs/:id/continue
        stream/
          route.ts                      # GET /api/jobs/:id/stream (SSE)
        work/
          [workId]/
            route.ts                    # GET /api/jobs/:id/work/:workId
    webhooks/
      work/
        [workId]/
          route.ts                      # POST /api/webhooks/work/:workId

lib/
  api/
    index.ts                            # Re-exports all API utilities
    sse.ts                              # SSE stream utilities (UPDATE existing)
    rate-limit.ts                       # Rate limiting middleware (NEW)
    validation.ts                       # Request validation utilities (NEW)

types/
  api.ts                                # API-specific types (NEW)
```

### Files Impact Analysis

#### New Files
| File | Purpose |
|------|---------|
| `app/api/jobs/[id]/continue/route.ts` | Handle job continuation with user feedback |
| `app/api/jobs/[id]/work/[workId]/route.ts` | Lazy-load full work item content |
| `app/api/webhooks/work/[workId]/route.ts` | External agent callback endpoint |
| `lib/api/rate-limit.ts` | Rate limiting implementation |
| `lib/api/validation.ts` | Request validation (Zod schemas) |
| `types/api.ts` | API request/response types |

#### Modified Files (REPLACE content)
| File | Changes Required |
|------|------------------|
| `app/api/jobs/route.ts` | Replace to use `CreateJobRequest`/`CreateJobResponse`, trigger OrchestrationEngine |
| `app/api/jobs/[id]/route.ts` | Replace: use string IDs (not ObjectId), return `GetJobResponse` format |
| `app/api/jobs/[id]/stream/route.ts` | Replace: use design event types, integrate OrchestrationEngine.subscribe() |
| `lib/api/sse.ts` | Update `SSEEventType` to match design specification |

#### Note on URL Parameters
- Design uses `:id` and `:workId` for readability
- Next.js App Router uses `[id]` and `[workId]` folder naming
- URL params are accessed via `params.id` and `params.workId`

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTP
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API MODULE                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  REST Endpoints │  │  SSE Streaming  │  │    Webhooks     │             │
│  │                 │  │                 │  │                 │             │
│  │  POST /jobs     │  │ GET /jobs/:id   │  │ POST /webhooks  │             │
│  │  GET /jobs/:id  │  │     /stream     │  │   /work/:id     │             │
│  │  POST /jobs/:id │  │                 │  │                 │             │
│  │      /continue  │  │                 │  │                 │             │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘             │
│           │                    │                    │                       │
│           └────────────────────┼────────────────────┘                       │
│                                │                                            │
│                                ▼                                            │
│                    ┌─────────────────────┐                                  │
│                    │   ORCHESTRATION     │                                  │
│                    │      MODULE         │                                  │
│                    └─────────────────────┘                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## REST Endpoints

### POST /api/jobs

Create a new job.

**Request:**
```typescript
interface CreateJobRequest {
  prompt: string;
  budget: number;
  context?: {
    product?: string;
    users?: string;
    [key: string]: string | undefined;
  };
}
```

**Response:**
```typescript
interface CreateJobResponse {
  job_id: string;
  status: "planning";
  stream_url: string;  // SSE endpoint
}
```

**Example:**
```bash
POST /api/jobs
Content-Type: application/json
Authorization: Bearer <token>

{
  "prompt": "Create a social media marketing campaign for FocusFlow",
  "budget": 0.50,
  "context": {
    "product": "AI productivity app",
    "users": "busy professionals"
  }
}

# Response
{
  "job_id": "job_abc123",
  "status": "planning",
  "stream_url": "/api/jobs/job_abc123/stream"
}
```

---

### GET /api/jobs/:job_id

Get job details and current state.

**Response:**
```typescript
interface GetJobResponse {
  job_id: string;
  status: "planning" | "plan_verification" | "executing" | "completed" | "failed";
  prompt: string;
  budget: {
    total: number;
    allocated: number;
    spent: number;
    remaining: number;
  };
  plan_version: number;
  context_summary: string;

  // Current plan action items
  action_items: Array<{
    id: number;
    item: string;
    priority: number;
    depends_on: number[];
    status: "pending" | "in_progress" | "completed" | "failed";
    agent_id: string | null;
    template_id: string;
  }>;

  // Current work items
  work_items: Array<{
    work_id: string;
    action_item_id: number;
    status: WorkItemStatus;
    action: string;
    output?: {
      title: string;
      description: string;
      content: unknown;  // Lazy-loaded via GET /api/jobs/:job_id/work/:work_id
    };
    verification?: {
      score: number;
      passed: boolean;
    };
  }>;

  // Version history
  versions: Array<{
    version: number;
    completed_at: string;
    work_ids: string[];
  }>;

  // Reasoning log (latest N entries)
  reasoning_log: ReasoningEntry[];
}
```

---

### GET /api/jobs/:job_id/work/:work_id

Get full output content for a specific work item (lazy loading).

**Response:**
```typescript
interface GetWorkItemResponse {
  work_id: string;
  action_item_id: number;
  status: WorkItemStatus;
  action: {
    item: string;
    deliverable_id: string;
    requirements: string[];
  };
  output: {
    title: string;
    description: string;
    content: unknown;  // Full content - type depends on agent output format
  } | null;
  verification: {
    score: number;
    passed: boolean;
    criteria_results: Array<{
      criterion: string;
      passed: boolean;
    }>;
  } | null;
  payment: {
    status: string;
    amount: number;
    tx_hash: string | null;
  } | null;
}
```

---

### POST /api/jobs/:job_id/continue

Continue a job with user feedback.

**Request:**
```typescript
interface ContinueJobRequest {
  prompt: string;  // User's continuation request
}
```

**Response:**
```typescript
interface ContinueJobResponse {
  job_id: string;
  version: number;  // New version number
  status: "planning";
  stream_url: string;
}
```

**Example:**
```bash
POST /api/jobs/job_abc123/continue
Content-Type: application/json
Authorization: Bearer <token>

{
  "prompt": "Make it more playful and add a TikTok script"
}

# Response
{
  "job_id": "job_abc123",
  "version": 2,
  "status": "planning",
  "stream_url": "/api/jobs/job_abc123/stream"
}
```

---

### GET /api/jobs/:job_id/stream

SSE endpoint for real-time updates.

**Headers:**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Event Format:**
```
event: <event_type>
data: <json_payload>

```

**Event Types:**

```typescript
// Job lifecycle
{ event: "job:started", data: { job_id: string } }
{ event: "job:planning", data: { job_id: string } }
{ event: "job:plan_verified", data: { job_id: string, plan_id: string } }
{ event: "job:executing", data: { job_id: string } }
{ event: "job:completed", data: { job_id: string, version: number } }
{ event: "job:failed", data: { job_id: string, reason: string } }
{ event: "job:continued", data: { job_id: string, version: number } }

// Work item lifecycle
{ event: "work:created", data: { work_id: string, action_item_id: number, action: string } }
{ event: "work:status_changed", data: { work_id: string, status: WorkItemStatus } }
{ event: "work:prompt_generated", data: { work_id: string, template_id: string } }
{ event: "work:output_received", data: { work_id: string, title: string, description: string, content: unknown } }
{ event: "work:verified", data: { work_id: string, score: number, passed: boolean } }
{ event: "work:retry", data: { work_id: string, attempt: number, reason: string, issues: string[] } }
{ event: "work:payment_confirmed", data: { work_id: string, amount: number, tx_hash: string } }
{ event: "work:failed", data: { work_id: string, reason: string } }

// Dynamic spawning
{ event: "todo:spawned", data: { parent_id: number, new_todos: ActionItem[] } }

// Reasoning (for UI display)
{ event: "reasoning", data: { agent: string, step: string, thought: string, decision?: string } }

// Heartbeat (every 30 seconds)
{ event: "heartbeat", data: { timestamp: string } }
```

**Example SSE Stream:**
```
event: job:started
data: {"job_id":"job_abc123"}

event: job:planning
data: {"job_id":"job_abc123"}

event: reasoning
data: {"agent":"planning","step":"analyze_prompt","thought":"User wants a marketing campaign..."}

event: job:plan_verified
data: {"job_id":"job_abc123","plan_id":"plan_001"}

event: work:created
data: {"work_id":"work_001","action_item_id":1,"action":"Create campaign strategy"}

event: work:status_changed
data: {"work_id":"work_001","status":"prompting"}

event: work:status_changed
data: {"work_id":"work_001","status":"dispatched"}

event: work:output_received
data: {"work_id":"work_001","title":"Campaign Strategy","description":"Target audience...","content":{...}}

event: work:verified
data: {"work_id":"work_001","score":0.94,"passed":true}

event: work:payment_confirmed
data: {"work_id":"work_001","amount":0.05,"tx_hash":"0x..."}

event: work:status_changed
data: {"work_id":"work_001","status":"completed"}

event: heartbeat
data: {"timestamp":"2024-01-10T15:30:00Z"}
```

---

## Webhook Endpoints

### POST /api/webhooks/work/:work_id

Callback endpoint for external agents to report completion.

**Request:**
```typescript
interface AgentCallbackRequest {
  reference_id: string;  // Our reference ID
  status: "completed" | "failed" | "progress";
  output?: unknown;      // If completed - structure depends on agent type
  error?: string;        // If failed
  progress?: number;     // If progress (0-1)
  message?: string;      // Optional status message
}
```

**Response:**
```typescript
interface AgentCallbackResponse {
  received: boolean;
  work_id: string;
}
```

**Security:**
- Validate `reference_id` matches stored value
- Optional: HMAC signature verification

**Example:**
```bash
POST /api/webhooks/work/work_001
Content-Type: application/json

{
  "reference_id": "agent_ref_abc123",
  "status": "completed",
  "output": {
    "title": "Campaign Strategy",
    "content": { ... }
  }
}

# Response
{
  "received": true,
  "work_id": "work_001"
}
```

---

## Authentication

All endpoints (except webhooks) require authentication.

**Header:**
```
Authorization: Bearer <jwt_token>
```

**Middleware:**
```typescript
interface AuthenticatedRequest extends Request {
  user: {
    user_id: string;
    email: string;
  };
}

async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: "Missing authorization token" });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid token" });
  }
}
```

---

## Error Responses

**Format:**
```typescript
interface ErrorResponse {
  error: string;
  code: string;
  details?: Record<string, unknown>;
}
```

**HTTP Status Codes:**

| Code | Meaning | Example |
|------|---------|---------|
| 400 | Bad Request | Invalid input |
| 401 | Unauthorized | Missing/invalid token |
| 403 | Forbidden | Not owner of job |
| 404 | Not Found | Job doesn't exist |
| 409 | Conflict | Job already completed |
| 422 | Unprocessable | Budget too low |
| 500 | Internal Error | System failure |

**Examples:**
```json
// 400 Bad Request
{
  "error": "Invalid budget",
  "code": "INVALID_INPUT",
  "details": { "field": "budget", "message": "Must be positive number" }
}

// 404 Not Found
{
  "error": "Job not found",
  "code": "NOT_FOUND"
}

// 409 Conflict
{
  "error": "Job already completed",
  "code": "JOB_COMPLETED",
  "details": { "status": "completed", "version": 1 }
}
```

---

## Interface: Dependencies

| Module | What We Need | Interface |
|--------|--------------|-----------|
| **ORCHESTRATION** | Start/continue jobs, get state | `OrchestrationEngine` |
| **DATA** | Read job/work data for GET endpoints | `DatabaseClient` (read-only) |

---

## Interface: Provides

### REST Client (for FRONTEND)

```typescript
interface APIClient {
  // Jobs
  createJob(input: CreateJobRequest): Promise<CreateJobResponse>;
  getJob(job_id: string): Promise<GetJobResponse>;
  continueJob(job_id: string, prompt: string): Promise<ContinueJobResponse>;

  // SSE
  streamJob(job_id: string): EventSource;
}
```

### Webhook Handler (for EXTERNAL_AGENTS)

```typescript
interface WebhookEndpoint {
  // POST /api/webhooks/work/:work_id
  // External agents call this to report completion
  url: string;  // "https://platform.com/api/webhooks/work/{work_id}"
}
```

---

## Request Validation

### CreateJobRequest

```typescript
const createJobSchema = {
  prompt: {
    type: "string",
    required: true,
    minLength: 10,
    maxLength: 5000
  },
  budget: {
    type: "number",
    required: true,
    min: 0.01,
    max: 100.00
  },
  context: {
    type: "object",
    required: false
  }
};
```

### ContinueJobRequest

```typescript
const continueJobSchema = {
  prompt: {
    type: "string",
    required: true,
    minLength: 1,
    maxLength: 2000
  }
};
```

---

## Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| POST /api/jobs | 10 | per minute |
| POST /api/jobs/:id/continue | 20 | per minute |
| GET /api/jobs/:id | 60 | per minute |
| GET /api/jobs/:id/stream | 5 connections | per user |

### Rate Limiting Implementation

Rate limiting is implemented using a sliding window counter stored in memory (with Redis upgrade path for production).

**Middleware (`lib/api/rate-limit.ts`):**
```typescript
interface RateLimitConfig {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Max requests per window
  keyGenerator: (req: NextRequest, userId: string) => string;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

// In-memory store (swap for Redis in production)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function createRateLimiter(config: RateLimitConfig) {
  return async function rateLimit(
    req: NextRequest,
    userId: string
  ): Promise<RateLimitResult> {
    const key = config.keyGenerator(req, userId);
    const now = Date.now();
    const entry = rateLimitStore.get(key);

    if (!entry || now > entry.resetAt) {
      // New window
      rateLimitStore.set(key, {
        count: 1,
        resetAt: now + config.windowMs,
      });
      return {
        allowed: true,
        remaining: config.maxRequests - 1,
        resetAt: new Date(now + config.windowMs),
      };
    }

    if (entry.count >= config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(entry.resetAt),
      };
    }

    entry.count++;
    return {
      allowed: true,
      remaining: config.maxRequests - entry.count,
      resetAt: new Date(entry.resetAt),
    };
  };
}

// Pre-configured limiters for each endpoint
export const rateLimiters = {
  createJob: createRateLimiter({
    windowMs: 60000,
    maxRequests: 10,
    keyGenerator: (_, userId) => `create_job:${userId}`,
  }),
  continueJob: createRateLimiter({
    windowMs: 60000,
    maxRequests: 20,
    keyGenerator: (_, userId) => `continue_job:${userId}`,
  }),
  getJob: createRateLimiter({
    windowMs: 60000,
    maxRequests: 60,
    keyGenerator: (_, userId) => `get_job:${userId}`,
  }),
};

// SSE connection limiter (different pattern - tracks active connections)
const activeConnections = new Map<string, number>();

export function checkSSEConnectionLimit(userId: string): boolean {
  const current = activeConnections.get(userId) || 0;
  return current < 5;
}

export function trackSSEConnection(userId: string): () => void {
  const current = activeConnections.get(userId) || 0;
  activeConnections.set(userId, current + 1);

  // Return cleanup function
  return () => {
    const count = activeConnections.get(userId) || 1;
    if (count <= 1) {
      activeConnections.delete(userId);
    } else {
      activeConnections.set(userId, count - 1);
    }
  };
}
```

**Usage in Route Handlers:**
```typescript
// In POST /api/jobs
const result = await rateLimiters.createJob(request, user.user_id);
if (!result.allowed) {
  return NextResponse.json(
    {
      error: "Rate limit exceeded",
      code: "RATE_LIMIT_EXCEEDED",
      details: {
        retryAfter: Math.ceil((result.resetAt.getTime() - Date.now()) / 1000),
      },
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil((result.resetAt.getTime() - Date.now()) / 1000)),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": result.resetAt.toISOString(),
      },
    }
  );
}
```

---

## SSE Implementation Notes

**Server-side (Next.js App Router):**
```typescript
// app/api/jobs/[id]/stream/route.ts
import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createSSEStream, createSSEHeaders } from "@/lib/api";
import { getDatabaseClient } from "@/lib/db";
import { OrchestrationEngine } from "@/lib/orchestration";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Authenticate
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const { id: job_id } = await params;

  // Verify user owns job
  const db = getDatabaseClient();
  const user = await db.getUser(clerkId);
  if (!user) {
    return new Response(JSON.stringify({ error: "User not found", code: "NOT_FOUND" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }

  const job = await db.getJob(job_id);
  if (!job || job.user_id !== user.user_id) {
    return new Response(JSON.stringify({ error: "Job not found", code: "NOT_FOUND" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Create SSE stream using lib/api utilities
  const { readable, send, close } = createSSEStream();

  // Subscribe to orchestration events
  const orchestration = OrchestrationEngine.getInstance();
  const unsubscribe = orchestration.subscribe(job_id, (event) => {
    send({
      type: event.type,
      data: event.data,
      timestamp: new Date().toISOString(),
    });
  });

  // Heartbeat every 30 seconds
  const heartbeat = setInterval(() => {
    send({
      type: "heartbeat",
      data: { timestamp: new Date().toISOString() },
      timestamp: new Date().toISOString(),
    });
  }, 30000);

  // Cleanup on disconnect (handled by AbortSignal)
  request.signal.addEventListener("abort", () => {
    clearInterval(heartbeat);
    unsubscribe();
    close();
  });

  return new Response(readable, {
    headers: createSSEHeaders(),
  });
}
```

**Client-side:**
```typescript
const eventSource = new EventSource(`/api/jobs/${jobId}/stream`);

eventSource.addEventListener('work:output_received', (e) => {
  const data = JSON.parse(e.data);
  updateWorkItem(data.work_id, data.output);
});

eventSource.addEventListener('job:completed', (e) => {
  const data = JSON.parse(e.data);
  showCompletionMessage(data.version);
  eventSource.close();
});

eventSource.onerror = (e) => {
  console.error('SSE error:', e);
  // Reconnect logic
};
```

### Updated SSE Types (`lib/api/sse.ts`)

The existing `lib/api/sse.ts` must be updated to support all design event types:

```typescript
// lib/api/sse.ts - UPDATED EVENT TYPES

/**
 * SSE Event Types matching the API design specification
 */
export type SSEEventType =
  // Job lifecycle
  | "job:started"
  | "job:planning"
  | "job:plan_verified"
  | "job:executing"
  | "job:completed"
  | "job:failed"
  | "job:continued"
  // Work item lifecycle
  | "work:created"
  | "work:status_changed"
  | "work:prompt_generated"
  | "work:output_received"
  | "work:verified"
  | "work:retry"
  | "work:payment_confirmed"
  | "work:failed"
  // Dynamic spawning
  | "todo:spawned"
  // Reasoning (for UI display)
  | "reasoning"
  // Connection management
  | "heartbeat";

export interface SSEEvent {
  type: SSEEventType;
  data: unknown;
  timestamp: string;
}

// ... rest of sse.ts utilities remain unchanged
```

---

## Route Handler Implementations

### POST /api/jobs (App Router)

```typescript
// app/api/jobs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getDatabaseClient } from "@/lib/db";
import { OrchestrationEngine } from "@/lib/orchestration";
import { rateLimiters } from "@/lib/api/rate-limit";
import { validateCreateJobRequest } from "@/lib/api/validation";
import type { CreateJobRequest, CreateJobResponse, ErrorResponse } from "@/types/api";

export async function POST(request: NextRequest): Promise<NextResponse<CreateJobResponse | ErrorResponse>> {
  try {
    // Authenticate
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    // Get user
    const db = getDatabaseClient();
    const user = await db.getUser(clerkId);
    if (!user) {
      return NextResponse.json(
        { error: "User not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Rate limit
    const rateResult = await rateLimiters.createJob(request, user.user_id);
    if (!rateResult.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          code: "RATE_LIMIT_EXCEEDED",
          details: { retryAfter: Math.ceil((rateResult.resetAt.getTime() - Date.now()) / 1000) },
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((rateResult.resetAt.getTime() - Date.now()) / 1000)),
          },
        }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validation = validateCreateJobRequest(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Invalid input",
          code: "INVALID_INPUT",
          details: validation.errors,
        },
        { status: 400 }
      );
    }

    const input: CreateJobRequest = validation.data;

    // Create job via OrchestrationEngine (NOT direct DB call)
    const orchestration = OrchestrationEngine.getInstance();
    const job = await orchestration.startJob({
      user_id: user.user_id,
      prompt: input.prompt,
      budget: input.budget,
      context: input.context,
    });

    // Return response per design spec
    const response: CreateJobResponse = {
      job_id: job.job_id,
      status: "planning",
      stream_url: `/api/jobs/${job.job_id}/stream`,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("Failed to create job:", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
```

### POST /api/webhooks/work/:workId (App Router)

```typescript
// app/api/webhooks/work/[workId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDatabaseClient } from "@/lib/db";
import { OrchestrationEngine } from "@/lib/orchestration";
import type { AgentCallbackRequest, AgentCallbackResponse, ErrorResponse } from "@/types/api";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workId: string }> }
): Promise<NextResponse<AgentCallbackResponse | ErrorResponse>> {
  try {
    const { workId } = await params;

    // Parse request body
    const body: AgentCallbackRequest = await request.json();

    // Validate required fields
    if (!body.reference_id || !body.status) {
      return NextResponse.json(
        { error: "Missing required fields", code: "INVALID_INPUT" },
        { status: 400 }
      );
    }

    // Get work item to validate reference_id
    const db = getDatabaseClient();
    const workItem = await db.getWorkItem(workId);

    if (!workItem) {
      return NextResponse.json(
        { error: "Work item not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    // Validate reference_id matches (security check)
    if (workItem.external_ref?.reference_id !== body.reference_id) {
      return NextResponse.json(
        { error: "Invalid reference_id", code: "INVALID_REFERENCE" },
        { status: 403 }
      );
    }

    // Forward to orchestration for processing
    const orchestration = OrchestrationEngine.getInstance();
    await orchestration.handleAgentCallback(workId, body);

    // Return success
    const response: AgentCallbackResponse = {
      received: true,
      work_id: workId,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
```

---

## Types Definition (`types/api.ts`)

All API-specific types are centralized in `types/api.ts`:

```typescript
// types/api.ts
import type { WorkItemStatus, ReasoningEntry, ActionItem } from "./data";

// =============================================================================
// REQUEST TYPES
// =============================================================================

export interface CreateJobRequest {
  prompt: string;
  budget: number;
  context?: {
    product?: string;
    users?: string;
    [key: string]: string | undefined;
  };
}

export interface ContinueJobRequest {
  prompt: string;
}

export interface AgentCallbackRequest {
  reference_id: string;
  status: "completed" | "failed" | "progress";
  output?: unknown;
  error?: string;
  progress?: number;
  message?: string;
}

// =============================================================================
// RESPONSE TYPES
// =============================================================================

export interface CreateJobResponse {
  job_id: string;
  status: "planning";
  stream_url: string;
}

export interface ContinueJobResponse {
  job_id: string;
  version: number;
  status: "planning";
  stream_url: string;
}

export interface GetJobResponse {
  job_id: string;
  status: "planning" | "plan_verification" | "executing" | "completed" | "failed";
  prompt: string;
  budget: {
    total: number;
    allocated: number;
    spent: number;
    remaining: number;
  };
  plan_version: number;
  context_summary: string;
  action_items: Array<{
    id: number;
    item: string;
    priority: number;
    depends_on: number[];
    status: "pending" | "in_progress" | "completed" | "failed";
    agent_id: string | null;
    template_id: string;
  }>;
  work_items: Array<{
    work_id: string;
    action_item_id: number;
    status: WorkItemStatus;
    action: string;
    output?: {
      title: string;
      description: string;
      content: unknown;
    };
    verification?: {
      score: number;
      passed: boolean;
    };
  }>;
  versions: Array<{
    version: number;
    completed_at: string;
    work_ids: string[];
  }>;
  reasoning_log: ReasoningEntry[];
}

export interface GetWorkItemResponse {
  work_id: string;
  action_item_id: number;
  status: WorkItemStatus;
  action: {
    item: string;
    deliverable_id: string;
    requirements: string[];
  };
  output: {
    title: string;
    description: string;
    content: unknown;
  } | null;
  verification: {
    score: number;
    passed: boolean;
    criteria_results: Array<{
      criterion: string;
      passed: boolean;
    }>;
  } | null;
  payment: {
    status: string;
    amount: number;
    tx_hash: string | null;
  } | null;
}

export interface AgentCallbackResponse {
  received: boolean;
  work_id: string;
}

export interface ErrorResponse {
  error: string;
  code: string;
  details?: Record<string, unknown>;
}

// =============================================================================
// ERROR CODES
// =============================================================================

export const ErrorCodes = {
  INVALID_INPUT: "INVALID_INPUT",
  UNAUTHORIZED: "UNAUTHORIZED",
  NOT_FOUND: "NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  JOB_COMPLETED: "JOB_COMPLETED",
  BUDGET_TOO_LOW: "BUDGET_TOO_LOW",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  INVALID_REFERENCE: "INVALID_REFERENCE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];
```

---

## Validation (`lib/api/validation.ts`)

Request validation using Zod:

```typescript
// lib/api/validation.ts
import { z } from "zod";
import type { CreateJobRequest, ContinueJobRequest } from "@/types/api";

// =============================================================================
// SCHEMAS
// =============================================================================

export const createJobSchema = z.object({
  prompt: z.string().min(10, "Prompt must be at least 10 characters").max(5000),
  budget: z.number().min(0.01, "Budget must be at least $0.01").max(100),
  context: z.record(z.string().optional()).optional(),
});

export const continueJobSchema = z.object({
  prompt: z.string().min(1, "Prompt is required").max(2000),
});

export const agentCallbackSchema = z.object({
  reference_id: z.string().min(1),
  status: z.enum(["completed", "failed", "progress"]),
  output: z.unknown().optional(),
  error: z.string().optional(),
  progress: z.number().min(0).max(1).optional(),
  message: z.string().optional(),
});

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

interface ValidationSuccess<T> {
  success: true;
  data: T;
}

interface ValidationFailure {
  success: false;
  errors: Record<string, string>;
}

type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

export function validateCreateJobRequest(data: unknown): ValidationResult<CreateJobRequest> {
  const result = createJobSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors: Record<string, string> = {};
  result.error.errors.forEach((err) => {
    const path = err.path.join(".");
    errors[path || "root"] = err.message;
  });
  return { success: false, errors };
}

export function validateContinueJobRequest(data: unknown): ValidationResult<ContinueJobRequest> {
  const result = continueJobSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errors: Record<string, string> = {};
  result.error.errors.forEach((err) => {
    const path = err.path.join(".");
    errors[path || "root"] = err.message;
  });
  return { success: false, errors };
}
```
