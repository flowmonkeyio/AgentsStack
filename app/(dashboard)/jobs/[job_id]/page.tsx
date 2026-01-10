"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useJobStream } from "@/hooks/useJobStream";
import { api, APIClientError } from "@/lib/api-client";
import { Breadcrumb } from "@/components/layout";

// Components
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

  const [initialJob, setInitialJob] = useState<GetJobResponse | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);

  const {
    jobState,
    workItems,
    reasoningLog,
    connectionState,
    error: streamError,
    reconnect,
  } = useJobStream(job_id);

  const [isContinuing, setIsContinuing] = useState(false);

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

  const handleContinue = async (prompt: string) => {
    setIsContinuing(true);
    try {
      await api.continueJob(job_id, prompt);
    } catch (err) {
      if (err instanceof APIClientError) {
        console.error("Failed to continue job:", err.message);
      }
    } finally {
      setIsContinuing(false);
    }
  };

  const currentStatus = jobState?.status ?? initialJob?.status;

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

  const displayReasoningLog = reasoningLog.length > 0
    ? reasoningLog
    : (initialJob?.reasoning_log ?? []).map(entry => ({
        ts: String(entry.ts),
        agent: entry.agent,
        step: entry.step,
        thought: entry.thought,
        decision: entry.decision,
      }));

  const payments: Payment[] = [];

  // Auth loading state
  if (!isLoaded) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-4 bg-background-card rounded w-48 mb-6" />
          <div className="h-8 bg-background-card rounded-lg w-1/3 mb-2" />
          <div className="h-4 bg-background-card rounded-lg w-2/3 mb-8" />
          <div className="h-32 bg-background-card rounded-xl mb-6" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 h-64 bg-background-card rounded-xl" />
            <div className="h-64 bg-background-card rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  // Not signed in
  if (!isSignedIn) {
    return (
      <div className="py-12">
        <div className="max-w-md mx-auto text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary-muted flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <h1 className="font-heading text-2xl font-bold text-foreground mb-3">Sign In Required</h1>
          <p className="text-foreground-muted mb-8">
            Please sign in to view job details.
          </p>
          <Link href="/sign-in" className="btn-primary">
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  // Initial loading state
  if (initialLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-4 bg-background-card rounded w-48 mb-6" />
          <div className="flex justify-between items-center mb-8">
            <div className="space-y-2">
              <div className="h-8 bg-background-card rounded-lg w-48" />
              <div className="h-4 bg-background-card rounded-lg w-96" />
            </div>
            <div className="h-8 bg-background-card rounded-full w-24" />
          </div>
          <div className="h-28 bg-background-card rounded-xl mb-6" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="h-6 bg-background-card rounded w-32" />
              <div className="h-32 bg-background-card rounded-xl" />
              <div className="h-32 bg-background-card rounded-xl" />
            </div>
            <div className="space-y-4">
              <div className="h-6 bg-background-card rounded w-24" />
              <div className="h-64 bg-background-card rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (initialError) {
    return (
      <div className="py-12">
        <Breadcrumb
          items={[
            { label: "Jobs", href: "/jobs" },
            { label: "Error" },
          ]}
        />
        <div className="max-w-md mx-auto text-center">
          <div className="w-16 h-16 rounded-2xl bg-destructive-muted flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h1 className="font-heading text-2xl font-bold text-foreground mb-3">Error</h1>
          <p className="text-destructive mb-8">{initialError}</p>
          <button
            onClick={() => window.location.reload()}
            className="btn-primary"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // No job found
  if (!initialJob) {
    return (
      <div className="py-12">
        <Breadcrumb
          items={[
            { label: "Jobs", href: "/jobs" },
            { label: "Not Found" },
          ]}
        />
        <div className="max-w-md mx-auto text-center">
          <div className="w-16 h-16 rounded-2xl bg-warning-muted flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h1 className="font-heading text-2xl font-bold text-foreground mb-3">Job Not Found</h1>
          <p className="text-foreground-muted mb-8">
            The job you&apos;re looking for doesn&apos;t exist or has been deleted.
          </p>
          <Link href="/jobs" className="btn-primary">
            Back to Jobs
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: "Jobs", href: "/jobs" },
          { label: `Job ${job_id.slice(4, 12)}...` },
        ]}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="font-heading text-2xl sm:text-3xl font-bold text-foreground truncate">
              Job Details
            </h1>
            <JobStatusBadge status={currentStatus ?? "planning"} size="lg" />
          </div>
          <p className="text-foreground-muted line-clamp-2 max-w-2xl">
            {initialJob.prompt}
          </p>
        </div>
      </div>

      {/* Connection indicator */}
      {!connectionState.isConnected && (
        <div className="p-4 rounded-xl bg-warning-muted border border-warning/20 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-warning/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-warning">
                {streamError?.message || "Connecting to live updates..."}
              </p>
              {connectionState.attemptCount > 0 && (
                <p className="text-xs text-warning/80">
                  Attempt {connectionState.attemptCount}
                </p>
              )}
            </div>
          </div>
          {connectionState.attemptCount >= 10 && (
            <button
              onClick={reconnect}
              className="px-4 py-2 bg-warning text-warning-foreground rounded-lg text-sm font-medium hover:bg-warning/90 transition-colors"
            >
              Retry Connection
            </button>
          )}
        </div>
      )}

      {/* Budget display */}
      <BudgetDisplay budget={initialJob.budget} />

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Work items */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-info-muted flex items-center justify-center">
              <svg className="w-4 h-4 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <h2 className="font-heading text-xl font-semibold text-foreground">Work Items</h2>
            {displayWorkItems.length > 0 && (
              <span className="text-sm text-foreground-muted">({displayWorkItems.length})</span>
            )}
          </div>

          {displayWorkItems.length > 0 ? (
            <WorkItemList workItems={displayWorkItems} />
          ) : (
            <div className="rounded-xl bg-background-card border border-border p-8 text-center">
              <div className="w-12 h-12 rounded-xl bg-info-muted flex items-center justify-center mx-auto mb-3">
                {currentStatus === "planning" || currentStatus === "plan_verification" ? (
                  <svg className="w-6 h-6 text-info animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                )}
              </div>
              <p className="text-foreground-muted">
                {currentStatus === "planning" ? (
                  "Planning in progress..."
                ) : currentStatus === "plan_verification" ? (
                  "Verifying plan..."
                ) : (
                  "No work items yet."
                )}
              </p>
            </div>
          )}
        </div>

        {/* Reasoning log */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-secondary-muted flex items-center justify-center">
              <svg className="w-4 h-4 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h2 className="font-heading text-xl font-semibold text-foreground">Reasoning</h2>
          </div>
          <ReasoningLog entries={displayReasoningLog} />
        </div>
      </div>

      {/* Continuation input (only when completed) */}
      {currentStatus === "completed" && (
        <ContinuationInput
          job_id={job_id}
          onSubmit={handleContinue}
          disabled={isContinuing}
        />
      )}

      {/* Payment trail */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent-muted flex items-center justify-center">
            <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
            </svg>
          </div>
          <h2 className="font-heading text-xl font-semibold text-foreground">Payments</h2>
        </div>

        {payments.length > 0 ? (
          <PaymentTrail payments={payments} />
        ) : (
          <div className="rounded-xl bg-background-card border border-border p-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-accent-muted flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
              </svg>
            </div>
            <p className="text-foreground-muted">No payments processed yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
