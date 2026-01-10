# ORCH_INTEGRATIONS

External module calls: Galileo verify, Payments, External Agents, Recovery.

---

## Type Safety Note

This module uses `unknown` or unstructured types in specific places where external agent outputs are handled. This is intentional because:

1. **Agent outputs are heterogeneous** - Different agents produce different content structures (text, JSON, images, etc.)
2. **Type validation happens at boundaries** - The Galileo verification module validates outputs against expected schemas
3. **Storage is schemaless** - Firebase allows flexible document structures for `work_items.output.content`

Places where flexible types are used:
- `DispatchResult.output` - Raw agent response before validation
- `PollResult.output` - Raw agent response before validation
- `loadFullContent()` return - Retrieved content varies by agent type
- `loaded_content` in context - Pre-loaded dependency outputs

**Runtime type guards are used** when consuming these values to ensure type safety at usage points.

---

## Scope

**Owns:**
- Galileo verification calls
- Payment execution calls
- External agent dispatch and polling
- Recovery mechanisms (poll manager, system restart)
- Context management (lazy loading)

**Does NOT own:**
- Graph flow (that's ORCH_GRAPH)
- State transitions (that's ORCH_WORK_LIFECYCLE)
- The actual implementation of Galileo/Payments/External Agents (those are separate modules)

---

## Integration Points

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ORCH_INTEGRATIONS                                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                    ┌──────────────────┐                                     │
│                    │   ORCH_GRAPH     │                                     │
│                    │   (caller)       │                                     │
│                    └────────┬─────────┘                                     │
│                             │                                               │
│        ┌────────────────────┼────────────────────┐                         │
│        │                    │                    │                          │
│        ▼                    ▼                    ▼                          │
│  ┌───────────┐       ┌───────────┐       ┌───────────┐                     │
│  │  Galileo  │       │  Payments │       │  External │                     │
│  │  Verify   │       │   Pay     │       │  Agents   │                     │
│  └─────┬─────┘       └─────┬─────┘       └─────┬─────┘                     │
│        │                   │                   │                           │
│        ▼                   ▼                   ▼                           │
│  ┌───────────┐       ┌───────────┐       ┌───────────┐                     │
│  │  MODULE   │       │  MODULE   │       │  MODULE   │                     │
│  │  GALILEO  │       │  PAYMENTS │       │  EXTERNAL │                     │
│  └───────────┘       └───────────┘       └───────────┘                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Integration 1: Galileo Verification

### Verification Flow

```
received → verifying → verified/retry_pending/rejected
```

### Call Pattern

```typescript
interface VerificationIntegration {
  verify(work_id: string): Promise<VerificationResult>;
}

interface VerificationResult {
  score: number;
  passed: boolean;
  decision: "pass" | "retry" | "reject";
  criteria_results: CriterionResult[];
  issues: string[];
  suggestions: string[];
}

async function verifyWork(work_id: string): Promise<VerificationResult> {
  const work = await db.work_items.findOne({ work_id });

  // Transition to verifying
  await lifecycle.transition(work_id, "start_verification");

  // Call Galileo
  const galileoResponse = await galileo.verify({
    output: work.output.content,
    instructions: work.requirements,
    context: {
      task: work.action.item,
      agent_id: work.agent.agent_id,
      attempt: work.attempt
    }
  });

  // Determine decision based on score
  const decision = getVerificationDecision(galileoResponse.score, work.attempt);

  // Transition based on decision
  const trigger = `verification_${decision}`;
  await lifecycle.transition(work_id, trigger, {
    score: galileoResponse.score,
    criteria_results: galileoResponse.criteria_results,
    issues: galileoResponse.issues,
    suggestions: galileoResponse.suggestions,
    previous_output: work.output
  });

  // Emit appropriate event
  if (decision === "pass") {
    emitEvent({
      type: "work:verified",
      work_id,
      score: galileoResponse.score,
      passed: true
    });
  } else if (decision === "retry") {
    emitEvent({
      type: "work:retry",
      work_id,
      attempt: work.attempt + 1,
      reason: "Verification score below threshold",
      issues: galileoResponse.issues
    });
  } else {
    emitEvent({
      type: "work:failed",
      work_id,
      reason: `Rejected: score ${galileoResponse.score}`
    });
  }

  return {
    score: galileoResponse.score,
    passed: decision === "pass",
    decision,
    criteria_results: galileoResponse.criteria_results,
    issues: galileoResponse.issues,
    suggestions: galileoResponse.suggestions
  };
}

function getVerificationDecision(
  score: number,
  attempt: number
): "pass" | "retry" | "reject" {
  if (score >= 0.90) return "pass";
  if (score >= 0.60 && attempt < 3) return "retry";
  return "reject";
}
```

### Score Thresholds

| Score | Decision | Action |
|-------|----------|--------|
| >= 0.90 | PASS | Proceed to payment |
| 0.80 - 0.89 | PASS WITH NOTES | Proceed, log issues |
| 0.60 - 0.79 | RETRY | Send feedback, retry (up to 3x) |
| < 0.60 | REJECT | Try different agent or fail |

---

## Integration 2: Payments

### Payment Flow

```
verified → paying → completed
              ↓
         payment_retry → paying (retry)
              ↓
            failed (max retries)
```

### Call Pattern

```typescript
interface PaymentIntegration {
  pay(work_id: string): Promise<PaymentResult>;
}

interface PaymentResult {
  success: boolean;
  tx_hash?: string;
  error?: string;
  retry_suggested?: boolean;
}

async function payForWork(work_id: string): Promise<PaymentResult> {
  const work = await db.work_items.findOne({ work_id });
  const job = await db.jobs.findOne({ job_id: work.job_id });
  const agent = await db.agents.findOne({ agent_id: work.agent.agent_id });

  // Transition to paying
  await lifecycle.transition(work_id, "start_payment");

  // Build payment request
  const paymentRequest = {
    work_id,
    job_id: work.job_id,
    user_id: job.user_id,
    agent_id: agent.agent_id,
    amount: agent.base_price,
    currency: "USDC" as const,
    from_address: job.user_wallet_address,
    to_address: agent.wallet_address,
    reason: `Work completed, score ${work.verification.score}`
  };

  // Execute payment
  const paymentResponse = await payments.pay(paymentRequest);

  if (paymentResponse.success) {
    // Transition to completed
    await lifecycle.transition(work_id, "payment_confirmed", {
      amount: paymentRequest.amount,
      tx_hash: paymentResponse.tx_hash
    });

    emitEvent({
      type: "work:payment_confirmed",
      work_id,
      amount: paymentRequest.amount,
      tx_hash: paymentResponse.tx_hash
    });

    return paymentResponse;
  }

  // Payment failed
  if (paymentResponse.retry_suggested) {
    await lifecycle.transition(work_id, "payment_failed");
    // Will be retried by retry logic
  } else {
    await lifecycle.transition(work_id, "max_payment_retries");
  }

  return paymentResponse;
}
```

### Payment Retry with Backoff

```typescript
async function retryPayment(work_id: string): Promise<void> {
  const work = await db.work_items.findOne({ work_id });
  const retryCount = work.payment?.retry_count || 0;

  // Exponential backoff
  const backoffMs = 5000 * Math.pow(2, retryCount);  // 5s, 10s, 20s
  await delay(backoffMs);

  // Transition back to paying
  await lifecycle.transition(work_id, "retry_payment");

  // Retry
  await payForWork(work_id);
}
```

---

## Integration 3: External Agents

### Dispatch and Poll Flow

```
prompting → dispatched → polling → received
                ↓           ↓
           (sync)      (timeout → stale)
                ↓
            received
```

### Dispatch Pattern

```typescript
interface ExternalAgentIntegration {
  dispatch(work_id: string): Promise<DispatchResult>;
  poll(work_id: string): Promise<PollResult>;
}

interface DispatchResult {
  type: "sync" | "async";
  output?: unknown;                // For sync - heterogeneous agent output
  reference_id?: string;           // For async
  status_url?: string;             // For async
}

async function dispatchToAgent(work_id: string): Promise<DispatchResult> {
  const work = await db.work_items.findOne({ work_id });
  const agent = await db.agents.findOne({ agent_id: work.agent.agent_id });

  // Call external agent
  const response = await externalAgents.execute({
    agent_id: agent.agent_id,
    endpoint: agent.endpoint,
    prompt: work.generated_prompt,
    callback_url: `${BASE_URL}/api/webhooks/work/${work_id}`,
    reference_id: work_id
  });

  if (response.status === "completed") {
    // Sync response - capture and store usage
    await lifecycle.transition(work_id, "sync_response", {
      output: response.output,
      usage: response.usage  // Pass usage to state transition
    });

    // CRITICAL: Store external agent usage for billing/auditing
    await storeExternalAgentUsage(work_id, response.usage);

    emitEvent({
      type: "work:output_received",
      work_id,
      title: response.output.title,
      description: response.output.description,
      content: response.output.content
    });

    return { type: "sync", output: response.output };
  }

  // Async response
  await lifecycle.transition(work_id, "async_response", {
    reference_id: response.reference_id,
    status_url: response.status_url
  });

  return {
    type: "async",
    reference_id: response.reference_id,
    status_url: response.status_url
  };
}
```

### Polling Pattern

```typescript
interface PollResult {
  status: "pending" | "completed" | "failed";
  output?: unknown;                // Heterogeneous agent output
  error?: string;
  progress?: number;
}

async function pollAgent(work_id: string): Promise<PollResult> {
  const work = await db.work_items.findOne({ work_id });

  if (!work.external_ref) {
    return { status: "failed", error: "No external reference" };
  }

  // Check timeout
  if (new Date() > work.external_ref.polling.timeout_at) {
    await lifecycle.transition(work_id, "poll_timeout");
    return { status: "failed", error: "Polling timeout" };
  }

  // Poll external agent
  const response = await externalAgents.getStatus(work.external_ref.status_url);

  if (response.status === "completed") {
    await lifecycle.transition(work_id, "poll_completed", {
      output: response.output,
      usage: response.usage  // Pass usage to state transition
    });

    // CRITICAL: Store external agent usage for billing/auditing
    await storeExternalAgentUsage(work_id, response.usage);

    emitEvent({
      type: "work:output_received",
      work_id,
      title: response.output.title,
      description: response.output.description,
      content: response.output.content
    });

    return { status: "completed", output: response.output };
  }

  if (response.status === "failed") {
    await lifecycle.transition(work_id, "poll_failed", {
      error: response.error
    });
    return { status: "failed", error: response.error };
  }

  // Still pending - update next poll time
  await updateNextPollTime(work_id);
  return { status: "pending", progress: response.progress };
}
```

### Adaptive Polling Interval

```typescript
function calculateNextPollInterval(work: WorkItem): number {
  const polling = work.external_ref.polling;
  const elapsed = Date.now() - polling.started_at.getTime();

  // Start at 3s, gradually increase to 15s
  if (elapsed < 30000) return 3000;      // First 30s: every 3s
  if (elapsed < 120000) return 5000;     // 30s-2min: every 5s
  if (elapsed < 300000) return 10000;    // 2-5min: every 10s
  return 15000;                           // 5-10min: every 15s
}

async function updateNextPollTime(work_id: string): Promise<void> {
  const work = await db.work_items.findOne({ work_id });
  const nextInterval = calculateNextPollInterval(work);

  await db.work_items.updateOne(
    { work_id },
    {
      $set: {
        "external_ref.polling.next_poll_at": new Date(Date.now() + nextInterval),
        "external_ref.polling.interval_ms": nextInterval
      }
    }
  );
}
```

---

## External Agent Usage Storage

When external agents complete work (via sync response, poll completion, or callback), their usage must be stored for billing and auditing.

### Shared Utilities

#### generateOperationId

Uses `nanoid` for unique operation ID generation (consistent with existing pattern in `lib/payments/transfer.ts`).

```typescript
import { nanoid } from "nanoid";

/**
 * Generates a unique operation ID for LLM operations.
 * Uses nanoid for URL-safe, unique identifiers.
 */
function generateOperationId(): string {
  return `op_${nanoid()}`;
}
```

#### delay

Uses the existing `sleep` utility from `lib/utils.ts` for delays.

```typescript
import { sleep as delay } from "@/lib/utils";

// Usage: await delay(5000); // Wait 5 seconds
```

### Helper Function: storeExternalAgentUsage

```typescript
import { nanoid } from "nanoid";

function generateOperationId(): string {
  return `op_${nanoid()}`;
}

/**
 * Stores external agent usage data at both work item and job level.
 * Transforms ModelUsage (from agent) to LLMOperation (for storage).
 */
async function storeExternalAgentUsage(
  work_id: string,
  usage: AgentUsage
): Promise<void> {
  const work = await db.work_items.findOne({ work_id });
  const job_id = work.job_id;
  const agent_id = work.agent.agent_id;

  // Transform ModelUsage[] to LLMOperation[] if breakdown provided
  const operations: LLMOperation[] = usage.model_usage?.map(mu => ({
    operation_id: generateOperationId(),
    timestamp: new Date(),
    operation_type: "external_agent" as const,
    model: mu.model,
    native_tokens_prompt: mu.native_tokens_prompt,
    native_tokens_completion: mu.native_tokens_completion,
    total_cost: mu.total_cost,
    metadata: {
      work_id,
      agent_id,
      source: "external_agent_response"
    }
  })) || [];

  // If no breakdown, create a single operation with total cost
  if (operations.length === 0 && usage.total_cost > 0) {
    operations.push({
      operation_id: generateOperationId(),
      timestamp: new Date(),
      operation_type: "external_agent" as const,
      model: "unknown",  // No breakdown provided
      total_cost: usage.total_cost,
      metadata: {
        work_id,
        agent_id,
        source: "external_agent_response",
        note: "Agent returned total_cost without model breakdown"
      }
    });
  }

  // Update work item with external usage
  await db.work_items.updateOne(
    { work_id },
    {
      $set: { "token_usage.external": usage },
      $push: { "token_usage.internal": { $each: operations } },  // Also store as operations for visibility
      $inc: {
        "token_usage.total_external_cost_usd": usage.total_cost,
        "token_usage.total_cost_usd": usage.total_cost
      }
    }
  );

  // Update job aggregate
  await db.jobs.updateOne(
    { job_id },
    {
      $push: {
        "token_usage.operations": { $each: operations },
        "token_usage.external_costs": {
          work_id,
          agent_id,
          usage
        }
      },
      $inc: {
        "token_usage.total_external_cost_usd": usage.total_cost,
        "token_usage.total_cost_usd": usage.total_cost
      }
    }
  );

  // Emit event for client visibility
  emitEvent({
    type: "work:usage_recorded",
    work_id,
    agent_id,
    total_cost: usage.total_cost,
    has_breakdown: (usage.model_usage?.length || 0) > 0
  });
}
```

### Type Definitions (Referenced)

```typescript
// From MODULE_DATA.md - Shared Interfaces
interface ModelUsage {
  model: string;
  native_tokens_prompt?: number;
  native_tokens_completion?: number;
  total_cost: number;
}

interface AgentUsage {
  total_cost: number;             // REQUIRED
  model_usage?: ModelUsage[];     // OPTIONAL
}

interface LLMOperation {
  operation_id: string;
  timestamp: Date;
  operation_type: "main_agent" | "planning_agent" | "plan_verifier" |
                  "prompt_agent" | "discovery_embed" | "discovery_rerank" |
                  "summarization" | "external_agent";
  model: string;
  native_tokens_prompt?: number;
  native_tokens_completion?: number;
  total_cost: number;
  metadata?: Record<string, unknown>;
}
```

### Usage Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  EXTERNAL AGENT USAGE STORAGE FLOW                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  External Agent Response                                                     │
│  {                                                                           │
│    status: "completed",                                                      │
│    output: {...},                                                            │
│    usage: {                      ◄── Agent MUST return usage                │
│      total_cost: 0.08,               (total_cost required)                  │
│      model_usage: [                  (breakdown optional)                   │
│        { model: "gpt-4o", total_cost: 0.05, ... },                          │
│        { model: "dall-e-3", total_cost: 0.03, ... }                         │
│      ]                                                                       │
│    }                                                                         │
│  }                                                                           │
│       │                                                                      │
│       ▼                                                                      │
│  dispatchToAgent() / pollAgent() / handleAgentCallback()                    │
│       │                                                                      │
│       ├──► storeExternalAgentUsage(work_id, usage)                         │
│       │         │                                                            │
│       │         ├──► Transform ModelUsage[] → LLMOperation[]               │
│       │         │                                                            │
│       │         ├──► work_items.token_usage.external = usage               │
│       │         │    work_items.token_usage.internal.push(...operations)   │
│       │         │    work_items.token_usage.total_external_cost_usd += $   │
│       │         │                                                            │
│       │         └──► jobs.token_usage.operations.push(...operations)       │
│       │              jobs.token_usage.external_costs.push({work_id, usage})│
│       │              jobs.token_usage.total_external_cost_usd += $         │
│       │                                                                      │
│       └──► Emit "work:usage_recorded" event for client                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Integration 4: Context Management

### Lazy Loading Pattern

```
ALWAYS AVAILABLE (lightweight)         LOADED ON DEMAND (heavy)
─────────────────────────────          ────────────────────────
context_summary                        work_items.output.content
context_refs [                         (fetched when agent
  { work_id, title, description }      decides it's needed)
]
```

### Context Loading

```typescript
interface ContextRef {
  work_id: string;
  title: string;
  description: string;
}

interface ContextIntegration {
  getSummary(job_id: string): Promise<string>;
  getRefs(job_id: string): Promise<ContextRef[]>;
  loadFullContent(work_id: string): Promise<unknown>;
}

async function getContextSummary(job_id: string): Promise<string> {
  const job = await db.jobs.findOne({ job_id });
  return job.context_summary || "";
}

async function getContextRefs(job_id: string): Promise<ContextRef[]> {
  const completedWorks = await db.work_items.find({
    job_id,
    status: "completed"
  });

  return completedWorks.map(work => ({
    work_id: work.work_id,
    title: work.output.title,
    description: work.output.description
    // Note: NOT including full content
  }));
}

async function loadFullContent(work_id: string): Promise<unknown> {
  const work = await db.work_items.findOne({ work_id });
  return work.output.content;
}
```

### Context for Prompt Agent

```typescript
async function prepareContextForPrompt(
  job_id: string,
  action_item: ActionItem
): Promise<{
  summary: string;
  refs: ContextRef[];
  loaded_content: Record<string, unknown>;
}> {
  const summary = await getContextSummary(job_id);
  const refs = await getContextRefs(job_id);

  // Determine which refs need full content
  // (based on dependencies and action item needs)
  const neededWorkIds = action_item.depends_on.map(depId =>
    // Find work_id for this action_item_id
    db.work_items.findOne({ job_id, action_item_id: depId })
  );

  const loaded_content: Record<string, unknown> = {};
  for (const work of await Promise.all(neededWorkIds)) {
    if (work) {
      loaded_content[work.work_id] = await loadFullContent(work.work_id);
    }
  }

  return { summary, refs, loaded_content };
}
```

---

## Recovery Mechanisms

### Poll Manager (Background Process)

```typescript
// Runs every 5 seconds
async function pollManager(): Promise<void> {
  // Find items needing poll
  const needsPoll = await db.work_items.find({
    status: "polling",
    "external_ref.polling.next_poll_at": { $lte: new Date() }
  });

  for (const work of needsPoll) {
    try {
      await pollAgent(work.work_id);
    } catch (error) {
      console.error(`Poll failed for ${work.work_id}:`, error);
    }
  }

  // Find stale items (timeout exceeded)
  const staleItems = await db.work_items.find({
    status: "polling",
    "external_ref.polling.timeout_at": { $lte: new Date() }
  });

  for (const work of staleItems) {
    await handleStaleWork(work);
  }
}

async function handleStaleWork(work: WorkItem): Promise<void> {
  const canRetry = (work.stale_retry_count || 0) < 3;

  if (canRetry) {
    await lifecycle.transition(work.work_id, "poll_timeout");
    // Retry dispatch
    await dispatchToAgent(work.work_id);
  } else {
    await lifecycle.transition(work.work_id, "max_stale_retries");
  }
}

// Start poll manager
setInterval(pollManager, 5000);
```

### System Restart Recovery

```typescript
async function recoverInFlightWork(): Promise<void> {
  // Find active jobs
  const activeJobs = await db.jobs.find({
    status: { $in: ["planning", "plan_verification", "executing"] }
  });

  for (const job of activeJobs) {
    const workItems = await db.work_items.find({ job_id: job.job_id });

    for (const work of workItems) {
      await recoverWorkItem(work);
    }
  }
}

async function recoverWorkItem(work: WorkItem): Promise<void> {
  switch (work.status) {
    case "dispatched":
    case "polling":
      // Resume polling
      await pollAgent(work.work_id);
      break;

    case "prompting":
      // Restart prompting
      await restartPrompting(work.work_id);
      break;

    case "verifying":
      // Re-run verification
      await verifyWork(work.work_id);
      break;

    case "paying":
    case "payment_retry":
      // Check payment status
      await checkPaymentStatus(work.work_id);
      break;

    case "stale":
      // Handle stale
      await handleStaleWork(work);
      break;
  }
}

async function restartPrompting(work_id: string): Promise<void> {
  // Reset to ready and re-process
  await db.work_items.updateOne(
    { work_id },
    { $set: { status: "ready" } }
  );

  // Will be picked up by execution loop
}

async function checkPaymentStatus(work_id: string): Promise<void> {
  const work = await db.work_items.findOne({ work_id });

  if (!work.payment?.tx_hash) {
    // No transaction started, retry payment
    await payForWork(work_id);
    return;
  }

  // Check on-chain status
  const status = await payments.getPaymentStatus(work.payment.tx_hash);

  if (status === "confirmed") {
    await lifecycle.transition(work_id, "payment_confirmed", {
      amount: work.payment.amount,
      tx_hash: work.payment.tx_hash
    });
  } else if (status === "failed") {
    await lifecycle.transition(work_id, "payment_failed");
  }
  // If pending, wait for next check
}

// Run recovery on startup
recoverInFlightWork();
```

### Webhook Handler (Agent Callback)

#### Security: HMAC Signature Verification

**REQUIRED for production deployments.** Webhook callbacks MUST include HMAC signature verification to prevent spoofing attacks.

```typescript
import crypto from "crypto";

/**
 * Verifies HMAC-SHA256 signature on webhook callback.
 * Signature is passed in X-Webhook-Signature header.
 *
 * Format: sha256=<hex_signature>
 *
 * The signature is computed over the raw request body using the agent's
 * webhook_secret (stored during agent registration).
 */
function verifyWebhookSignature(
  body: string,
  signature: string | undefined,
  webhookSecret: string
): boolean {
  if (!signature) {
    // In production, missing signature should be rejected
    // During development/testing, can be allowed if ALLOW_UNSIGNED_WEBHOOKS=true
    return process.env.ALLOW_UNSIGNED_WEBHOOKS === "true";
  }

  // Extract algorithm and signature value
  const parts = signature.split("=");
  if (parts.length !== 2 || parts[0] !== "sha256") {
    return false;
  }

  const receivedSignature = parts[1];

  // Compute expected signature
  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(body, "utf8")
    .digest("hex");

  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(receivedSignature, "hex"),
    Buffer.from(expectedSignature, "hex")
  );
}
```

#### Webhook Handler Implementation

```typescript
// POST /api/webhooks/work/:work_id
async function handleAgentCallback(
  work_id: string,
  body: AgentCallbackRequest,
  rawBody: string,               // Raw request body for signature verification
  signatureHeader: string | undefined  // X-Webhook-Signature header
): Promise<void> {
  const work = await db.work_items.findOne({ work_id });

  if (!work) {
    throw new Error("Work item not found");
  }

  // SECURITY: Verify HMAC signature (required in production)
  const agent = await db.agents.findOne({ agent_id: work.agent.agent_id });
  if (agent.webhook_secret) {
    const isValid = verifyWebhookSignature(rawBody, signatureHeader, agent.webhook_secret);
    if (!isValid) {
      throw new Error("Invalid webhook signature");
    }
  } else if (process.env.NODE_ENV === "production") {
    // In production, agents without webhook_secret cannot use callbacks
    throw new Error("Agent webhook_secret not configured");
  }

  // Validate reference_id (secondary validation)
  if (work.external_ref?.reference_id !== body.reference_id) {
    throw new Error("Invalid reference_id");
  }

  if (body.status === "completed") {
    await lifecycle.transition(work_id, "poll_completed", {
      output: body.output,
      usage: body.usage  // Pass usage to state transition
    });

    // CRITICAL: Store external agent usage for billing/auditing
    await storeExternalAgentUsage(work_id, body.usage);

    emitEvent({
      type: "work:output_received",
      work_id,
      title: body.output.title,
      description: body.output.description,
      content: body.output.content
    });

  } else if (body.status === "failed") {
    await lifecycle.transition(work_id, "poll_failed", {
      error: body.error
    });

    // Even on failure, store partial usage if reported
    if (body.usage) {
      await storeExternalAgentUsage(work_id, body.usage);
    }

  } else if (body.status === "progress") {
    // Update progress (optional)
    await db.work_items.updateOne(
      { work_id },
      { $set: { "external_ref.progress": body.progress } }
    );
  }
}
```

---

## Interface: Dependencies

| Module | What We Need | Interface |
|--------|--------------|-----------|
| **GALILEO** | Verification API | `GalileoClient.verify()` |
| **PAYMENTS** | Payment execution | `PaymentClient.pay()` |
| **EXTERNAL_AGENTS** | Agent HTTP calls | `ExternalAgentClient.execute()`, `.getStatus()` |
| **DATA** | All DB operations | `DatabaseClient` |
| **ORCH_WORK_LIFECYCLE** | State transitions | `WorkLifecycle.transition()` |

---

## Interface: Provides

### Integrations

```typescript
interface Integrations {
  // Galileo
  verifyWork(work_id: string): Promise<VerificationResult>;

  // Payments
  payForWork(work_id: string): Promise<PaymentResult>;
  retryPayment(work_id: string): Promise<void>;

  // External Agents
  dispatchToAgent(work_id: string): Promise<DispatchResult>;
  pollAgent(work_id: string): Promise<PollResult>;

  // Context
  getContextSummary(job_id: string): Promise<string>;
  getContextRefs(job_id: string): Promise<ContextRef[]>;
  loadFullContent(work_id: string): Promise<unknown>;

  // Recovery
  recoverInFlightWork(): Promise<void>;
  handleAgentCallback(
    work_id: string,
    body: AgentCallbackRequest,
    rawBody: string,
    signatureHeader: string | undefined
  ): Promise<void>;

  // Security utilities
  verifyWebhookSignature(
    body: string,
    signature: string | undefined,
    webhookSecret: string
  ): boolean;

  // Event emission
  emitEvent(event: IntegrationEvent): void;
  subscribeToEvents(handler: (event: IntegrationEvent) => void): () => void;
}
```

---

## Error Handling

```typescript
class IntegrationError extends Error {
  constructor(
    message: string,
    public integration: "galileo" | "payments" | "external_agents",
    public retryable: boolean,
    public details?: Record<string, unknown>
  ) {
    super(message);
  }
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  backoffMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (error instanceof IntegrationError && !error.retryable) {
        throw error;
      }

      if (attempt < maxRetries) {
        await delay(backoffMs * Math.pow(2, attempt - 1));
      }
    }
  }

  throw lastError;
}
```

---

## Event Emission

Events are emitted throughout the integration flows for SSE streaming to the frontend and inter-module communication.

### Event Emitter Pattern

Uses Node.js EventEmitter for in-process event handling. Events are forwarded to SSE streams for real-time client updates.

```typescript
import { EventEmitter } from "events";

// Singleton event bus for the application
// In production, could be replaced with Redis pub/sub for multi-instance support
class IntegrationEventBus extends EventEmitter {
  private static instance: IntegrationEventBus;

  private constructor() {
    super();
    // Increase max listeners for high-concurrency scenarios
    this.setMaxListeners(100);
  }

  static getInstance(): IntegrationEventBus {
    if (!IntegrationEventBus.instance) {
      IntegrationEventBus.instance = new IntegrationEventBus();
    }
    return IntegrationEventBus.instance;
  }
}

const eventBus = IntegrationEventBus.getInstance();

// Type-safe event emission
interface IntegrationEvent {
  type: string;
  [key: string]: unknown;
}

/**
 * Emits an event to the event bus.
 * Events are consumed by:
 * - SSE handler (streams to frontend)
 * - Other modules (inter-module communication)
 */
function emitEvent(event: IntegrationEvent): void {
  eventBus.emit(event.type, event);
  // Also emit to a catch-all for SSE streaming
  eventBus.emit("*", event);
}

// Event subscription for SSE handler
function subscribeToEvents(
  handler: (event: IntegrationEvent) => void
): () => void {
  eventBus.on("*", handler);
  return () => eventBus.off("*", handler);
}
```

### Event Types (from this module)

| Event Type | Data | Emitted By |
|------------|------|------------|
| `work:verified` | `{ work_id, score, passed }` | `verifyWork()` |
| `work:retry` | `{ work_id, attempt, reason, issues }` | `verifyWork()` |
| `work:failed` | `{ work_id, reason }` | `verifyWork()` |
| `work:payment_confirmed` | `{ work_id, amount, tx_hash }` | `payForWork()` |
| `work:output_received` | `{ work_id, title, description, content }` | `dispatchToAgent()`, `pollAgent()`, `handleAgentCallback()` |
| `work:usage_recorded` | `{ work_id, agent_id, total_cost, has_breakdown }` | `storeExternalAgentUsage()` |

---

## Context Passing Rules

Different agents receive different context based on their role.

### Context Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CONTEXT HIERARCHY                                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ALWAYS AVAILABLE (lightweight)         LOADED ON DEMAND (heavy)            │
│  ─────────────────────────────          ────────────────────────            │
│                                                                              │
│  context_summary:                       work_items.output.content:          │
│  "Target: professionals 28-45.          {                                   │
│   Tone: empowering..."                    headlines: [                      │
│   (~100 words max)                          "Your focus. Amplified.",       │
│                                             ...                             │
│  context_refs: [                          ],                                │
│    {                                      rationale: "..."                  │
│      work_id: "work_002",              }                                    │
│      title: "Headlines",    ──────►                                         │
│      description: "5 headlines..."   (fetched only when needed)             │
│    }                                                                        │
│  ]                                                                          │
│                                                                              │
│  Agent sees INDEX (what exists)         Agent FETCHES specific content      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Context by Agent Type

