# Module: GALILEO

Verification (Instruction Adherence) + Observability (Tracing).

---

## Scope

**Owns:**
- Galileo API integration
- Output verification against requirements
- Instruction adherence scoring
- Tracing and observability setup
- Quality metrics collection

**Does NOT own:**
- Retry logic (that's ORCHESTRATION)
- Payment decisions (that's ORCHESTRATION + PAYMENTS)
- Storing verification results (that's DATA)

---

## Galileo: Two Roles

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  GALILEO (Two Roles)                                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ROLE 1: VERIFICATION                    ROLE 2: OBSERVABILITY              │
│  ─────────────────────                   ─────────────────────              │
│                                                                              │
│  After external agent output:            Every LangGraph node call:         │
│                                                                              │
│  "Does output meet requirements?"        "What did the agent think?"        │
│                                                                              │
│  Returns:                                Captures:                          │
│  - Score (0-1)                           - Reasoning chains                 │
│  - Pass/Fail per criterion               - Decision points                  │
│  - Issues identified                     - Quality metrics                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Role 1: Verification

### Purpose

Evaluate external agent output against defined requirements using Galileo's Instruction Adherence metric.

### API Call

```typescript
interface VerifyRequest {
  output: unknown;                // Agent's output (typed as unknown for type safety)
  instructions: string[];         // Requirements to check
  context?: {
    task: string;                 // What was asked
    agent_id: string;             // Which agent produced this
    attempt: number;              // Retry attempt number
  };
}

interface VerifyResponse {
  score: number;                  // 0-1 instruction adherence
  reasoning: string;              // Why this score
  criteria_results: Array<{
    criterion: string;
    passed: boolean;
    detail?: string;              // Explanation if failed
  }>;
  issues: string[];               // Summary of problems
  suggestions: string[];          // How to fix (for retry)
}

// STORAGE MAPPING:
// - score, reasoning, criteria_results, issues -> WorkItem.verification
// - suggestions -> WorkItem.retry_context.verification_feedback.suggestions (only on retry)
// - criteria_results.detail -> WorkItem.retry_context.verification_feedback.issues[].detail (only on retry)
// - verified_at is set by Orchestration when storing to WorkItem.verification
```

### Example

```typescript
// Request
await galileo.verify({
  output: {
    headlines: [
      "Your focus. Amplified.",
      "Work smarter, not harder with FocusFlow",
      "What could you accomplish with better focus?",
      "The productivity app that actually works",
      "Focus like never before"
    ]
  },
  instructions: [
    "Minimum 5 headline options",
    "Each headline under 10 words",
    "Align with empowering tone",
    "Include at least 1 question format"
  ],
  context: {
    task: "Write headlines for FocusFlow app",
    agent_id: "agent_copywriter_001",
    attempt: 1
  }
});

// Response
{
  score: 0.92,
  reasoning: "Output meets all requirements. 5 headlines provided, all under 10 words, tone is empowering, and one question format included.",
  criteria_results: [
    { criterion: "Minimum 5 headline options", passed: true },
    { criterion: "Each headline under 10 words", passed: true },
    { criterion: "Align with empowering tone", passed: true },
    { criterion: "Include at least 1 question format", passed: true }
  ],
  issues: [],
  suggestions: []
}
```

### Verification with Issues

```typescript
// Response with issues
{
  score: 0.72,
  reasoning: "Most requirements met, but headline #2 exceeds word limit.",
  criteria_results: [
    { criterion: "Minimum 5 headline options", passed: true },
    {
      criterion: "Each headline under 10 words",
      passed: false,
      detail: "Headline #2 has 12 words: 'Work smarter, not harder with the amazing FocusFlow productivity app'"
    },
    { criterion: "Align with empowering tone", passed: true },
    { criterion: "Include at least 1 question format", passed: true }
  ],
  issues: [
    "Headline #2 exceeds 10 word limit (has 12 words)"
  ],
  suggestions: [
    "Shorten headline #2 to under 10 words",
    "Consider: 'Work smarter with FocusFlow'"
  ]
}
```

---

### Score Thresholds

| Score | Decision | Action |
|-------|----------|--------|
| >= 0.90 | **PASS** | Proceed to payment |
| 0.80 - 0.89 | **PASS WITH NOTES** | Proceed, log issues |
| 0.60 - 0.79 | **RETRY** | Send feedback, retry (up to 3x) |
| < 0.60 | **REJECT** | Try different agent or fail |

---

## Role 2: Observability (Tracing)

### Purpose

Capture reasoning and decisions from all internal agents for debugging, transparency, and quality improvement.

### Trace Points

```typescript
// Every internal agent call is traced
interface TraceEvent {
  trace_id: string;           // Unique trace ID
  job_id: string;
  timestamp: Date;
  agent: "main" | "planning" | "plan_verifier" | "prompt";
  step: string;               // What step in the agent
  input: unknown;             // What the agent received
  output: unknown;            // What the agent returned
  reasoning?: string;         // Agent's thinking (if available)
  decision?: string;          // What decision was made
  duration_ms: number;        // How long it took
  tokens_used?: {
    input: number;
    output: number;
  };
  metadata?: Record<string, unknown>;
}
```

### Trace Integration with LangGraph

```typescript
// Base interface for all traceable inputs (must have job_id)
interface TraceableInput {
  job_id: string;
}

// Wrap each LangGraph node with tracing
function withTracing<TInput extends TraceableInput, TOutput>(
  nodeName: string,
  nodeFunction: (input: TInput) => Promise<TOutput>
): (input: TInput) => Promise<TOutput> {
  return async (input: TInput): Promise<TOutput> => {
    const traceId = generateTraceId();
    const startTime = Date.now();

    try {
      const output = await nodeFunction(input);

      await galileo.trace({
        trace_id: traceId,
        job_id: input.job_id,  // TypeScript now guarantees job_id exists
        timestamp: new Date(),
        agent: nodeName,
        step: "execute",
        input: sanitize(input),
        output: sanitize(output),
        duration_ms: Date.now() - startTime
      });

      return output;
    } catch (error) {
      await galileo.trace({
        trace_id: traceId,
        job_id: input.job_id,
        timestamp: new Date(),
        agent: nodeName,
        step: "error",
        input: sanitize(input),
        output: { error: (error as Error).message },
        duration_ms: Date.now() - startTime
      });
      throw error;
    }
  };
}
```

### Trace Examples

```typescript
// Planning Agent trace
{
  trace_id: "trace_abc123",
  job_id: "job_001",
  timestamp: "2024-01-10T15:30:00Z",
  agent: "planning",
  step: "create_plan",
  input: {
    prompt: "Create marketing campaign for FocusFlow",
    budget: 0.50
  },
  output: {
    requirements: { deliverables: [...] },
    action_items: [...]
  },
  reasoning: "Analyzed prompt, identified 6 deliverables needed...",
  decision: "Created plan with 6 action items",
  duration_ms: 2500,
  tokens_used: { input: 450, output: 1200 }
}

// Main Agent trace
{
  trace_id: "trace_def456",
  job_id: "job_001",
  timestamp: "2024-01-10T15:30:05Z",
  agent: "main",
  step: "select_next_todo",
  input: {
    completed_ids: [1],
    pending_ids: [2, 3, 4, 5, 6]
  },
  output: {
    selected: [2, 3, 4]  // Parallel execution
  },
  reasoning: "TODOs 2, 3, 4 have dependencies satisfied (all depend on #1 which is complete)",
  decision: "Execute 3 TODOs in parallel",
  duration_ms: 150
}
```

---

## Quality Metrics

Galileo captures metrics for quality analysis:

```typescript
interface QualityMetrics {
  job_id: string;

  // Verification metrics
  verification: {
    total_verifications: number;
    pass_rate: number;
    average_score: number;
    retry_rate: number;
    rejection_rate: number;
  };

  // Agent performance
  agent_performance: Record<string, {
    agent_id: string;
    verifications: number;
    average_score: number;
    pass_rate: number;
  }>;

  // Timing metrics
  timing: {
    total_duration_ms: number;
    planning_duration_ms: number;
    execution_duration_ms: number;
    verification_duration_ms: number;
  };

  // Token usage
  tokens: {
    total_input: number;
    total_output: number;
    by_agent: Record<string, { input: number; output: number }>;
  };
}
```

---

## Interface: Dependencies

| Module | What We Need | Interface |
|--------|--------------|-----------|
| None | Galileo is standalone | Galileo API credentials |

**External dependency:**
- Galileo AI API (credentials in environment)

---

## Interface: Provides

### GalileoClient

```typescript
interface GalileoClient {
  // Verification
  verify(request: VerifyRequest): Promise<VerifyResponse>;

  // Tracing
  trace(event: TraceEvent): Promise<void>;

  // Batch trace (for efficiency)
  traceBatch(events: TraceEvent[]): Promise<void>;

  // Metrics
  getJobMetrics(job_id: string): Promise<QualityMetrics>;
}
```

### Factory

```typescript
function createGalileoClient(config: {
  apiKey: string;
  projectId: string;
  environment?: "development" | "production";
}): GalileoClient;
```

---

## Data Alignment with Core Data Structure

This section documents how Galileo types map to `types/data.ts` WorkItem fields.

### VerifyResponse to WorkItem Storage

When Orchestration receives a VerifyResponse, it stores data as follows:

```typescript
// VerifyResponse fields → WorkItem.verification
// (always stored for verified/rejected outcomes)
workItem.verification = {
  score: verifyResponse.score,
  reasoning: verifyResponse.reasoning,
  criteria_results: verifyResponse.criteria_results.map(cr => ({
    criterion: cr.criterion,
    passed: cr.passed
    // Note: detail is NOT stored in verification - see retry_context below
  })),
  issues: verifyResponse.issues,
  verified_at: new Date()  // Set by Orchestration
};

// VerifyResponse fields → WorkItem.retry_context
// (only populated when status becomes "retry_pending")
if (verifyResponse.score >= 0.60 && verifyResponse.score < 0.80) {
  workItem.retry_context = {
    previous_attempt: workItem.attempt,
    previous_output: workItem.output?.content,
    verification_feedback: {
      score: verifyResponse.score,
      reasoning: verifyResponse.reasoning,
      issues: verifyResponse.criteria_results
        .filter(cr => !cr.passed)
        .map(cr => ({
          criterion: cr.criterion,
          passed: cr.passed,
          detail: cr.detail ?? ""  // detail stored here for retry feedback
        })),
      suggestions: verifyResponse.suggestions  // suggestions stored here
    }
  };
}
```

### Key Storage Notes

| VerifyResponse Field | Storage Location | When Stored |
|---------------------|------------------|-------------|
| `score` | `WorkItem.verification.score` | Always |
| `reasoning` | `WorkItem.verification.reasoning` | Always |
| `criteria_results` (basic) | `WorkItem.verification.criteria_results` | Always |
| `criteria_results.detail` | `WorkItem.retry_context.verification_feedback.issues[].detail` | On retry only |
| `issues` | `WorkItem.verification.issues` | Always |
| `suggestions` | `WorkItem.retry_context.verification_feedback.suggestions` | On retry only |
| (generated) `verified_at` | `WorkItem.verification.verified_at` | Always |

---

## Galileo API Configuration

```typescript
// Environment variables
GALILEO_API_KEY=<api_key>
GALILEO_PROJECT_ID=<project_id>
GALILEO_ENVIRONMENT=production

// Client initialization
const galileo = createGalileoClient({
  apiKey: process.env.GALILEO_API_KEY,
  projectId: process.env.GALILEO_PROJECT_ID,
  environment: process.env.GALILEO_ENVIRONMENT
});
```

---

## Verification Flow Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ORCHESTRATION calls GALILEO                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  work_item.status = "received"                                              │
│       │                                                                      │
│       ▼                                                                      │
│  work_item.status = "verifying"                                             │
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  galileo.verify({                                                       ││
│  │    output: work_item.output.content,                                    ││
│  │    instructions: work_item.action.requirements,                         ││
│  │    context: {                                                           ││
│  │      task: work_item.action.item,                                       ││
│  │      agent_id: work_item.agent.agent_id,                                ││
│  │      attempt: work_item.attempt                                         ││
│  │    }                                                                    ││
│  │  })                                                                     ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│       │                                                                      │
│       ▼                                                                      │
│  Store result in work_item.verification                                     │
│       │                                                                      │
│       ├── score >= 0.90 → status = "verified" → proceed to payment         │
│       ├── score 0.80-0.89 → status = "verified" → proceed (log issues)     │
│       ├── score 0.60-0.79 → status = "retry_pending" → retry with feedback │
│       └── score < 0.60 → status = "rejected" → try different agent         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Retry Feedback Generation

When verification requires retry (score 0.60-0.79), Galileo response is used for retry:

```typescript
// Galileo returns
{
  score: 0.72,
  issues: ["Headline #2 exceeds 10 word limit"],
  suggestions: ["Shorten headline #2 to under 10 words"]
}

// Stored in work_item.retry_context
{
  previous_attempt: 1,
  previous_output: { ... },
  verification_feedback: {
    score: 0.72,
    reasoning: "...",
    issues: [
      { criterion: "Each headline under 10 words", passed: false, detail: "..." }
    ],
    suggestions: ["Shorten headline #2 to under 10 words"]
  }
}

// Prompt Agent uses this for retry_template
```

---

## Image Verification

For image outputs, verification focuses on:

```typescript
// Image-specific requirements
const imageRequirements = [
  "Professional quality",
  "Matches brand tone",
  "Suitable for social media",
  "Conveys productivity/focus theme"
];

// Galileo can evaluate image descriptions/metadata
// For actual image quality, may need additional vision API
```

---

## Error Handling

```typescript
try {
  const result = await galileo.verify(request);
  return result;
} catch (error) {
  if (error.code === 'RATE_LIMITED') {
    // Retry with backoff
    await delay(1000);
    return galileo.verify(request);
  }
  if (error.code === 'INVALID_INPUT') {
    // Return failed verification
    return {
      score: 0,
      reasoning: "Verification failed: " + error.message,
      criteria_results: [],
      issues: [error.message],
      suggestions: []
    };
  }
  throw error;
}
```
