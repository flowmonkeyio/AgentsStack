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

  } catch (error) {
    return {
      success: false,
      error: error.message,
      retry_suggested: isRetryableError(error)
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

After payment confirmation:

```typescript
async function onPaymentConfirmed(payment: PaymentResponse, request: PaymentRequest) {
  // 1. Update work item
  await db.work_items.updateOne(
    { work_id: request.work_id },
    {
      $set: {
        "payment.status": "confirmed",
        "payment.tx_hash": payment.tx_hash,
        "payment.confirmed_at": new Date()
      }
    }
  );

  // 2. Update job budget
  await db.jobs.updateOne(
    { job_id: request.job_id },
    {
      $inc: {
        "budget.spent": request.amount,
        "budget.remaining": -request.amount
      }
    }
  );

  // 3. Create transaction record
  await db.transactions.insertOne({
    tx_id: generateTxId(),
    job_id: request.job_id,
    work_id: request.work_id,
    user_id: request.user_id,
    agent_id: request.agent_id,
    amount: request.amount,
    currency: "USDC",
    protocol: "x402",
    tx_hash: payment.tx_hash,
    status: "confirmed",
    audit: {
      reason: request.reason,
      approved_by: "main_agent",
      budget_before: currentBudget.spent,
      budget_after: currentBudget.spent + request.amount
    },
    created_at: new Date(),
    confirmed_at: new Date()
  });

  // 4. Update agent stats
  await db.agents.updateOne(
    { agent_id: request.agent_id },
    { $inc: { "stats.jobs_completed": 1 } }
  );
}
```

---

## Interface: Dependencies

| Module | What We Need | Interface |
|--------|--------------|-----------|
| **DATA** | Store transactions, update budgets | `DatabaseClient` |

**External dependencies:**
- Coinbase CDP SDK
- x402 SDK
- Base network (Ethereum L2)

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
function createPaymentClient(config: {
  cdpApiKey: string;
  cdpApiSecret: string;
  network: "base-mainnet" | "base-sepolia";
}): PaymentClient;
```

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