```typescript
// What each agent type receives

interface PlanningAgentContext {
  // Initial planning - minimal context
  prompt: string;
  budget: number;
  // No prior context needed for first plan
}

interface PlanningAgentContinuationContext {
  // Continuation mode - index only, fetch on demand
  continuation_prompt: string;
  context_summary: string;              // Rolling summary (~100 words)
  context_refs: ContextRef[];           // Title + description only
  // Planning Agent can fetch full content via loadFullContent()
}

interface PromptAgentContext {
  // Prompt generation - summary + dependencies
  summary: string;                      // Rolling summary
  refs: ContextRef[];                   // Index of all work items
  loaded_content: Record<string, unknown>;  // Pre-loaded dependency outputs
  // Dependencies are automatically loaded based on action_item.depends_on
}

interface SynthesisContext {
  // Final brief (TODO #6) - all outputs loaded
  summary: string;
  all_outputs: Array<{
    title: string;
    content: unknown;  // Heterogeneous agent output
  }>;
  // This is the ONLY time we load all content
}
```

### Context Passing Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CONTEXT PASSING BY PHASE                                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TO PLANNING AGENT (initial):                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  {                                                                      ││
│  │    prompt: original_prompt,                                             ││
│  │    budget: budget.total                                                 ││
│  │  }                                                                      ││
│  │                                                                         ││
│  │  First step - no prior context needed.                                  ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  TO PROMPT AGENT (standard task):                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  {                                                                      ││
│  │    action_item: todo,                                                   ││
│  │    context: {                                                           ││
│  │      summary: context_summary,                                          ││
│  │      refs: context_refs,                                                ││
│  │      loaded_content: {                                                  ││
│  │        // Only dependencies for THIS task                               ││
│  │        "work_001": { strategy_content... }  // If depends_on includes 1 ││
│  │      }                                                                  ││
│  │    }                                                                    ││
│  │  }                                                                      ││
│  │                                                                         ││
│  │  Summary + dependency content. Others available via refs.              ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  TO PROMPT AGENT (synthesis task like TODO #6):                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  {                                                                      ││
│  │    action_item: { item: "Compile final brief", depends_on: [ALL] },    ││
│  │    context: {                                                           ││
│  │      summary: context_summary,                                          ││
│  │      refs: context_refs,                                                ││
│  │      loaded_content: {                                                  ││
│  │        "work_001": { ... },  // ALL outputs loaded                      ││
│  │        "work_002": { ... },                                             ││
│  │        "work_003": { ... },                                             ││
│  │        "work_004": { ... },                                             ││
│  │        "work_005": { ... }                                              ││
│  │      }                                                                  ││
│  │    }                                                                    ││
│  │  }                                                                      ││
│  │                                                                         ││
│  │  Synthesis = only time we load ALL content.                            ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  TO PLANNING AGENT (continuation):                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  User: "Make headline #3 shorter"                                       ││
│  │                                                                         ││
│  │  {                                                                      ││
│  │    continuation_prompt: "Make headline #3 shorter",                     ││
│  │    context_summary: "Target: professionals 28-45...",                   ││
│  │    context_refs: [                                                      ││
│  │      { work_id: "work_001", title: "Strategy", desc: "..." },          ││
│  │      { work_id: "work_002", title: "Headlines", desc: "5 headlines..." }││
│  │    ]                                                                    ││
│  │  }                                                                      ││
│  │                                                                         ││
│  │  Planning Agent:                                                        ││
│  │  1. Sees "Headlines" in context_refs                                    ││
│  │  2. Calls loadFullContent("work_002") to see actual headlines          ││
│  │  3. Creates plan to modify headline #3                                  ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Loading Rules

