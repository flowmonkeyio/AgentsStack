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
  output?: {
    title: string;
    description: string;
    content: any;
  };
  verification?: {
    score: number;
    passed: boolean;
  };
  payment?: {
    amount: number;
    confirmed: boolean;
  };
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

Render different output types.

```typescript
interface OutputRendererProps {
  content: any;
  type: "text" | "image" | "json" | "markdown";
}

// Rendering:
// - text: plain text
// - image: <img> with src (base64 or URL)
// - json: formatted JSON viewer
// - markdown: rendered markdown
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
function useJobStream(job_id: string) {
  const [jobState, setJobState] = useState<JobState | null>(null);
  const [workItems, setWorkItems] = useState<Map<string, WorkItemDisplay>>(new Map());
  const [reasoningLog, setReasoningLog] = useState<ReasoningEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const eventSource = new EventSource(`/api/jobs/${job_id}/stream`);

    eventSource.onopen = () => setIsConnected(true);
    eventSource.onerror = (e) => {
      setError(new Error('Connection lost'));
      setIsConnected(false);
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

    return () => {
      eventSource.close();
    };
  }, [job_id]);

  return {
    jobState,
    workItems: Array.from(workItems.values()),
    reasoningLog,
    isConnected,
    error
  };
}
```

---

## Page: Job Detail

Main page showing job progress and results.

```typescript
// app/jobs/[job_id]/page.tsx

export default function JobDetailPage({ params }: { params: { job_id: string } }) {
  const { job_id } = params;
  const { jobState, workItems, reasoningLog, isConnected, error } = useJobStream(job_id);

  // Initial data fetch
  const { data: initialJob } = useSWR(`/api/jobs/${job_id}`, fetcher);

  return (
    <div className="container mx-auto p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Job: {job_id}</h1>
        <JobStatusBadge status={jobState?.status || initialJob?.status} />
      </div>

      {/* Connection indicator */}
      {!isConnected && (
        <Alert variant="warning">Reconnecting to live updates...</Alert>
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

| Breakpoint | Layout |
|------------|--------|
| Mobile (<640px) | Single column, stacked |
| Tablet (640-1024px) | 2 columns |
| Desktop (>1024px) | 3 columns (work items, outputs, reasoning) |

---

## Accessibility

- All interactive elements have keyboard navigation
- Status changes announced via aria-live regions
- Color is not the only indicator (icons + text)
- Images have alt text from output.description
