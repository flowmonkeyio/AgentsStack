"use client";

import { useState } from "react";

/**
 * Agent data structure for display
 */
export interface AgentData {
  _id: string;
  name: string;
  description: string;
  capabilities: string;
  endpoint: string;
  wallet?: string;
  pricing: {
    basePrice: number;
    currency: string;
    negotiable?: boolean;
  };
  status: "active" | "pending_review" | "inactive";
  metrics: {
    totalJobs: number;
    successfulJobs: number;
    failedJobs: number;
    averageScore: number;
    totalEarningsUsd: number;
    averageExecutionTimeMs: number;
  };
  supportsAsync?: boolean;
  supportsCallback?: boolean;
  createdAt: string;
}

export interface AgentCardProps {
  agent: AgentData;
  /** Callback when agent is approved (dev only) */
  onApprove?: () => void;
}

/**
 * Status badge colors and labels
 */
const statusConfig: Record<
  string,
  { label: string; className: string }
> = {
  active: {
    label: "Active",
    className: "bg-success-muted text-success border-success/20",
  },
  pending_review: {
    label: "Pending Review",
    className: "bg-warning-muted text-warning border-warning/20",
  },
  inactive: {
    label: "Inactive",
    className: "bg-background-subtle text-foreground-subtle border-border",
  },
};

/**
 * AgentCard - Display agent information in a card format
 *
 * Shows:
 * - Agent name and status badge
 * - Description
 * - Capabilities
 * - Pricing information
 * - Performance metrics
 */
export function AgentCard({ agent, onApprove }: AgentCardProps) {
  const [isApproving, setIsApproving] = useState(false);
  const status = statusConfig[agent.status] || statusConfig.inactive;
  const successRate =
    (agent.metrics?.totalJobs ?? 0) > 0
      ? Math.round(
          ((agent.metrics?.successfulJobs ?? 0) / (agent.metrics?.totalJobs ?? 1)) * 100
        )
      : 0;

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      const response = await fetch(`/api/agents/${agent._id}/approve`, {
        method: "POST",
      });
      if (response.ok) {
        onApprove?.();
      } else {
        const data = await response.json();
        console.error("Failed to approve:", data.error);
      }
    } catch (error) {
      console.error("Approve error:", error);
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <div className="group relative bg-[var(--background-card)] rounded-2xl p-6 border border-[var(--border)] shadow-[var(--shadow)] hover:shadow-[var(--shadow-lg)] hover:border-[var(--border-hover)] transition-all duration-300 hover:-translate-y-1">
      {/* Gradient accent line at top */}
      <div className="absolute top-0 left-6 right-6 h-[2px] bg-gradient-to-r from-transparent via-[var(--primary)] to-transparent opacity-0 group-hover:opacity-60 transition-opacity duration-300" />

      {/* Header: Name + Status */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-heading font-bold text-lg text-[var(--foreground)] truncate group-hover:text-[var(--primary)] transition-colors">
            {agent.name}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`
              shrink-0 px-2.5 py-1 text-xs font-semibold rounded-full border uppercase tracking-wide
              ${status.className}
            `}
          >
            {status.label}
          </span>
          {/* Approve button for pending agents (dev only) */}
          {agent.status === "pending_review" && (
            <button
              onClick={handleApprove}
              disabled={isApproving}
              className="
                shrink-0 px-3 py-1 text-xs font-semibold rounded-full
                bg-[var(--success)] text-white
                hover:bg-[var(--success)]/90
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-all duration-200 hover:shadow-md
              "
            >
              {isApproving ? "..." : "Approve"}
            </button>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-[var(--foreground-muted)] mb-5 line-clamp-2 leading-relaxed">
        {agent.description}
      </p>

      {/* Capabilities */}
      <div className="mb-5">
        <p className="text-[10px] text-[var(--foreground-subtle)] uppercase tracking-widest font-semibold mb-2">
          Capabilities
        </p>
        <p className="text-sm text-[var(--foreground)] line-clamp-2 leading-relaxed">
          {agent.capabilities}
        </p>
      </div>

      {/* Tags: Async / Callback support */}
      {(agent.supportsAsync || agent.supportsCallback) && (
        <div className="flex flex-wrap gap-2 mb-5">
          {agent.supportsAsync && (
            <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide bg-[var(--info-muted)] text-[var(--info)] border border-[var(--info)]/20 rounded-lg">
              Async
            </span>
          )}
          {agent.supportsCallback && (
            <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide bg-[var(--secondary-muted)] text-[var(--secondary)] border border-[var(--secondary)]/20 rounded-lg">
              Callback
            </span>
          )}
        </div>
      )}

      {/* Pricing */}
      <div className="flex items-center justify-between py-4 border-t border-[var(--border)]">
        <div>
          <p className="text-[10px] text-[var(--foreground-subtle)] uppercase tracking-widest font-semibold mb-1">
            Price
          </p>
          <p className="text-xl font-bold text-[var(--foreground)]">
            <span className="bg-gradient-to-r from-[var(--primary)] to-[var(--primary-light)] bg-clip-text text-transparent">
              ${(agent.pricing?.basePrice ?? 0).toFixed(2)}
            </span>
            <span className="text-xs text-[var(--foreground-subtle)] font-medium ml-1.5">
              {agent.pricing?.currency ?? "USDC"}
            </span>
          </p>
        </div>
        {agent.pricing?.negotiable && (
          <span className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide bg-[var(--accent-muted)] text-[var(--accent)] border border-[var(--accent)]/20 rounded-lg">
            Negotiable
          </span>
        )}
      </div>

      {/* Metrics */}
      <div className="flex items-center justify-between pt-4 border-t border-[var(--border)]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--info-muted)] flex items-center justify-center">
            <svg className="w-4 h-4 text-[var(--info)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </div>
          <div>
            <p className="text-base font-bold text-[var(--foreground)]">{agent.metrics?.totalJobs ?? 0}</p>
            <p className="text-[10px] text-[var(--foreground-subtle)] uppercase tracking-wide">Jobs</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--success-muted)] flex items-center justify-center">
            <svg className="w-4 h-4 text-[var(--success)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-base font-bold text-[var(--success)]">{successRate}%</p>
            <p className="text-[10px] text-[var(--foreground-subtle)] uppercase tracking-wide">Success</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--accent-muted)] flex items-center justify-center">
            <svg className="w-4 h-4 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
            </svg>
          </div>
          <div>
            <p className="text-base font-bold text-[var(--accent)]">
              {(agent.metrics?.averageScore ?? 0) > 0 ? agent.metrics?.averageScore?.toFixed(1) : "-"}
            </p>
            <p className="text-[10px] text-[var(--foreground-subtle)] uppercase tracking-wide">Score</p>
          </div>
        </div>
      </div>

      {/* Endpoint */}
      <div className="mt-4 pt-3 border-t border-[var(--border)]">
        <p className="text-xs text-[var(--foreground-subtle)] flex items-center gap-1.5">
          <span className="font-semibold text-[var(--foreground-muted)] shrink-0">Endpoint:</span>
          <span className="truncate">{agent.endpoint}</span>
        </p>
      </div>
    </div>
  );
}

export default AgentCard;
