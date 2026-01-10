"use client";

import type { WorkItemStatus } from "@/types/data";
import { OutputRenderer, OutputContent } from "./OutputRenderer";

/**
 * Work item output structure
 */
export interface WorkItemOutput {
  title: string;
  description: string;
  content: OutputContent;
}

/**
 * Work item display data
 */
export interface WorkItemDisplay {
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

/**
 * Props interface for WorkItemCard component
 */
export interface WorkItemCardProps {
  workItem: WorkItemDisplay;
  expanded?: boolean;
  onClick?: () => void;
}

/**
 * Status icon component - renders appropriate icon based on status
 */
function StatusIcon({ status }: { status: WorkItemStatus }) {
  // Completed statuses
  if (status === "completed" || status === "verified") {
    return (
      <div className="w-8 h-8 rounded-lg bg-success-muted flex items-center justify-center">
        <svg
          className="w-4 h-4 text-success"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-label="Completed"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>
    );
  }

  // Failed statuses
  if (status === "failed" || status === "rejected") {
    return (
      <div className="w-8 h-8 rounded-lg bg-destructive-muted flex items-center justify-center">
        <svg
          className="w-4 h-4 text-destructive"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-label="Failed"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </div>
    );
  }

  // Pending status
  if (status === "pending" || status === "ready") {
    return (
      <div className="w-8 h-8 rounded-lg bg-background border border-border flex items-center justify-center">
        <svg
          className="w-4 h-4 text-foreground-subtle"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-label="Pending"
        >
          <circle cx="12" cy="12" r="10" strokeWidth={2} />
        </svg>
      </div>
    );
  }

  // In-progress statuses (polling, dispatched, verifying, prompting, etc.)
  return (
    <div className="w-8 h-8 rounded-lg bg-info-muted flex items-center justify-center">
      <svg
        className="w-4 h-4 text-info animate-spin"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-label="In Progress"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
    </div>
  );
}

/**
 * Get display text for status
 */
function getStatusText(status: WorkItemStatus): string {
  const statusMap: Record<WorkItemStatus, string> = {
    pending: "Pending",
    ready: "Ready",
    prompting: "Generating prompt",
    dispatched: "Dispatched",
    polling: "Polling",
    stale: "Stale",
    received: "Received",
    verifying: "Verifying",
    verified: "Verified",
    retry_pending: "Retry pending",
    rejected: "Rejected",
    reassigning: "Reassigning",
    paying: "Processing payment",
    payment_retry: "Retrying payment",
    completed: "Completed",
    failed: "Failed",
  };
  return statusMap[status] || status;
}

/**
 * WorkItemCard - Detailed view of a single work item with premium styling
 */
export function WorkItemCard({
  workItem,
  expanded = false,
  onClick,
}: WorkItemCardProps) {
  return (
    <div
      className={`
        rounded-xl border border-border bg-background-card p-4
        transition-all duration-200
        ${onClick ? "cursor-pointer hover:bg-background-card-hover hover:border-border-hover" : ""}
        ${expanded ? "ring-1 ring-primary/20" : ""}
      `}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {/* Header - always visible */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <StatusIcon status={workItem.status} />

          <div className="min-w-0 flex-1">
            {/* Action item ID */}
            <span className="text-foreground-subtle text-xs font-mono">
              #{workItem.action_item_id}
            </span>

            {/* Action text */}
            <p
              className="font-medium text-sm text-foreground truncate"
              title={workItem.action}
            >
              {workItem.action}
            </p>
          </div>
        </div>

        {/* Right side: payment amount or status text */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {workItem.verification && (
            <span
              className={`
                hidden sm:inline-flex items-center gap-1
                text-xs font-medium px-2.5 py-1 rounded-full
                ${workItem.verification.passed
                  ? "bg-success-muted text-success"
                  : "bg-destructive-muted text-destructive"}
              `}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
              </svg>
              {workItem.verification.score}%
            </span>
          )}

          {workItem.payment?.confirmed && (
            <span className="text-success text-sm font-semibold font-heading">
              ${workItem.payment.amount.toFixed(2)}
            </span>
          )}

          {!workItem.payment?.confirmed && !expanded && (
            <span className="text-foreground-muted text-xs">
              {getStatusText(workItem.status)}
            </span>
          )}

          {/* Expand indicator */}
          {onClick && (
            <svg
              className={`
                w-4 h-4 text-foreground-subtle
                transition-transform duration-200
                ${expanded ? "rotate-180" : ""}
              `}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          )}
        </div>
      </div>

      {/* Status details (mobile only) */}
      <div className="mt-2 text-xs text-foreground-muted md:hidden">
        Status: {getStatusText(workItem.status)}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-border space-y-5 animate-fade-in">
          {/* Output section */}
          {workItem.output && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-primary-muted flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h4 className="font-heading font-semibold text-sm text-foreground">
                  {workItem.output.title}
                </h4>
              </div>
              <p className="text-sm text-foreground-muted pl-8">
                {workItem.output.description}
              </p>
              <div className="mt-3 p-4 rounded-lg bg-background border border-border">
                <OutputRenderer content={workItem.output.content} />
              </div>
            </div>
          )}

          {/* Verification section */}
          {workItem.verification && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-secondary-muted flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h4 className="font-heading font-semibold text-sm text-foreground">
                  Verification
                </h4>
              </div>

              {/* Score bar */}
              <div className="flex items-center gap-3 pl-8">
                <div className="flex-1 h-2.5 bg-background rounded-full overflow-hidden">
                  <div
                    className={`
                      h-full transition-all duration-500 rounded-full
                      ${workItem.verification.passed
                        ? "bg-gradient-to-r from-success to-success/80 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                        : "bg-gradient-to-r from-destructive to-destructive/80"}
                    `}
                    style={{ width: `${workItem.verification.score}%` }}
                  />
                </div>
                <span
                  className={`
                    text-sm font-heading font-bold min-w-[3rem] text-right
                    ${workItem.verification.passed ? "text-success" : "text-destructive"}
                  `}
                >
                  {workItem.verification.score}%
                </span>
              </div>

              {/* Pass/Fail badge */}
              <div className="pl-8">
                <span
                  className={`
                    inline-flex items-center gap-1.5
                    text-xs font-medium px-3 py-1.5 rounded-full
                    ${workItem.verification.passed
                      ? "bg-success-muted text-success"
                      : "bg-destructive-muted text-destructive"}
                  `}
                >
                  {workItem.verification.passed ? (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Verification Passed
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Verification Failed
                    </>
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Payment section */}
          {workItem.payment && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-accent-muted flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h4 className="font-heading font-semibold text-sm text-foreground">
                  Payment
                </h4>
              </div>

              <div className="flex items-center gap-3 pl-8">
                <span className="text-lg font-heading font-bold text-foreground">
                  ${workItem.payment.amount.toFixed(2)}
                </span>
                {workItem.payment.confirmed ? (
                  <span className="badge badge-success text-xs">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Confirmed
                  </span>
                ) : (
                  <span className="badge badge-warning text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
                    Pending
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default WorkItemCard;
