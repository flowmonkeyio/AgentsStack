# Module: FRONTEND

Next.js UI - job creation, real-time updates, output display.

---

## Scope

**Owns:**
- Next.js pages and components
- SSE consumption and state management
- Job creation form
- Real-time work item display
- Output rendering (text, images)
- Reasoning log display
- User continuation input
- Error handling UI

**Does NOT own:**
- API implementation (that's API)
- Business logic (that's ORCHESTRATION)
- Authentication provider (uses external: Clerk/Auth0)

---

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS
- **State:** React hooks + Context (or Zustand if needed)
- **Auth:** Clerk or Auth0
- **SSE:** Native EventSource API

---

## Page Structure

```
/app
├── page.tsx                    # Landing / Dashboard
├── jobs/
│   ├── new/
│   │   └── page.tsx           # Create new job
│   └── [job_id]/
│       └── page.tsx           # Job detail + real-time view
├── layout.tsx                  # Root layout with auth
└── api/                        # API routes (see MODULE_API)
```

---

## Components

### 1. JobCreationForm

Create a new job with prompt and budget.

```typescript
interface JobCreationFormProps {
  onSubmit: (data: { prompt: string; budget: number }) => Promise<void>;
  isLoading: boolean;
}

// Fields:
// - prompt: textarea (required, min 10 chars)
// - budget: number input (required, min 0.01)
// - context fields: optional expandable section
```

**UI States:**
- Idle: Form ready for input
- Submitting: Button disabled, spinner
- Error: Show validation errors
- Success: Redirect to job detail page

---

### 2. JobStatusBadge

Display current job status.

```typescript
interface JobStatusBadgeProps {
  status: "planning" | "plan_verification" | "executing" | "completed" | "failed";
}

// Visual mapping:
// planning → yellow, pulsing
// plan_verification → yellow
// executing → blue, pulsing
// completed → green
// failed → red
```

---

### 3. WorkItemList

Display all work items for a job.

```typescript
interface WorkItemListProps {
  workItems: WorkItemDisplay[];
  onItemClick?: (work_id: string) => void;
}

interface WorkItemDisplay {
  work_id: string;
  action_item_id: number;
  action: string;
  status: WorkItemStatus;
  output?: WorkItemOutput;
  verification?: {
    score: number;
    passed: boolean;
  };
  payment?: {
    amount: number;
    confirmed: boolean;
  };
}

// Discriminated union for type-safe output content
type OutputContent =
  | { type: "text"; data: string }
  | { type: "image"; data: ImageOutput }
  | { type: "json"; data: Record<string, unknown> }
  | { type: "markdown"; data: string };

interface WorkItemOutput {
  title: string;
  description: string;
  content: OutputContent;
}
```

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│  #1 Create campaign strategy                          ✓ $0.05  │
│  ├─ Status: completed                                           │
│  └─ Score: 94%                                                  │
├─────────────────────────────────────────────────────────────────┤
│  #2 Write headlines                                   ⟳ polling │
│  ├─ Status: polling (attempt 1)                                 │
│  └─ Waiting for agent response...                               │
├─────────────────────────────────────────────────────────────────┤
│  #3 Write social posts                                ○ pending │
│  └─ Waiting for: #1                                             │
└─────────────────────────────────────────────────────────────────┘
```

---

### 4. WorkItemCard

Detailed view of a single work item.

```typescript
interface WorkItemCardProps {
  workItem: WorkItemDisplay;
  expanded?: boolean;
}

// Sections:
// - Header: action + status badge
// - Output: title, description, content (expandable)
// - Verification: score bar, criteria checklist
// - Payment: amount, tx hash (link to explorer)
// - Retries: if any, show retry history
```

---

### 5. OutputRenderer

Render different output types with type-safe discriminated union.

```typescript
// Use the shared OutputContent type for type-safe rendering
interface OutputRendererProps {
  content: OutputContent;
}

// Rendering by content.type:
// - "text": plain text in <p> tags
// - "image": <img> with src (base64 or URL), lazy loading
// - "json": formatted JSON viewer with syntax highlighting
// - "markdown": rendered markdown via react-markdown
```

**Image Display:**
```typescript
// Images appear in real-time as they're generated
interface ImageOutput {
  url: string;
  alt: string;
  width?: number;
  height?: number;
}
```

**Implementation Pattern:**
```typescript
function OutputRenderer({ content }: OutputRendererProps) {
  switch (content.type) {
    case "text":
      return <p className="whitespace-pre-wrap">{content.data}</p>;

    case "image":
      return (
        <img
          src={content.data.url}
          alt={content.data.alt}
          width={content.data.width}
          height={content.data.height}
          loading="lazy"
          className="max-w-full h-auto rounded-lg"
        />
      );

    case "json":
      return (
        <pre className="bg-gray-100 p-4 rounded overflow-auto">
          <code>{JSON.stringify(content.data, null, 2)}</code>
        </pre>
      );

    case "markdown":
      return <ReactMarkdown>{content.data}</ReactMarkdown>;

    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = content;
      return null;
  }
}
```

---

### 6. ReasoningLog

Display agent reasoning for transparency.

```typescript
interface ReasoningLogProps {
  entries: ReasoningEntry[];
  maxEntries?: number;  // Default: show latest 10
}

interface ReasoningEntry {
  ts: string;
  agent: "main" | "planning" | "plan_verifier" | "prompt";
  step: string;
  thought: string;
  decision?: string;
}
```

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│  REASONING LOG                                         [Expand] │
├─────────────────────────────────────────────────────────────────┤
│  15:30:01 [planning] analyze_prompt                             │
│  "User wants a marketing campaign for productivity app..."     │
│                                                                 │
│  15:30:03 [planning] select_agents                              │
│  "Selecting ContentStrategist for strategy task..."            │
│  Decision: agent_strategist_001                                 │
│                                                                 │
│  15:30:05 [plan_verifier] validate                              │
│  "Checking dependencies... all valid"                          │
│  Decision: PASS                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 7. ContinuationInput

Input for user to continue/refine the job.

```typescript
interface ContinuationInputProps {
  job_id: string;
  onSubmit: (prompt: string) => Promise<void>;
  disabled?: boolean;  // Disabled while job is running
}

// Only enabled when job status is "completed"
```

**UI:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Want to refine the output?                                     │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Make it more playful and add a TikTok script...          │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                              [Continue] button  │
└─────────────────────────────────────────────────────────────────┘
```

---

### 8. BudgetDisplay

Show budget allocation and spending.

```typescript
interface BudgetDisplayProps {
  budget: {
    total: number;
    allocated: number;
    spent: number;
    remaining: number;
  };
}

// Visual: progress bar showing spent vs total
// Colors: spent (green), allocated (yellow), remaining (gray)
```

---

### 9. PaymentTrail

Show all payments made for the job.

```typescript
interface PaymentTrailProps {
  payments: Array<{
    work_id: string;
    action: string;
    agent_name: string;
    amount: number;
    tx_hash: string;
    confirmed_at: string;
  }>;
}

// Each payment links to blockchain explorer
```

---

## SSE Integration

### useJobStream Hook

```typescript
// Reconnection configuration
interface ReconnectionConfig {
  initialDelayMs: number;      // 1000 (1 second)
  maxDelayMs: number;          // 30000 (30 seconds)
  backoffMultiplier: number;   // 2
  maxAttempts: number;         // 10
  jitterFactor: number;        // 0.1 (10% random jitter)
}

const DEFAULT_RECONNECTION_CONFIG: ReconnectionConfig = {
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  maxAttempts: 10,
  jitterFactor: 0.1,
};

interface ConnectionState {
  isConnected: boolean;
  attemptCount: number;
  lastConnectedAt: Date | null;
  nextRetryAt: Date | null;
}

function useJobStream(job_id: string, config: Partial<ReconnectionConfig> = {}) {
  const reconnectionConfig = { ...DEFAULT_RECONNECTION_CONFIG, ...config };

  const [jobState, setJobState] = useState<JobState | null>(null);
  const [workItems, setWorkItems] = useState<Map<string, WorkItemDisplay>>(new Map());
  const [reasoningLog, setReasoningLog] = useState<ReasoningEntry[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    isConnected: false,
    attemptCount: 0,
    lastConnectedAt: null,
    nextRetryAt: null,
  });
  const [error, setError] = useState<Error | null>(null);

  // Refs to track reconnection state
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const attemptCountRef = useRef(0);

  // Calculate delay with exponential backoff and jitter
  const calculateDelay = useCallback((attempt: number): number => {
    const baseDelay = Math.min(
      reconnectionConfig.initialDelayMs * Math.pow(reconnectionConfig.backoffMultiplier, attempt),
      reconnectionConfig.maxDelayMs
    );
    // Add jitter to prevent thundering herd
    const jitter = baseDelay * reconnectionConfig.jitterFactor * (Math.random() - 0.5);
    return Math.round(baseDelay + jitter);
  }, [reconnectionConfig]);

  // Connect function
  const connect = useCallback(() => {
    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const eventSource = new EventSource(`/api/jobs/${job_id}/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      attemptCountRef.current = 0;
      setConnectionState({
        isConnected: true,
        attemptCount: 0,
        lastConnectedAt: new Date(),
        nextRetryAt: null,
      });
      setError(null);
    };

    eventSource.onerror = () => {
      eventSource.close();
      eventSourceRef.current = null;

      // Check if we should retry
      if (attemptCountRef.current < reconnectionConfig.maxAttempts) {
        const delay = calculateDelay(attemptCountRef.current);
        attemptCountRef.current += 1;

        setConnectionState(prev => ({
          ...prev,
          isConnected: false,
          attemptCount: attemptCountRef.current,
          nextRetryAt: new Date(Date.now() + delay),
        }));
        setError(new Error(`Connection lost. Reconnecting in ${Math.round(delay / 1000)}s...`));

        // Schedule reconnection
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      } else {
        // Max attempts reached
        setConnectionState(prev => ({
          ...prev,
          isConnected: false,
          nextRetryAt: null,
        }));
        setError(new Error('Connection failed after maximum retry attempts. Please refresh the page.'));
      }
    };

    // Job events
    eventSource.addEventListener('job:started', (e) => {
      const data = JSON.parse(e.data);
      setJobState(prev => ({ ...prev, status: 'planning' }));
    });

    eventSource.addEventListener('job:completed', (e) => {
      const data = JSON.parse(e.data);
      setJobState(prev => ({ ...prev, status: 'completed', version: data.version }));
    });

    // Work item events
    eventSource.addEventListener('work:created', (e) => {
      const data = JSON.parse(e.data);
      setWorkItems(prev => new Map(prev).set(data.work_id, {
        work_id: data.work_id,
        action_item_id: data.action_item_id,
        action: data.action,
        status: 'pending'
      }));
    });

    eventSource.addEventListener('work:status_changed', (e) => {
      const data = JSON.parse(e.data);
      setWorkItems(prev => {
        const updated = new Map(prev);
        const item = updated.get(data.work_id);
        if (item) {
          updated.set(data.work_id, { ...item, status: data.status });
        }
        return updated;
      });
    });

    eventSource.addEventListener('work:output_received', (e) => {
      const data = JSON.parse(e.data);
      setWorkItems(prev => {
        const updated = new Map(prev);
        const item = updated.get(data.work_id);
        if (item) {
          updated.set(data.work_id, {
            ...item,
            output: {
              title: data.title,
              description: data.description,
              content: data.content
            }
          });
        }
        return updated;
      });
    });

    // Reasoning events
    eventSource.addEventListener('reasoning', (e) => {
      const data = JSON.parse(e.data);
      setReasoningLog(prev => [...prev, {
        ts: new Date().toISOString(),
        agent: data.agent,
        step: data.step,
        thought: data.thought,
        decision: data.decision
      }]);
    });

    // Heartbeat keeps connection alive and resets stale detection
    eventSource.addEventListener('heartbeat', () => {
      // Connection is healthy - nothing to do, but confirms we're receiving events
    });
  }, [job_id, calculateDelay, reconnectionConfig.maxAttempts]);

  // Initial connection
  useEffect(() => {
    connect();

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [connect]);

  // Manual reconnect function for UI retry button
  const reconnect = useCallback(() => {
    attemptCountRef.current = 0;
    connect();
  }, [connect]);

  return {
    jobState,
    workItems: Array.from(workItems.values()),
    reasoningLog,
    connectionState,
    error,
    reconnect, // Allow manual reconnection from UI
  };
}
```

---

## API Client

The frontend uses a typed API client to communicate with the backend. This client wraps fetch calls and provides type-safe methods aligned with the API module's interface.

### APIClient Interface

```typescript
// lib/api/client.ts

