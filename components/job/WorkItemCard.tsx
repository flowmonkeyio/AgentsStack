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
      <svg
        className="w-5 h-5 text-green-500"
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
    );
  }

  // Failed statuses
  if (status === "failed" || status === "rejected") {
    return (
      <svg
        className="w-5 h-5 text-red-500"
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
    );
  }

  // Pending status
  if (status === "pending" || status === "ready") {
    return (
      <svg
        className="w-5 h-5 text-muted-foreground"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-label="Pending"
      >
        <circle cx="12" cy="12" r="10" strokeWidth={2} />
      </svg>
    );
  }

  // In-progress statuses (polling, dispatched, verifying, prompting, etc.)
  return (
    <svg
      className="w-5 h-5 text-blue-500 animate-spin"
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
 * WorkItemCard - Detailed view of a single work item
 *
 * Sections:
 * - Header: action + status badge
 * - Output: title, description, content (expandable)
 * - Verification: score bar, criteria checklist
 * - Payment: amount, tx hash (link to explorer)
 *
 * Responsive behavior:
 * - Mobile: Compact card with status icon. Tap expands to show output preview.
 * - Tablet: Medium card with status, action text, score. Click expands inline.
 * - Desktop: Row with all info visible. Expand arrow shows full output below.
 */
export function WorkItemCard({
  workItem,
  expanded = false,
  onClick,
}: WorkItemCardProps) {
  return (
    <div
      className={`
        border rounded-lg p-3 md:p-4
        bg-background
        transition-colors
        ${onClick ? "cursor-pointer hover:bg-accent/50" : ""}
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
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <StatusIcon status={workItem.status} />

          {/* Action item ID */}
          <span className="text-muted-foreground text-xs sm:text-sm font-mono">
            #{workItem.action_item_id}
          </span>

          {/* Action text */}
          <span
            className="
              font-medium
              text-sm md:text-base
              truncate
              text-foreground
            "
            title={workItem.action}
          >
            {workItem.action}
          </span>
        </div>

        {/* Right side: payment amount or status text */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {workItem.verification && (
            <span
              className={`
                hidden sm:inline-flex
                text-xs
                px-2 py-0.5
                rounded
                ${workItem.verification.passed ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"}
              `}
            >
              {workItem.verification.score}%
            </span>
          )}

          {workItem.payment?.confirmed && (
            <span className="text-green-600 dark:text-green-400 text-sm font-medium">
              ${workItem.payment.amount.toFixed(2)}
            </span>
          )}

          {!workItem.payment?.confirmed && !expanded && (
            <span className="text-muted-foreground text-xs">
              {getStatusText(workItem.status)}
            </span>
          )}

          {/* Expand indicator */}
          {onClick && (
            <svg
              className={`
                w-4 h-4 text-muted-foreground
                transition-transform
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

      {/* Status details (mobile: always show, tablet/desktop: show when relevant) */}
      <div className="mt-2 text-xs text-muted-foreground md:hidden">
        Status: {getStatusText(workItem.status)}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-border space-y-4">
          {/* Output section */}
          {workItem.output && (
            <div className="space-y-2">
              <h4 className="font-medium text-sm text-foreground">
                {workItem.output.title}
              </h4>
              <p className="text-sm text-muted-foreground">
                {workItem.output.description}
              </p>
              <div className="mt-2">
                <OutputRenderer content={workItem.output.content} />
              </div>
            </div>
          )}

          {/* Verification section */}
          {workItem.verification && (
            <div className="space-y-2">
              <h4 className="font-medium text-sm text-foreground">
                Verification
              </h4>

              {/* Score bar */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`
                      h-full transition-all
                      ${workItem.verification.passed ? "bg-green-500" : "bg-red-500"}
                    `}
                    style={{ width: `${workItem.verification.score}%` }}
                  />
                </div>
                <span
                  className={`
                    text-sm font-medium
                    ${workItem.verification.passed ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}
                  `}
                >
                  {workItem.verification.score}%
                </span>
              </div>

              {/* Pass/Fail badge */}
              <span
                className={`
                  inline-flex items-center gap-1
                  text-xs px-2 py-1 rounded
                  ${workItem.verification.passed ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"}
                `}
              >
                {workItem.verification.passed ? (
                  <>
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    Passed
                  </>
                ) : (
                  <>
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                    Failed
                  </>
                )}
              </span>
            </div>
          )}

          {/* Payment section */}
          {workItem.payment && (
            <div className="space-y-1">
              <h4 className="font-medium text-sm text-foreground">Payment</h4>
              <div className="flex items-center gap-2">
                <span className="text-sm text-foreground">
                  ${workItem.payment.amount.toFixed(2)}
                </span>
                {workItem.payment.confirmed ? (
                  <span className="text-xs text-green-600 dark:text-green-400">
                    Confirmed
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Pending</span>
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
