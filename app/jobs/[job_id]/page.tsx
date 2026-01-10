"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useJobStream } from "@/hooks/useJobStream";
import { api, APIClientError } from "@/lib/api-client";

// Components - imported from job components (being implemented by another agent)
import { JobStatusBadge } from "@/components/job/JobStatusBadge";
import { WorkItemList } from "@/components/job/WorkItemList";
import { ReasoningLog } from "@/components/job/ReasoningLog";
import { BudgetDisplay } from "@/components/job/BudgetDisplay";
import { ContinuationInput } from "@/components/job/ContinuationInput";
import { PaymentTrail } from "@/components/job/PaymentTrail";

// Types
import type { GetJobResponse } from "@/types/api";

interface Payment {
  work_id: string;
  action: string;
  agent_name: string;
  amount: number;
  tx_hash: string;
  confirmed_at: string;
}

export default function JobDetailPage() {
  const params = useParams();
  const job_id = params.job_id as string;
  const { isLoaded, isSignedIn } = useAuth();

  // Initial job data fetch
  const [initialJob, setInitialJob] = useState<GetJobResponse | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);

  // Real-time updates via SSE
  const {
    jobState,
    workItems,
    reasoningLog,
    connectionState,
    error: streamError,
    reconnect,
  } = useJobStream(job_id);

  // Continuation state
  const [isContinuing, setIsContinuing] = useState(false);

  // Fetch initial job data
  useEffect(() => {
    async function fetchJob() {
      if (!isLoaded || !isSignedIn) return;

      try {
        setInitialLoading(true);
        const job = await api.getJob(job_id);
        setInitialJob(job);
        setInitialError(null);
      } catch (err) {
        if (err instanceof APIClientError) {
          if (err.status === 404) {
            setInitialError("Job not found.");
          } else if (err.status === 403) {
            setInitialError("You don't have access to this job.");
          } else {
            setInitialError(err.message);
          }
        } else {
          setInitialError("Failed to load job. Please try again.");
        }
      } finally {
        setInitialLoading(false);
      }
    }

    fetchJob();
  }, [job_id, isLoaded, isSignedIn]);

  // Handle continuation submission
  const handleContinue = async (prompt: string) => {
    setIsContinuing(true);
    try {
      await api.continueJob(job_id, prompt);
      // The SSE stream will handle the updates
    } catch (err) {
      if (err instanceof APIClientError) {
        console.error("Failed to continue job:", err.message);
      }
    } finally {
      setIsContinuing(false);
    }
  };

  // Derive current status from SSE state or initial data
  const currentStatus = jobState?.status ?? initialJob?.status;

  // Merge work items from initial load and SSE updates
  const displayWorkItems = workItems.length > 0 ? workItems : (initialJob?.work_items ?? []).map(item => ({
    work_id: item.work_id,
    action_item_id: item.action_item_id,
    action: item.action,
    status: item.status,
    output: item.output ? {
      title: item.output.title,
      description: item.output.description,
      content: { type: "text" as const, data: String(item.output.content) },
    } : undefined,
    verification: item.verification,
  }));

  // Get reasoning log from SSE or initial data
  const displayReasoningLog = reasoningLog.length > 0
    ? reasoningLog
    : (initialJob?.reasoning_log ?? []).map(entry => ({
        ts: String(entry.ts),
        agent: entry.agent,
        step: entry.step,
        thought: entry.thought,
        decision: entry.decision,
      }));

  // Extract payments from work items (placeholder - actual implementation would come from API)
  const payments: Payment[] = [];

  // Auth loading state
  if (!isLoaded) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-1/3 mb-6"></div>
          <div className="h-4 bg-muted rounded w-1/4 mb-8"></div>
          <div className="h-48 bg-muted rounded mb-6"></div>
          <div className="h-32 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  // Not signed in
  if (!isSignedIn) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">Sign In Required</h1>
          <p className="text-muted-foreground">
            Please sign in to view job details.
          </p>
        </div>
      </div>
    );
  }

  // Initial loading state
  if (initialLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="flex justify-between items-center mb-6">
            <div className="h-8 bg-muted rounded w-1/3"></div>
            <div className="h-6 bg-muted rounded w-20"></div>
          </div>
          <div className="h-16 bg-muted rounded mb-6"></div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 h-64 bg-muted rounded"></div>
            <div className="h-64 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (initialError) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-3xl font-bold mb-4">Error</h1>
          <p className="text-destructive mb-6">{initialError}</p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // No job found (shouldn't happen if error handling is correct)
  if (!initialJob) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-4">Job Not Found</h1>
          <p className="text-muted-foreground">
            The job you're looking for doesn't exist or has been deleted.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold truncate">Job: {job_id}</h1>
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
            {initialJob.prompt}
          </p>
        </div>
        <JobStatusBadge status={currentStatus ?? "planning"} />
      </div>

      {/* Connection indicator with reconnection status */}
      {!connectionState.isConnected && (
        <div className="mb-4 p-4 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-yellow-700 dark:text-yellow-400">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span>
              {streamError?.message || "Connecting to live updates..."}
              {connectionState.attemptCount > 0 && (
                <span className="ml-2 text-sm opacity-80">
                  (Attempt {connectionState.attemptCount})
                </span>
              )}
            </span>
            {connectionState.attemptCount >= 10 && (
              <button
                onClick={reconnect}
                className="px-3 py-1 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700 transition-colors"
              >
                Retry
              </button>
            )}
          </div>
        </div>
      )}

      {/* Budget display */}
      <div className="mb-6">
        <BudgetDisplay budget={initialJob.budget} />
      </div>

      {/* Main content grid - responsive layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 mt-6">
        {/* Work items: full width on mobile, 2 cols on tablet, 2 cols on desktop */}
        <div className="col-span-1 md:col-span-2 lg:col-span-2">
          <h2 className="text-xl font-semibold mb-4">Work Items</h2>
          {displayWorkItems.length > 0 ? (
            <WorkItemList workItems={displayWorkItems} />
          ) : (
            <div className="rounded-md border border-border p-8 text-center text-muted-foreground">
              {currentStatus === "planning" ? (
                "Planning in progress..."
              ) : currentStatus === "plan_verification" ? (
                "Verifying plan..."
              ) : (
                "No work items yet."
              )}
            </div>
          )}
        </div>

        {/* Reasoning log: full width on mobile, 2 cols on tablet, 1 col on desktop */}
        <div className="col-span-1 md:col-span-2 lg:col-span-1">
          <h2 className="text-xl font-semibold mb-4">Reasoning</h2>
          <ReasoningLog entries={displayReasoningLog} />
        </div>
      </div>

      {/* Continuation input (only when completed) */}
      {currentStatus === "completed" && (
        <div className="mt-8">
          <ContinuationInput
            job_id={job_id}
            onSubmit={handleContinue}
            disabled={isContinuing}
          />
        </div>
      )}

      {/* Payment trail */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Payments</h2>
        {payments.length > 0 ? (
          <PaymentTrail payments={payments} />
        ) : (
          <div className="rounded-md border border-border p-6 text-center text-muted-foreground">
            No payments processed yet.
          </div>
        )}
      </div>
    </div>
  );
}
