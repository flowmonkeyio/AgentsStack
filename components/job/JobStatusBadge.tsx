"use client";

/**
 * Valid job status values
 */
export type JobStatus =
  | "planning"
  | "plan_verification"
  | "executing"
  | "completed"
  | "failed";

/**
 * Props interface for JobStatusBadge component
 */
export interface JobStatusBadgeProps {
  status: JobStatus;
}

/**
 * Status configuration for visual display
 */
interface StatusConfig {
  label: string;
  bgColor: string;
  textColor: string;
  pulsing: boolean;
}

/**
 * Visual mapping for each status
 * - planning: yellow, pulsing
 * - plan_verification: yellow
 * - executing: blue, pulsing
 * - completed: green
 * - failed: red
 */
const STATUS_CONFIG: Record<JobStatus, StatusConfig> = {
  planning: {
    label: "Planning",
    bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
    textColor: "text-yellow-800 dark:text-yellow-200",
    pulsing: true,
  },
  plan_verification: {
    label: "Verifying Plan",
    bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
    textColor: "text-yellow-800 dark:text-yellow-200",
    pulsing: false,
  },
  executing: {
    label: "Executing",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    textColor: "text-blue-800 dark:text-blue-200",
    pulsing: true,
  },
  completed: {
    label: "Completed",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    textColor: "text-green-800 dark:text-green-200",
    pulsing: false,
  },
  failed: {
    label: "Failed",
    bgColor: "bg-red-100 dark:bg-red-900/30",
    textColor: "text-red-800 dark:text-red-200",
    pulsing: false,
  },
};

/**
 * JobStatusBadge - Display current job status with color coding
 *
 * Features:
 * - Color-coded badges for each status
 * - Pulsing animation for active states (planning, executing)
 * - Accessible with proper ARIA attributes
 */
export function JobStatusBadge({ status }: JobStatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      className={`
        inline-flex items-center gap-1.5
        px-2.5 py-1
        text-xs sm:text-sm font-medium
        rounded-full
        ${config.bgColor}
        ${config.textColor}
      `}
      role="status"
      aria-live="polite"
    >
      {/* Pulsing dot indicator for active states */}
      {config.pulsing && (
        <span className="relative flex h-2 w-2">
          <span
            className={`
              animate-ping absolute inline-flex h-full w-full rounded-full opacity-75
              ${status === "planning" ? "bg-yellow-500" : "bg-blue-500"}
            `}
          />
          <span
            className={`
              relative inline-flex rounded-full h-2 w-2
              ${status === "planning" ? "bg-yellow-500" : "bg-blue-500"}
            `}
          />
        </span>
      )}

      {/* Status indicator icons for non-pulsing states */}
      {!config.pulsing && status === "completed" && (
        <svg
          className="w-3.5 h-3.5"
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
      )}

      {!config.pulsing && status === "failed" && (
        <svg
          className="w-3.5 h-3.5"
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
      )}

      {config.label}
    </span>
  );
}

export default JobStatusBadge;