```typescript
type LoadingRule = {
  context: string;
  load: "none" | "dependencies_only" | "all";
  reason: string;
};

const LOADING_RULES: LoadingRule[] = [
  {
    context: "Initial planning",
    load: "none",
    reason: "No prior work exists"
  },
  {
    context: "Standard task execution",
    load: "dependencies_only",
    reason: "Only need outputs that this task depends on"
  },
  {
    context: "Synthesis task (final brief)",
    load: "all",
    reason: "Need to combine all outputs into final deliverable"
  },
  {
    context: "Continuation - identify what to modify",
    load: "none",
    reason: "Index (refs) is enough to identify target"
  },
  {
    context: "Continuation - execute modification",
    load: "dependencies_only",
    reason: "Only load the work item being modified"
  }
];

async function loadContextForTask(
  job_id: string,
  action_item: ActionItem
): Promise<{
  summary: string;
  refs: ContextRef[];
  loaded_content: Record<string, unknown>;
}> {
  // Always get summary and refs (lightweight)
  const summary = await getContextSummary(job_id);
  const refs = await getContextRefs(job_id);

  // Determine what to load
  const loaded_content: Record<string, unknown> = {};

  if (action_item.depends_on.includes("ALL")) {
    // Synthesis task - load everything
    for (const ref of refs) {
      loaded_content[ref.work_id] = await loadFullContent(ref.work_id);
    }
  } else if (action_item.depends_on.length > 0) {
    // Standard task - load dependencies only
    const dependencyWorks = await db.work_items.find({
      job_id,
      action_item_id: { $in: action_item.depends_on },
      status: "completed"
    });

    for (const work of dependencyWorks) {
      loaded_content[work.work_id] = work.output.content;
    }
  }
  // else: no dependencies, no content loaded

  return { summary, refs, loaded_content };
}
```

