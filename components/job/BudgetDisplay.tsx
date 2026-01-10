"use client";

/**
 * Budget data structure
 */
export interface Budget {
  total: number;
  allocated: number;
  spent: number;
  remaining: number;
}

/**
 * Props interface for BudgetDisplay component
 */
export interface BudgetDisplayProps {
  budget: Budget;
}

/**
 * BudgetDisplay - Show budget allocation and spending with premium styling
 */
export function BudgetDisplay({ budget }: BudgetDisplayProps) {
  // Calculate percentages
  const spentPercent = budget.total > 0 ? (budget.spent / budget.total) * 100 : 0;
  const allocatedPercent =
    budget.total > 0 ? (budget.allocated / budget.total) * 100 : 0;

  // Clamp percentages to 0-100
  const clampedSpent = Math.min(Math.max(spentPercent, 0), 100);
  const clampedAllocated = Math.min(Math.max(allocatedPercent, 0), 100);

  return (
    <div className="p-5 rounded-xl bg-background-card border border-border">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary-muted flex items-center justify-center">
            <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
            </svg>
          </div>
          <h3 className="font-heading font-semibold text-foreground">Budget</h3>
        </div>
        <span className="text-lg font-heading font-bold text-foreground">
          ${budget.total.toFixed(2)}
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="h-3 rounded-full bg-background overflow-hidden relative"
        role="progressbar"
        aria-valuenow={clampedSpent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Budget spent: $${budget.spent.toFixed(2)} of $${budget.total.toFixed(2)}`}
      >
        {/* Spent (success green with glow) */}
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-success to-success/80 rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]"
          style={{ width: `${clampedSpent}%` }}
        />
        {/* Allocated but not spent (warning yellow) */}
        <div
          className="absolute inset-y-0 bg-warning/60 transition-all duration-500"
          style={{
            left: `${clampedSpent}%`,
            width: `${Math.max(0, clampedAllocated - clampedSpent)}%`,
          }}
        />
      </div>

      {/* Legend */}
      <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
        {/* Spent */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-success" />
            <span className="text-foreground-muted text-xs">Spent</span>
          </div>
          <span className="text-foreground font-semibold font-heading">
            ${budget.spent.toFixed(2)}
          </span>
        </div>

        {/* Allocated */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-warning" />
            <span className="text-foreground-muted text-xs">Allocated</span>
          </div>
          <span className="text-foreground font-semibold font-heading">
            ${budget.allocated.toFixed(2)}
          </span>
        </div>

        {/* Remaining */}
        <div className="flex flex-col">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-foreground-subtle" />
            <span className="text-foreground-muted text-xs">Remaining</span>
          </div>
          <span className="text-foreground font-semibold font-heading">
            ${budget.remaining.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default BudgetDisplay;