// Request types (aligned with API module TECH_DESIGN)
interface CreateJobRequest {
  prompt: string;
  budget: number;
  context?: {
    product?: string;
    users?: string;
    [key: string]: string | undefined;
  };
}

// Response types (aligned with API module TECH_DESIGN)
interface CreateJobResponse {
  job_id: string;
  status: "planning";
  stream_url: string;
}

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
    output?: WorkItemOutput;
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

interface ContinueJobResponse {
  job_id: string;
  version: number;
  status: "planning";
  stream_url: string;
}

// Error response type
interface APIError {
  error: string;
  code: string;
  details?: Record<string, unknown>;
}

// Custom error class for API errors
class APIClientError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'APIClientError';
  }
}

// API Client implementation
class APIClient {
  private baseUrl: string;
  private getAuthToken: () => Promise<string>;

  constructor(baseUrl: string, getAuthToken: () => Promise<string>) {
    this.baseUrl = baseUrl;
    this.getAuthToken = getAuthToken;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const token = await this.getAuthToken();

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorData = await response.json() as APIError;
      throw new APIClientError(
        errorData.error,
        errorData.code,
        response.status,
        errorData.details
      );
    }

    return response.json() as Promise<T>;
  }

  // Job operations
  async createJob(input: CreateJobRequest): Promise<CreateJobResponse> {
    return this.request<CreateJobResponse>('POST', '/api/jobs', input);
  }

  async getJob(job_id: string): Promise<GetJobResponse> {
    return this.request<GetJobResponse>('GET', `/api/jobs/${job_id}`);
  }

  async continueJob(job_id: string, prompt: string): Promise<ContinueJobResponse> {
    return this.request<ContinueJobResponse>(
      'POST',
      `/api/jobs/${job_id}/continue`,
      { prompt }
    );
  }

  // SSE connection (returns EventSource for the hook to manage)
  streamJob(job_id: string): EventSource {
    return new EventSource(`${this.baseUrl}/api/jobs/${job_id}/stream`);
  }
}

