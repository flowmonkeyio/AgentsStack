# Module: PAYMENTS

x402 protocol + CDP wallet integration.

---

## Scope

**Owns:**
- CDP wallet integration (Coinbase Developer Platform)
- x402 payment execution
- Transaction creation and confirmation
- Payment retry logic
- Wallet setup for users and agents

**Does NOT own:**
- Payment decision logic (that's ORCHESTRATION - pays only after verification)
- Transaction storage (that's DATA)
- Budget management (that's ORCHESTRATION)

---

## Payment Philosophy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  OUR MODEL: VERIFY BEFORE PAY                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  x402 Direct (their default):     Our Platform:                             │
│                                                                              │
│  User ──► Agent                   User ──► Platform ──► Agent               │
│     (pay or no output)                         │                            │
│                                                ├── Verify (Galileo)         │
│  Agent holds output hostage                    ├── Pass? → Pay agent        │
│  "Pay me first"                                └── Fail? → No payment       │
│                                                                              │
│  Trust: Agent                     Trust: Verification                       │
│  Leverage: Agent has it           Leverage: Platform has it                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

Why this is better:
- Users protected from paying for substandard work
- Agents incentivized to produce quality
- Bad agents naturally filtered out
```

---

## Payment Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PAYMENT FLOW                                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐         │
│  │     USER     │         │   PLATFORM   │         │    AGENT     │         │
│  │   (wallet)   │         │   (system)   │         │   (wallet)   │         │
│  └──────┬───────┘         └──────┬───────┘         └──────┬───────┘         │
│         │                        │                        │                 │
│         │  1. Create job         │                        │                 │
│         │     with budget        │                        │                 │
│         │ ─────────────────────► │                        │                 │
│         │     (funds reserved)   │                        │                 │
│         │                        │                        │                 │
│         │                        │  2. Work completed     │                 │
│         │                        │     & verified         │                 │
│         │                        │     (Galileo >= 0.9)   │                 │
│         │                        │                        │                 │
│         │                        │  3. Execute payment    │                 │
│         │                        │ ─────────────────────► │                 │
│         │                        │     x402 / USDC        │                 │
│         │                        │                        │                 │
│         │                        │  4. Confirm tx         │                 │
│         │                        │ ◄───────────────────── │                 │
│         │                        │                        │                 │
│         │                        │  5. Log transaction    │                 │
│         │                        │     Update budget      │                 │
│         │                        │                        │                 │
└─────────┴────────────────────────┴────────────────────────┴─────────────────┘
```

---

## CDP Wallet Types

### User Wallet

```typescript
interface UserWallet {
  type: "embedded" | "external";

  // Embedded wallet (CDP-managed)
  cdp_wallet_id?: string;
  address: string;

  // External wallet (user-managed)
  provider?: "metamask" | "walletconnect" | "coinbase_wallet";
  verified: boolean;
}
```

### Agent Wallet

```typescript
interface AgentWallet {
  // Agents always use external wallets
  address: string;
  verified: boolean;
}
```

### Platform Wallet (System)

```typescript
interface PlatformWallet {
  // Platform may use server-side CDP wallet
  type: "cdp_server";
  cdp_wallet_id: string;
  address: string;
}
```

---

## Payment Execution

### Pay Request

```typescript
interface PaymentRequest {
  work_id: string;
  job_id: string;
  user_id: string;
  agent_id: string;

  amount: number;
  currency: "USDC";

  from_address: string;   // User's wallet
  to_address: string;     // Agent's wallet

  reason: string;         // "Work completed, score 0.94"
}
```

### Pay Response

```typescript
interface PaymentResponse {
  success: boolean;
  tx_hash?: string;
  error?: string;
  retry_suggested?: boolean;
}
```

### Payment Execution Flow

```typescript
async function executePayment(request: PaymentRequest): Promise<PaymentResponse> {
  try {
    // 1. Validate addresses
    if (!isValidAddress(request.from_address) || !isValidAddress(request.to_address)) {
      return { success: false, error: "Invalid wallet address" };
    }

    // 2. Check balance
    const balance = await getBalance(request.from_address);
    if (balance < request.amount) {
      return { success: false, error: "Insufficient balance" };
    }

    // 3. Execute x402 payment
    const tx = await x402.transfer({
      from: request.from_address,
      to: request.to_address,
      amount: request.amount,
      currency: request.currency,
      memo: `AgentStack: ${request.work_id}`
    });

    // 4. Wait for confirmation
    const confirmed = await waitForConfirmation(tx.hash, {
      timeout: 60000,  // 1 minute
      confirmations: 1
    });

    if (!confirmed) {
      return {
        success: false,
        error: "Transaction not confirmed",
        retry_suggested: true
      };
    }

    return {
      success: true,
      tx_hash: tx.hash
    };

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const isRetryable = error instanceof Error && isRetryableError(error);
    return {
      success: false,
      error: message,
      retry_suggested: isRetryable
    };
  }
}
```

---

## x402 Protocol Integration

### Protocol Overview

x402 uses HTTP 402 "Payment Required" status for machine-to-machine payments.

**Our usage:** We don't use HTTP 402 flow (agent-holds-hostage model). We pay AFTER verification.

```typescript
// Direct x402 transfer (post-verification)
interface X402Transfer {
  from: string;           // Payer address
  to: string;             // Payee address
  amount: number;         // Amount in USDC
  currency: "USDC";
  memo?: string;          // Reference info
}

// x402 SDK usage
import { x402 } from '@coinbase/x402';

const result = await x402.transfer({
  from: userWallet.address,
  to: agentWallet.address,
  amount: 0.05,
  currency: "USDC",
  memo: "work_001"
});
```

---

## CDP Wallet SDK Integration

### Server-Side Wallet (Platform)

```typescript
import { CoinbaseCDP } from '@coinbase/cdp-sdk';

// Initialize CDP
const cdp = new CoinbaseCDP({
  apiKey: process.env.CDP_API_KEY,
  apiSecret: process.env.CDP_API_SECRET
});

// Create server wallet for platform
const platformWallet = await cdp.createWallet({
  network: "base-mainnet"  // or "base-sepolia" for testnet
});
```

### Embedded Wallet (Users)

```typescript
// For users who don't have a wallet
// CDP Embedded Wallets are created on-demand

const userWallet = await cdp.createEmbeddedWallet({
  userId: user.user_id,
  network: "base-mainnet"
});

// User can later export/migrate to external wallet
```

---

## Transaction States

```typescript
type PaymentStatus =
  | "pending"       // Payment initiated
  | "processing"    // Transaction submitted
  | "confirmed"     // Transaction confirmed on-chain
  | "failed"        // Transaction failed
  | "refunded";     // Payment reversed (rare)
```

### State Transitions

```
pending → processing → confirmed
              ↓
           failed → (retry) → processing
```

---

## Payment Retry Logic

```typescript
interface PaymentRetryConfig {
  max_retries: number;      // 3
  retry_delay_ms: number;   // 5000 (5 seconds)
  backoff_multiplier: number; // 2
}

async function payWithRetry(
  request: PaymentRequest,
  config: PaymentRetryConfig = { max_retries: 3, retry_delay_ms: 5000, backoff_multiplier: 2 }
): Promise<PaymentResponse> {
  let lastError: string | undefined;
  let delay = config.retry_delay_ms;

  for (let attempt = 1; attempt <= config.max_retries; attempt++) {
    const result = await executePayment(request);

    if (result.success) {
      return result;
    }

    if (!result.retry_suggested) {
      // Non-retryable error
      return result;
    }

    lastError = result.error;
    await sleep(delay);
    delay *= config.backoff_multiplier;
  }

  return {
    success: false,
    error: `Payment failed after ${config.max_retries} attempts: ${lastError}`
  };
}
```

---

## Transaction Logging

Every payment creates a transaction record:

```typescript
interface TransactionRecord {
  tx_id: string;
  job_id: string;
  work_id: string;
  user_id: string;
  agent_id: string;

  amount: number;
  currency: "USDC";
  protocol: "x402";
  tx_hash: string;

  status: PaymentStatus;

  audit: {
    reason: string;           // "Work completed, score 0.92"
    approved_by: string;      // "main_agent"
    budget_before: number;
    budget_after: number;
  };

  created_at: Date;
  confirmed_at: Date | null;
}
```

---

## Budget Management Integration

### Transaction Lifecycle

Transactions follow a clear lifecycle with distinct creation and confirmation steps:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  TRANSACTION LIFECYCLE                                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. initiatePayment()       → Creates Transaction (status: "pending")       │
│                             → Updates WorkItem.payment.status = "processing"│
│                                                                              │
│  2. executePayment()        → Executes x402 transfer                        │
│                             → Returns tx_hash on success                    │
│                                                                              │
│  3. onPaymentConfirmed()    → UPDATES existing Transaction (status: "confirmed")
│                             → Updates WorkItem.payment with tx_hash         │
│                             → Updates Job budget                            │
│                             → Updates Agent stats                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Step 1: Initiate Payment (Create Transaction)

Called before executing the actual payment. Creates the transaction record in pending state.

```typescript
interface InitiatePaymentParams {
  work_id: string;
  job_id: string;
  user_id: string;
  agent_id: string;
  amount: number;
  reason: string;
}

async function initiatePayment(
  db: DatabaseClient,
  params: InitiatePaymentParams
): Promise<{ tx_id: string }> {
  // 1. Get current budget for audit
  const job = await db.getJob(params.job_id);
  if (!job) {
    throw new Error(`Job not found: ${params.job_id}`);
  }

  // 2. Create transaction record (pending)
  const tx_id = generateTxId();
  await db.createTransaction({
    tx_id,
    job_id: params.job_id,
    work_id: params.work_id,
    user_id: params.user_id,
    agent_id: params.agent_id,
    amount: params.amount,
    currency: "USDC",
    protocol: "x402",
    tx_hash: "",  // Empty until confirmed
    status: "pending",
    audit: {
      reason: params.reason,
      approved_by: "main_agent",
      budget_before: job.budget.spent,
      budget_after: job.budget.spent + params.amount
    },
    confirmed_at: null
  });

  // 3. Update work item payment status to processing
  await db.updateWorkItemPayment(params.work_id, {
    status: "processing",
    amount: params.amount,
    tx_hash: null,
    original_price: params.amount,
    negotiated_price: params.amount,
    error: null,
    retry_count: 0,
    initiated_at: new Date(),
    confirmed_at: null
  });

  return { tx_id };
}
```

### Step 2: On Payment Confirmed (Update Existing Transaction)

Called after `executePayment()` succeeds. **Updates the existing transaction** - does NOT create a new one.

```typescript
interface PaymentConfirmationParams {
  tx_id: string;         // Transaction ID from initiatePayment()
  tx_hash: string;       // Blockchain transaction hash from executePayment()
  work_id: string;
  job_id: string;
  agent_id: string;
  amount: number;
}

async function onPaymentConfirmed(
  db: DatabaseClient,
  params: PaymentConfirmationParams
): Promise<void> {
  const now = new Date();

  // 1. UPDATE existing transaction (not create new)
  await db.updateTransactionStatus(params.tx_id, "confirmed");
  await db.updateTransactionTxHash(params.tx_id, params.tx_hash);

  // 2. Update work item payment
  await db.updateWorkItemPayment(params.work_id, {
    status: "confirmed",
    tx_hash: params.tx_hash,
    confirmed_at: now,
    error: null
  });

  // 3. Update job budget
  const job = await db.getJob(params.job_id);
  if (job) {
    await db.updateJobBudget(params.job_id, {
      ...job.budget,
      spent: job.budget.spent + params.amount,
      remaining: job.budget.remaining - params.amount
    });
  }

  // 4. Update agent stats
  await db.updateAgentStats(params.agent_id, {
    jobs_completed: 1  // Incremented via $inc internally
  });

  // 5. Update work item status to completed
  await db.updateWorkItemStatus(params.work_id, "completed");
}
```

### Step 3: On Payment Failed

Called when `executePayment()` fails after all retries.

```typescript
async function onPaymentFailed(
  db: DatabaseClient,
  params: { tx_id: string; work_id: string; error: string }
): Promise<void> {
  // 1. Update transaction status
  await db.updateTransactionStatus(params.tx_id, "failed");

  // 2. Update work item payment
  await db.updateWorkItemPayment(params.work_id, {
    status: "failed",
    error: params.error
  });

  // 3. Update work item status
  await db.updateWorkItemStatus(params.work_id, "failed");
}
```

---

## Interface: Dependencies

| Module | What We Need | Interface |
|--------|--------------|-----------|
| **DATA** | Store transactions, update budgets | `DatabaseClient` |

**External dependencies:**
- Coinbase CDP SDK (`@coinbase/cdp-sdk`)
- x402 SDK (`@coinbase/x402`)
- Base network (Ethereum L2)

### Required DatabaseClient Extensions

The Payments module requires the following methods to be added to the `DatabaseClient` interface (in `db/client.ts`):

```typescript
// ADDITIONS TO DatabaseClient INTERFACE
// These methods must be added to support payment operations

interface DatabaseClient {
  // ... existing methods ...

  // === NEW: Payment-specific methods ===

  /**
   * Update work item payment fields.
   * Supports partial updates - only provided fields are updated.
   */
  updateWorkItemPayment(
    work_id: string,
    payment: Partial<WorkItem['payment']>
  ): Promise<void>;

  /**
   * Update transaction tx_hash after blockchain confirmation.
   * Separate from updateTransactionStatus for atomic updates.
   */
  updateTransactionTxHash(tx_id: string, tx_hash: string): Promise<void>;
}
```

**Implementation notes:**

```typescript
// db/client.ts - Implementation additions

async updateWorkItemPayment(
  work_id: string,
  payment: Partial<NonNullable<WorkItem['payment']>>
): Promise<void> {
  const updateFields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payment)) {
    if (value !== undefined) {
      updateFields[`payment.${key}`] = value;
    }
  }

  await this.db.collection('work_items').updateOne(
    { work_id },
    { $set: updateFields }
  );
}

async updateTransactionTxHash(tx_id: string, tx_hash: string): Promise<void> {
  await this.db.collection('transactions').updateOne(
    { tx_id },
    {
      $set: {
        tx_hash,
        confirmed_at: new Date()
      }
    }
  );
}
```

---

## Interface: Provides

### PaymentClient

```typescript
interface PaymentClient {
  // Execute payment
  pay(request: PaymentRequest): Promise<PaymentResponse>;

  // Check payment status
  getPaymentStatus(tx_hash: string): Promise<PaymentStatus>;

  // Wallet operations
  getBalance(address: string): Promise<number>;
  validateAddress(address: string): boolean;

  // For embedded wallets
  createEmbeddedWallet(user_id: string): Promise<UserWallet>;
}
```

### Factory

```typescript
interface PaymentClientConfig {
  cdpApiKey: string;
  cdpApiSecret: string;
  network: "base-mainnet" | "base-sepolia";
}

function createPaymentClient(config: PaymentClientConfig): PaymentClient;
```

### Factory Implementation

The `createPaymentClient()` factory returns a `PaymentClient` implementation that wraps the CDP and x402 SDKs.

```typescript
// lib/payments/client.ts

import { CoinbaseCDP } from '@coinbase/cdp-sdk';
import { x402 } from '@coinbase/x402';

class PaymentClientImpl implements PaymentClient {
  private cdp: CoinbaseCDP;
  private network: "base-mainnet" | "base-sepolia";

  constructor(config: PaymentClientConfig) {
    this.cdp = new CoinbaseCDP({
      apiKey: config.cdpApiKey,
      apiSecret: config.cdpApiSecret
    });
    this.network = config.network;
  }

  async pay(request: PaymentRequest): Promise<PaymentResponse> {
    return executePayment(request);
  }

  async getPaymentStatus(tx_hash: string): Promise<PaymentStatus> {
    try {
      const status = await this.cdp.getTransactionStatus(tx_hash);
      // Map CDP status to our PaymentStatus
      if (status.confirmed) return "confirmed";
      if (status.failed) return "failed";
      return "processing";
    } catch (error: unknown) {
      // Transaction not found or network error
      return "pending";
    }
  }

  async getBalance(address: string): Promise<number> {
    const balance = await this.cdp.getBalance({
      address,
      currency: "USDC",
      network: this.network
    });
    return balance.amount;
  }

  validateAddress(address: string): boolean {
    // Ethereum address validation
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  async createEmbeddedWallet(user_id: string): Promise<UserWallet> {
    const wallet = await this.cdp.createEmbeddedWallet({
      userId: user_id,
      network: this.network
    });
    return {
      type: "embedded",
      cdp_wallet_id: wallet.id,
      address: wallet.address,
      verified: true  // CDP wallets are auto-verified
    };
  }
}

export function createPaymentClient(config: PaymentClientConfig): PaymentClient {
  return new PaymentClientImpl(config);
}
```

### Default Client Initialization

```typescript
// lib/payments/index.ts

let defaultClient: PaymentClient | null = null;

export function getPaymentClient(): PaymentClient {
  if (!defaultClient) {
    defaultClient = createPaymentClient({
      cdpApiKey: process.env.CDP_API_KEY!,
      cdpApiSecret: process.env.CDP_API_SECRET!,
      network: process.env.CDP_NETWORK as "base-mainnet" | "base-sepolia"
    });
  }
  return defaultClient;
}

// For testing - allows injecting mock client
export function setPaymentClient(client: PaymentClient): void {
  defaultClient = client;
}
```

---

## File Structure

```
lib/payments/
├── client.ts       # PaymentClientImpl + createPaymentClient()
├── x402.ts         # x402 protocol helpers (executePayment, waitForConfirmation)
├── wallet.ts       # Wallet utilities (validateAddress, getBalance)
├── lifecycle.ts    # Transaction lifecycle (initiatePayment, onPaymentConfirmed, onPaymentFailed)
├── retry.ts        # Retry logic (payWithRetry, isRetryableError)
├── types.ts        # Type definitions (PaymentRequest, PaymentResponse, etc.)
└── index.ts        # Public exports

types/
└── data.ts         # Core types (already exists - UserWallet types align with User.wallet)
```

### File Contents Summary

| File | Exports | Purpose |
|------|---------|---------|
| `client.ts` | `PaymentClientImpl`, `createPaymentClient` | Main client implementation |
| `x402.ts` | `executePayment`, `waitForConfirmation` | x402 transfer execution |
| `wallet.ts` | `validateAddress`, `getBalance`, `isValidAddress` | Wallet utilities |
| `lifecycle.ts` | `initiatePayment`, `onPaymentConfirmed`, `onPaymentFailed` | Transaction state management |
| `retry.ts` | `payWithRetry`, `isRetryableError`, `RETRYABLE_ERRORS`, `FATAL_ERRORS` | Retry with backoff |
| `types.ts` | All interfaces and types | Type definitions |
| `index.ts` | Re-exports all public APIs | Module entry point |

---

## Environment Configuration

```bash
# CDP credentials
CDP_API_KEY=<your_cdp_api_key>
CDP_API_SECRET=<your_cdp_api_secret>

# Network
CDP_NETWORK=base-mainnet  # or base-sepolia for testnet

# Platform wallet (pre-created)
PLATFORM_WALLET_ID=<platform_wallet_id>
PLATFORM_WALLET_ADDRESS=0x...
```

---

## Error Handling

```typescript
// Retryable errors
const RETRYABLE_ERRORS = [
  "NETWORK_ERROR",
  "TIMEOUT",
  "RATE_LIMITED",
  "NONCE_TOO_LOW"
];

// Non-retryable errors
const FATAL_ERRORS = [
  "INSUFFICIENT_BALANCE",
  "INVALID_ADDRESS",
  "CONTRACT_REVERT",
  "SIGNATURE_INVALID"
];

function isRetryableError(error: Error): boolean {
  return RETRYABLE_ERRORS.some(code => error.message.includes(code));
}
```

---

## Testnet vs Mainnet

| Environment | Network | Currency |
|-------------|---------|----------|
| Development | base-sepolia | Test USDC |
| Staging | base-sepolia | Test USDC |
| Production | base-mainnet | Real USDC |

```typescript
const network = process.env.NODE_ENV === 'production'
  ? 'base-mainnet'
  : 'base-sepolia';
```

---

## Complete Payment Orchestration Example

This example shows the full end-to-end payment flow as called by the Orchestration module after work verification passes.

```typescript
// Called by Orchestration module after Galileo verification passes

import { DatabaseClient } from '../db/client';
import {
  getPaymentClient,
  initiatePayment,
  payWithRetry,
  onPaymentConfirmed,
  onPaymentFailed,
  PaymentRequest
} from '../lib/payments';

async function processPaymentForVerifiedWork(
  db: DatabaseClient,
  workItem: WorkItem,
  job: Job,
  agent: Agent
): Promise<{ success: boolean; error?: string }> {

  // 1. Prepare payment request
  const paymentRequest: PaymentRequest = {
    work_id: workItem.work_id,
    job_id: workItem.job_id,
    user_id: job.user_id,
    agent_id: agent.agent_id,
    amount: workItem.agent?.price ?? 0,
    currency: "USDC",
    from_address: (await db.getUser(job.user_id))?.wallet.address ?? "",
    to_address: agent.wallet,
    reason: `Work completed, score ${workItem.verification?.score ?? 0}`
  };

  // 2. Validate addresses
  const paymentClient = getPaymentClient();
  if (!paymentClient.validateAddress(paymentRequest.from_address)) {
    return { success: false, error: "Invalid user wallet address" };
  }
  if (!paymentClient.validateAddress(paymentRequest.to_address)) {
    return { success: false, error: "Invalid agent wallet address" };
  }

  // 3. Initiate payment (creates transaction record)
  const { tx_id } = await initiatePayment(db, {
    work_id: paymentRequest.work_id,
    job_id: paymentRequest.job_id,
    user_id: paymentRequest.user_id,
    agent_id: paymentRequest.agent_id,
    amount: paymentRequest.amount,
    reason: paymentRequest.reason
  });

  // 4. Update work item status
  await db.updateWorkItemStatus(paymentRequest.work_id, "paying");

  // 5. Execute payment with retry
  const result = await payWithRetry(paymentRequest);

  // 6. Handle result
  if (result.success && result.tx_hash) {
    await onPaymentConfirmed(db, {
      tx_id,
      tx_hash: result.tx_hash,
      work_id: paymentRequest.work_id,
      job_id: paymentRequest.job_id,
      agent_id: paymentRequest.agent_id,
      amount: paymentRequest.amount
    });
    return { success: true };
  } else {
    await onPaymentFailed(db, {
      tx_id,
      work_id: paymentRequest.work_id,
      error: result.error ?? "Unknown payment error"
    });
    return { success: false, error: result.error };
  }
}
```

### Error Recovery Flow

If payment fails, the Orchestration module can retry or escalate:

```typescript
// In Orchestration module
if (!paymentResult.success) {
  // Update work item to payment_retry state
  await db.updateWorkItemStatus(workItem.work_id, "payment_retry");
  await db.updateWorkItemPayment(workItem.work_id, {
    error: paymentResult.error,
    retry_count: (workItem.payment?.retry_count ?? 0) + 1
  });

  // Check if max retries exceeded
  if ((workItem.payment?.retry_count ?? 0) >= 3) {
    // Mark as permanently failed
    await db.updateWorkItemStatus(workItem.work_id, "failed");
    // Alert human operator (not in scope of this module)
  }
}
```