### Context Update After Work Completion

```typescript
interface ContextUpdate {
  context_summary: string;  // May be updated with new info
  new_ref: ContextRef;      // New work item reference
}

async function updateContextAfterWork(
  job_id: string,
  work_id: string
): Promise<void> {
  const work = await db.work_items.findOne({ work_id });
  const operations: LLMOperation[] = [];

  // 1. Generate title and description for this output
  const titleResult = await generateTitleAndDescription(work.output, work_id);
  operations.push(titleResult.operation);

  // 2. Add to context_refs
  await db.jobs.updateOne(
    { job_id },
    {
      $push: {
        context_refs: {
          work_id,
          action_item_id: work.action_item_id,
          title: titleResult.data.title,
          description: titleResult.data.description
        }
      }
    }
  );

  // 3. Update rolling summary if significant new info
  const summaryOperation = await updateContextSummary(job_id, work);
  if (summaryOperation) {
    operations.push(summaryOperation);
  }

  // 4. Update work item with internal operations (stored separately)
  const totalInternalCost = operations.reduce((sum, op) => sum + op.total_cost, 0);
  await db.work_items.updateOne(
    { work_id },
    {
      $push: { "token_usage.internal": { $each: operations } },
      $inc: {
        "token_usage.total_internal_cost_usd": totalInternalCost,
        "token_usage.total_cost_usd": totalInternalCost
      }
    }
  );

  // 5. Update job aggregate (each operation stored separately for visibility)
  await db.jobs.updateOne(
    { job_id },
    {
      $push: { "token_usage.operations": { $each: operations } },
      $inc: {
        "token_usage.total_internal_cost_usd": totalInternalCost,
        "token_usage.total_cost_usd": totalInternalCost
      }
    }
  );
}

// ============================================================================
// LIGHTWEIGHT LLM FOR SUMMARIZATION (via OpenRouter)
// ============================================================================
// These calls need a fast, cheap model for simple tasks (title/description).
// All calls go through OpenRouter for unified API and cost tracking.
//
// | Provider    | OpenRouter Model ID                  | Notes                    |
// |-------------|--------------------------------------|--------------------------|
// | Google      | google/gemini-2.5-flash              | Fast, cheap (default)    |
// | OpenAI      | openai/gpt-4o-mini                   | Reliable fallback        |
// | Meta        | meta-llama/llama-3.1-8b-instruct     | Very cheap               |
// | Mistral     | mistralai/mistral-7b-instruct        | Good quality/speed       |
//
// Configure via: SUMMARIZATION_MODEL env var or config
// ============================================================================

import OpenAI from "openai";

// OpenRouter client (same instance as ORCH_GRAPH)
const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": process.env.APP_URL,
    "X-Title": "AgentStack Summarization"
  }
});

const SUMMARIZATION_MODEL = process.env.SUMMARIZATION_MODEL || "google/gemini-2.5-flash";

// Result includes token usage for billing - stored as LLMOperation
interface SummarizationResult<T> {
  data: T;
  operation: LLMOperation;
}

async function generateTitleAndDescription(
  output: unknown,
  work_id: string
): Promise<SummarizationResult<{ title: string; description: string }>> {
  // Use OpenRouter with lightweight model for simple summarization
  const startTime = Date.now();

  const response = await openrouter.chat.completions.create({
    model: SUMMARIZATION_MODEL,
    messages: [
      {
        role: "system",
        content: "You are a concise summarizer. Return JSON only."
      },
      {
        role: "user",
        content: `Given this output, create:
