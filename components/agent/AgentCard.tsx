"use client";

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
export function AgentCard({ agent }: AgentCardProps) {
  const status = statusConfig[agent.status] || statusConfig.inactive;
  const successRate =
    agent.metrics.totalJobs > 0
      ? Math.round(
          (agent.metrics.successfulJobs / agent.metrics.totalJobs) * 100
        )
      : 0;

  return (
    <div className="group bg-background-card border border-border rounded-xl p-5 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200">
      {/* Header: Name + Status */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-heading font-semibold text-foreground truncate">
            {agent.name}
          </h3>
        </div>
        <span
          className={`
            shrink-0 px-2 py-0.5 text-xs font-medium rounded-full border
            ${status.className}
          `}
        >
          {status.label}
        </span>
      </div>

      {/* Description */}
      <p className="text-sm text-foreground-muted mb-4 line-clamp-2">
        {agent.description}
      </p>

      {/* Capabilities */}
      <div className="mb-4">
        <p className="text-xs text-foreground-subtle uppercase tracking-wider mb-1.5">
          Capabilities
        </p>
        <p className="text-sm text-foreground line-clamp-2">
          {agent.capabilities}
        </p>
      </div>

      {/* Tags: Async / Callback support */}
      {(agent.supportsAsync || agent.supportsCallback) && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {agent.supportsAsync && (
            <span className="px-2 py-0.5 text-xs font-medium bg-info-muted text-info border border-info/20 rounded-full">
              Async
            </span>
          )}
          {agent.supportsCallback && (
            <span className="px-2 py-0.5 text-xs font-medium bg-secondary-muted text-secondary border border-secondary/20 rounded-full">
              Callback
            </span>
          )}
        </div>
      )}

      {/* Pricing */}
      <div className="flex items-center justify-between py-3 border-t border-border">
        <div>
          <p className="text-xs text-foreground-subtle uppercase tracking-wider">
            Price
          </p>
          <p className="text-lg font-semibold text-foreground">
            ${agent.pricing.basePrice.toFixed(2)}
            <span className="text-xs text-foreground-subtle font-normal ml-1">
              {agent.pricing.currency}
            </span>
          </p>
        </div>
        {agent.pricing.negotiable && (
          <span className="px-2 py-0.5 text-xs font-medium bg-accent-muted text-accent border border-accent/20 rounded-full">
            Negotiable
          </span>
        )}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border">
        <div className="text-center">
          <p className="text-lg font-semibold text-foreground">
            {agent.metrics.totalJobs}
          </p>
          <p className="text-xs text-foreground-subtle">Jobs</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-foreground">
            {successRate}%
          </p>
          <p className="text-xs text-foreground-subtle">Success</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-foreground">
            {agent.metrics.averageScore > 0
              ? agent.metrics.averageScore.toFixed(1)
              : "-"}
          </p>
          <p className="text-xs text-foreground-subtle">Avg Score</p>
        </div>
      </div>

      {/* Endpoint (collapsed, shown on hover/focus) */}
      <div className="mt-3 pt-3 border-t border-border opacity-0 group-hover:opacity-100 transition-opacity">
        <p className="text-xs text-foreground-subtle truncate">
          <span className="font-medium">Endpoint:</span> {agent.endpoint}
        </p>
      </div>
    </div>
  );
}

export default AgentCard;
