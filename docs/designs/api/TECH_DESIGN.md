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
    [key: string]: any;
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
      content: any;
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
    content: any;  // Full content
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
{ event: "work:output_received", data: { work_id: string, title: string, description: string, content: any } }
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
  output?: any;          // If completed
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
  details?: any;
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

---

## SSE Implementation Notes

**Server-side (Next.js API Route):**
```typescript
// pages/api/jobs/[job_id]/stream.ts
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { job_id } = req.query;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Subscribe to orchestration events
  const unsubscribe = orchestration.subscribe(job_id, (event) => {
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  // Heartbeat
  const heartbeat = setInterval(() => {
    res.write(`event: heartbeat\n`);
    res.write(`data: {"timestamp":"${new Date().toISOString()}"}\n\n`);
  }, 30000);

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
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