// Export singleton instance
// The getAuthToken function should be provided by the auth provider (Clerk)
export const api = new APIClient('', async () => {
  // Integration with Clerk:
  // import { useAuth } from '@clerk/nextjs';
  // const { getToken } = useAuth();
  // return await getToken() || '';

  // For now, placeholder that will be replaced during implementation
  if (typeof window !== 'undefined') {
    // Client-side: use Clerk's getToken
    const { getToken } = await import('@clerk/nextjs').then(m => m.auth?.());
    return (await getToken?.()) || '';
  }
  return '';
});
```

### Usage in Components

```typescript
// Example: Creating a job
import { api, APIClientError } from '@/lib/api/client';

async function handleCreateJob(prompt: string, budget: number) {
  try {
    const response = await api.createJob({ prompt, budget });
    // Redirect to job detail page
    router.push(`/jobs/${response.job_id}`);
  } catch (error) {
    if (error instanceof APIClientError) {
      if (error.code === 'INVALID_INPUT') {
        // Handle validation error
        setFormError(error.details?.field as string, error.message);
      } else if (error.status === 401) {
        // Handle auth error
        redirectToLogin();
      } else {
        // Handle other errors
        showToast('error', error.message);
      }
    } else {
      // Handle network or unexpected errors
      showToast('error', 'An unexpected error occurred');
    }
  }
}
```

---

## Page: Job Detail

Main page showing job progress and results.

```typescript
// app/jobs/[job_id]/page.tsx