- title: What this is (2-4 words)
- description: What it contains (20-30 words max)

Be specific. Don't use generic descriptions.
Example: {"title": "Ad Headlines", "description": "5 headline options. Lead: 'Your focus. Amplified.' Mix of statement and question formats."}

Output to summarize:
${JSON.stringify(output, null, 2)}`
      }
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 200
  });

  const content = JSON.parse(response.choices[0].message.content || "{}");
  const usage = response.usage;

  return {
    data: {
      title: content.title || "Output",
      description: content.description || "Work output"
    },
    operation: {
      operation_id: generateOperationId(),
      timestamp: new Date(),
      operation_type: "summarization",
      model: SUMMARIZATION_MODEL,
      native_tokens_prompt: usage?.prompt_tokens,
      native_tokens_completion: usage?.completion_tokens,
      total_cost: calculateSummarizationCost(SUMMARIZATION_MODEL, usage),
      metadata: {
        work_id,
        task: "title_description",
        duration_ms: Date.now() - startTime
      }
    }
  };
}

// Cost calculation for summarization models
function calculateSummarizationCost(
  model: string,
  usage: { prompt_tokens?: number; completion_tokens?: number }
): number {
  const PRICING: Record<string, { input: number; output: number }> = {
    "google/gemini-2.5-flash": { input: 0.075, output: 0.30 },
    "openai/gpt-4o-mini": { input: 0.15, output: 0.60 },
    "meta-llama/llama-3.1-8b-instruct": { input: 0.055, output: 0.055 },
    "mistralai/mistral-7b-instruct": { input: 0.06, output: 0.06 }
  };

  const pricing = PRICING[model] || { input: 0.1, output: 0.1 };
  const promptCost = ((usage?.prompt_tokens || 0) / 1_000_000) * pricing.input;
  const completionCost = ((usage?.completion_tokens || 0) / 1_000_000) * pricing.output;

  return promptCost + completionCost;
}

/**
 * Determines whether the context summary should be updated after work completion.
 * Uses simple heuristics to avoid unnecessary LLM calls for trivial outputs.
 *
 * Rules:
 * 1. Skip if output content is very short (< 100 characters)
 * 2. Skip if this is a retry attempt (summary already exists for this action)
 * 3. Always update for primary deliverables (strategy, final brief)
 * 4. Update if output introduces new key information
 */
function shouldUpdateSummary(
  currentSummary: string,
  output: { title?: string; description?: string; content?: unknown }
): boolean {
  // Always update if no summary exists yet
  if (!currentSummary || currentSummary.trim().length === 0) {
    return true;
  }

  // Check if output has meaningful content
  const contentStr = typeof output.content === "string"
    ? output.content
    : JSON.stringify(output.content || {});

  // Skip very short outputs (likely trivial or partial)
  if (contentStr.length < 100) {
    return false;
  }

  // Always update for strategy-related outputs (primary deliverables)
  const title = (output.title || "").toLowerCase();
  const primaryDeliverables = ["strategy", "brief", "plan", "campaign", "summary"];
  if (primaryDeliverables.some(term => title.includes(term))) {
    return true;
  }

  // Update if description suggests significant new information
  const description = (output.description || "").toLowerCase();
  if (description.length > 50) {
    return true;
  }

  // Default: update for substantial content
  return contentStr.length > 500;
}

async function updateContextSummary(
  job_id: string,
  work: WorkItem
): Promise<LLMOperation | null> {
  const job = await db.jobs.findOne({ job_id });
  const currentSummary = job.context_summary || "";

  // Only update if this work adds significant new information
  const shouldUpdate = await shouldUpdateSummary(currentSummary, work.output);

  if (shouldUpdate) {
    const startTime = Date.now();

    // Use OpenRouter with lightweight model
    const response = await openrouter.chat.completions.create({
      model: SUMMARIZATION_MODEL,
      messages: [
        {
          role: "system",
          content: "You are a concise context summarizer. Return plain text summary only."
        },
        {
          role: "user",
          content: `Current summary: "${currentSummary}"

