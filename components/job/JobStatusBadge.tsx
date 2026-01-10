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
  size?: "sm" | "md" | "lg";
}

/**
 * Status configuration for visual display
 */
interface StatusConfig {
  label: string;
  className: string;
  icon: React.ReactNode;
  pulsing: boolean;
}

/**
 * Visual mapping for each status
 */
const STATUS_CONFIG: Record<JobStatus, StatusConfig> = {
  planning: {
    label: "Planning",
    className: "badge-warning",
    pulsing: true,
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
  plan_verification: {
    label: "Verifying Plan",
    className: "badge-warning",
    pulsing: false,
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  executing: {
    label: "Executing",
    className: "badge-info",
    pulsing: true,
    icon: (
      <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
  },
  completed: {
    label: "Completed",
    className: "badge-success",
    pulsing: false,
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
  failed: {
    label: "Failed",
    className: "badge-error",
    pulsing: false,
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
  },
};

/**
 * JobStatusBadge - Display current job status with color coding
 */
export function JobStatusBadge({ status, size = "md" }: JobStatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  const sizeClasses = {
    sm: "text-xs px-2 py-0.5 gap-1",
    md: "text-xs px-3 py-1 gap-1.5",
    lg: "text-sm px-4 py-1.5 gap-2",
  };

  return (
    <span
      className={`badge ${config.className} ${sizeClasses[size]}`}
      role="status"
      aria-live="polite"
    >
      {/* Pulsing dot indicator for active states */}
      {config.pulsing && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-current" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
        </span>
      )}

      {/* Status icon for non-pulsing states */}
      {!config.pulsing && config.icon}

      {config.label}
    </span>
  );
}

export default JobStatusBadge;