import { api } from '@/lib/api/client';

export default function JobDetailPage({ params }: { params: { job_id: string } }) {
  const { job_id } = params;
  const {
    jobState,
    workItems,
    reasoningLog,
    connectionState,
    error,
    reconnect
  } = useJobStream(job_id);

  // Initial data fetch
  const { data: initialJob } = useSWR(`/api/jobs/${job_id}`, fetcher);

  return (
    <div className="container mx-auto p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Job: {job_id}</h1>
        <JobStatusBadge status={jobState?.status || initialJob?.status} />
      </div>

      {/* Connection indicator with reconnection status */}
      {!connectionState.isConnected && (
        <Alert variant="warning" className="mb-4">
          <div className="flex items-center justify-between">
            <span>
              {error?.message || 'Connecting to live updates...'}
              {connectionState.attemptCount > 0 && (
                <span className="ml-2 text-sm">
                  (Attempt {connectionState.attemptCount})
                </span>
              )}
            </span>
            {connectionState.attemptCount >= 10 && (
              <button
                onClick={reconnect}
                className="ml-4 px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700"
              >
                Retry
              </button>
            )}
          </div>
        </Alert>
      )}

      {/* Budget */}
      <BudgetDisplay budget={initialJob?.budget} />

      {/* Main content grid */}
      <div className="grid grid-cols-3 gap-6 mt-6">
        {/* Work items (2 cols) */}
        <div className="col-span-2">
          <h2 className="text-xl font-semibold mb-4">Work Items</h2>
          <WorkItemList workItems={workItems} />
        </div>

        {/* Reasoning log (1 col) */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Reasoning</h2>
          <ReasoningLog entries={reasoningLog} />
        </div>
      </div>

      {/* Continuation input (only when completed) */}
      {jobState?.status === 'completed' && (
        <div className="mt-8">
          <ContinuationInput
            job_id={job_id}
            onSubmit={async (prompt) => {
              await api.continueJob(job_id, prompt);
            }}
          />
        </div>
      )}

      {/* Payment trail */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Payments</h2>
        <PaymentTrail payments={initialJob?.payments || []} />
      </div>
    </div>
  );
}
```

---

## State Management

### JobContext

```typescript
interface JobContextValue {
  job: Job | null;
  workItems: WorkItemDisplay[];
  reasoningLog: ReasoningEntry[];
  isLoading: boolean;
  error: Error | null;
  actions: {
    createJob: (prompt: string, budget: number) => Promise<string>;
    continueJob: (prompt: string) => Promise<void>;
    refreshJob: () => Promise<void>;
  };
}

const JobContext = createContext<JobContextValue | null>(null);

export function useJob() {
  const context = useContext(JobContext);
  if (!context) throw new Error('useJob must be used within JobProvider');
  return context;
}
```

---

## Interface: Dependencies

| Module | What We Need | Interface |
|--------|--------------|-----------|
| **API** | REST endpoints, SSE | `APIClient` |

---

## Interface: Provides

This module is the end-user interface. It does not provide interfaces to other modules.

**User-facing features:**
- Create job with prompt and budget
- View real-time job progress
- See work item outputs (including images)
- View reasoning log
- Continue job with refinements
- View payment trail

---

## UI States

### Job Creation Flow

```
[Empty Form] → [Filled Form] → [Submitting...] → [Redirect to Job Page]
                                     ↓
                              [Error: Show message]
```

### Job Execution Flow

```
[Planning...] → [Plan Verified] → [Executing...]
                                       │
                    ┌──────────────────┼──────────────────┐
                    ▼                  ▼                  ▼
              [Work Item 1]      [Work Item 2]      [Work Item 3]
              prompting...       prompting...       pending
                    │                  │
                    ▼                  ▼
              dispatched         dispatched
                    │                  │
                    ▼                  ▼
              verified ✓         polling...
                    │                  │
                    ▼                  ▼
              completed          received
                                       │
                                       ▼
                                 verifying...
                                       │
                                       ▼
                    [All Complete] → [Job Completed] → [Show Continuation Input]
```

---

## Responsive Design

### Breakpoints

| Breakpoint | CSS Class | Screen Width |
|------------|-----------|--------------|
| Mobile | `sm:` | < 640px |
| Tablet | `md:` | 640px - 1023px |
| Desktop | `lg:` | >= 1024px |

### Component-Level Responsive Behavior

#### JobDetailPage Layout

```typescript
// Responsive grid classes
<div className="
  grid
  grid-cols-1          // Mobile: single column
  md:grid-cols-2       // Tablet: 2 columns
  lg:grid-cols-3       // Desktop: 3 columns
  gap-4 md:gap-6
">
  {/* Work items: full width on mobile, 2 cols on tablet, 2 cols on desktop */}
  <div className="col-span-1 md:col-span-2 lg:col-span-2">
    <WorkItemList workItems={workItems} />
  </div>

  {/* Reasoning log: full width on mobile, 2 cols on tablet, 1 col on desktop */}
  <div className="col-span-1 md:col-span-2 lg:col-span-1">
    <ReasoningLog entries={reasoningLog} />
  </div>
</div>
```

#### ReasoningLog Component

| Breakpoint | Behavior |
|------------|----------|
| Mobile | Collapsed by default, expandable accordion. Shows only latest 3 entries. "Show more" button to expand. |
| Tablet | Collapsed by default, expandable accordion. Shows latest 5 entries. |
| Desktop | Always visible sidebar. Shows latest 10 entries with scrollable overflow. |

```typescript
interface ReasoningLogProps {
  entries: ReasoningEntry[];
  maxEntries?: number;  // Responsive default based on breakpoint
}

function ReasoningLog({ entries, maxEntries }: ReasoningLogProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Responsive max entries
  const responsiveMaxEntries = useBreakpointValue({
    base: 3,   // Mobile
    md: 5,     // Tablet
    lg: 10,    // Desktop
  });

  const displayEntries = isExpanded
    ? entries
    : entries.slice(-(maxEntries || responsiveMaxEntries));

  return (
    <div className="
      border rounded-lg p-4
      max-h-[300px] md:max-h-[400px] lg:max-h-[600px]
      overflow-y-auto
    ">
      {/* Mobile/Tablet: collapsible header */}
      <button
        className="lg:hidden w-full flex justify-between items-center"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <h3 className="font-semibold">Reasoning Log</h3>
        <ChevronIcon direction={isExpanded ? 'up' : 'down'} />
      </button>

      {/* Desktop: always visible header */}
      <h3 className="hidden lg:block font-semibold mb-4">Reasoning Log</h3>

      {/* Entries */}
      <div className={`
        ${!isExpanded ? 'hidden lg:block' : 'block'}
        space-y-2
      `}>
        {displayEntries.map((entry, index) => (
          <ReasoningEntry key={index} entry={entry} />
        ))}
      </div>
    </div>
  );
}
```

#### WorkItemList Component

| Breakpoint | Behavior |
|------------|----------|
| Mobile | Full-width cards, vertically stacked. Tap to expand details. |
| Tablet | 2-column card grid. Click to expand inline. |
| Desktop | List view with expandable rows. Side panel for selected item details. |

```typescript
function WorkItemList({ workItems, onItemClick }: WorkItemListProps) {
  return (
    <div className="
      flex flex-col gap-3
      md:grid md:grid-cols-2 md:gap-4
      lg:flex lg:flex-col lg:gap-2
    ">
      {workItems.map(item => (
        <WorkItemCard
          key={item.work_id}
          workItem={item}
          onClick={() => onItemClick?.(item.work_id)}
        />
      ))}
    </div>
  );
}
```

#### WorkItemCard Component

| Breakpoint | Behavior |
|------------|----------|
| Mobile | Compact card with status icon. Tap expands to show output preview. Full output in modal. |
| Tablet | Medium card with status, action text, score. Click expands inline. |
| Desktop | Row with all info visible. Expand arrow shows full output below. |

```typescript
function WorkItemCard({ workItem, expanded, onClick }: WorkItemCardProps) {
  return (
    <div
      className="
        border rounded-lg p-3 md:p-4
        cursor-pointer hover:bg-gray-50
        transition-colors
      "
      onClick={onClick}
    >
      {/* Header - always visible */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusIcon status={workItem.status} />
          <span className="
            font-medium
            text-sm md:text-base
            truncate max-w-[200px] md:max-w-none
          ">
            {workItem.action}
          </span>
        </div>
        {workItem.payment && (
          <span className="text-green-600 text-sm">
            ${workItem.payment.amount.toFixed(2)}
          </span>
        )}
      </div>

      {/* Mobile: tap to expand */}
      {expanded && (
        <div className="mt-3 pt-3 border-t">
          {workItem.output && (
            <OutputRenderer content={workItem.output.content} />
          )}
        </div>
      )}
    </div>
  );
}
```

#### BudgetDisplay Component

| Breakpoint | Behavior |
|------------|----------|
| Mobile | Horizontal progress bar with total/spent numbers below. |
| Tablet | Same as mobile, slightly larger. |
| Desktop | Horizontal bar with inline labels (Spent | Allocated | Remaining). |

```typescript
function BudgetDisplay({ budget }: BudgetDisplayProps) {
  const spentPercent = (budget.spent / budget.total) * 100;
  const allocatedPercent = (budget.allocated / budget.total) * 100;

  return (
    <div className="p-4 bg-gray-50 rounded-lg">
      {/* Progress bar */}
      <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500"
          style={{ width: `${spentPercent}%` }}
        />
        <div
          className="h-full bg-yellow-400 -mt-3"
          style={{ width: `${allocatedPercent - spentPercent}%`, marginLeft: `${spentPercent}%` }}
        />
      </div>

      {/* Labels - stacked on mobile, inline on desktop */}
      <div className="
        mt-2
        flex flex-col gap-1
        lg:flex-row lg:justify-between lg:gap-4
        text-sm
      ">
        <span>Spent: ${budget.spent.toFixed(2)}</span>
        <span className="hidden lg:inline">|</span>
        <span>Allocated: ${budget.allocated.toFixed(2)}</span>
        <span className="hidden lg:inline">|</span>
        <span>Remaining: ${budget.remaining.toFixed(2)}</span>
      </div>
    </div>
  );
}
```

#### ContinuationInput Component

| Breakpoint | Behavior |
|------------|----------|
| Mobile | Full-width textarea, button below. Fixed to bottom of screen when keyboard open. |
| Tablet | Full-width textarea, button inline to the right. |
| Desktop | Same as tablet. |

```typescript
function ContinuationInput({ job_id, onSubmit, disabled }: ContinuationInputProps) {
  const [prompt, setPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <div className="
      bg-white border rounded-lg p-4
      fixed bottom-0 left-0 right-0 md:relative
      shadow-lg md:shadow-none
    ">
      <p className="text-sm text-gray-600 mb-2">Want to refine the output?</p>
      <div className="flex flex-col md:flex-row gap-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe what you'd like to change..."
          disabled={disabled || isSubmitting}
          className="
            flex-1
            border rounded p-2
            min-h-[80px] md:min-h-[60px]
            resize-none
          "
        />
        <button
          onClick={async () => {
            setIsSubmitting(true);
            await onSubmit(prompt);
            setIsSubmitting(false);
          }}
          disabled={disabled || isSubmitting || !prompt.trim()}
          className="
            px-4 py-2
            bg-blue-600 text-white rounded
            hover:bg-blue-700
            disabled:bg-gray-400
            w-full md:w-auto
          "
        >
          {isSubmitting ? 'Continuing...' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
```

#### PaymentTrail Component

| Breakpoint | Behavior |
|------------|----------|
| Mobile | Vertical list with action name and amount. Tap to see tx hash (links to explorer). |
| Tablet | Table with all columns visible. |
| Desktop | Same as tablet with more spacing. |

```typescript
function PaymentTrail({ payments }: PaymentTrailProps) {
  return (
    <>
      {/* Mobile: Card list */}
      <div className="md:hidden space-y-2">
        {payments.map(payment => (
          <div key={payment.work_id} className="border rounded p-3">
            <div className="flex justify-between">
              <span className="font-medium">{payment.action}</span>
              <span className="text-green-600">${payment.amount.toFixed(2)}</span>
            </div>
            <div className="text-sm text-gray-500 mt-1">
              {payment.agent_name}
            </div>
            <a
              href={`https://basescan.org/tx/${payment.tx_hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline"
            >
              View transaction
            </a>
          </div>
        ))}
      </div>

      {/* Tablet/Desktop: Table */}
      <table className="hidden md:table w-full">
        <thead>
          <tr className="border-b">
            <th className="text-left p-2">Action</th>
            <th className="text-left p-2">Agent</th>
            <th className="text-right p-2">Amount</th>
            <th className="text-left p-2">Transaction</th>
          </tr>
        </thead>
        <tbody>
          {payments.map(payment => (
            <tr key={payment.work_id} className="border-b">
              <td className="p-2">{payment.action}</td>
              <td className="p-2">{payment.agent_name}</td>
              <td className="p-2 text-right">${payment.amount.toFixed(2)}</td>
              <td className="p-2">
                <a
                  href={`https://basescan.org/tx/${payment.tx_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-sm"
                >
                  {payment.tx_hash.slice(0, 10)}...
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
```

---

## Accessibility

- All interactive elements have keyboard navigation
- Status changes announced via aria-live regions
- Color is not the only indicator (icons + text)
- Images have alt text from output.description