New output completed: ${work.output.title}
${work.output.description}

Update the summary to incorporate key new information.
Keep it under 100 words. Focus on what future tasks need to know.`
        }
      ],
      temperature: 0.3,
      max_tokens: 200
    });

    const newSummary = response.choices[0].message.content || currentSummary;
    const usage = response.usage;

    await db.jobs.updateOne(
      { job_id },
      { $set: { context_summary: newSummary } }
    );

    return {
      operation_id: generateOperationId(),
      timestamp: new Date(),
      operation_type: "summarization",
      model: SUMMARIZATION_MODEL,
      native_tokens_prompt: usage?.prompt_tokens,
      native_tokens_completion: usage?.completion_tokens,
      total_cost: calculateSummarizationCost(SUMMARIZATION_MODEL, usage),
      metadata: {
        work_id: work.work_id,
        task: "context_summary",
        duration_ms: Date.now() - startTime
      }
    };
  }

  return null;  // No update needed, no cost incurred
}
```

### When to Fetch Content

```typescript
// Decision table for content loading

type FetchDecision = {
  request_type: string;
  what_to_load: string;
  example: string;
};

const FETCH_DECISIONS: FetchDecision[] = [
  {
    request_type: "Make headline #3 shorter",
    what_to_load: "work_002 only (headlines)",
    example: "Need to see headlines to identify #3"
  },
  {
    request_type: "Add TikTok script",
    what_to_load: "work_001 only (strategy)",
    example: "Need tone/audience context, not existing outputs"
  },
  {
    request_type: "Make images match playful tone",
    what_to_load: "work_004, work_005 (images)",
    example: "Need to see current images to understand what to change"
  },
  {
    request_type: "Rewrite everything for Gen Z",
    what_to_load: "work_001 (strategy)",
    example: "Need current approach, will regenerate everything"
  },
  {
    request_type: "Add more headlines like #2",
    what_to_load: "work_002 only (headlines)",
    example: "Need to see what #2 looks like as reference"
  }
];
```
