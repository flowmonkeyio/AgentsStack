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
 * BudgetDisplay - Show budget allocation and spending
 *
 * Visual: progress bar showing spent vs total
 * Colors: spent (green), allocated (yellow), remaining (gray)
 *
 * Responsive behavior:
 * - Mobile: Horizontal progress bar with total/spent numbers below (stacked)
 * - Tablet: Same as mobile, slightly larger
 * - Desktop: Horizontal bar with inline labels (Spent | Allocated | Remaining)
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
    <div className="p-4 bg-muted/50 rounded-lg border border-border">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-foreground">Budget</h3>
        <span className="text-sm text-muted-foreground">
          ${budget.total.toFixed(2)} total
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="h-3 bg-muted rounded-full overflow-hidden relative"
        role="progressbar"
        aria-valuenow={clampedSpent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Budget spent: $${budget.spent.toFixed(2)} of $${budget.total.toFixed(2)}`}
      >
        {/* Spent (green) */}
        <div
          className="absolute inset-y-0 left-0 bg-green-500 transition-all duration-300"
          style={{ width: `${clampedSpent}%` }}
        />
        {/* Allocated but not spent (yellow) */}
        <div
          className="absolute inset-y-0 bg-yellow-400 transition-all duration-300"
          style={{
            left: `${clampedSpent}%`,
            width: `${Math.max(0, clampedAllocated - clampedSpent)}%`,
          }}
        />
        {/* Remaining is the gray background (implicit) */}
      </div>

      {/* Legend */}
      <div
        className="
          mt-3
          flex flex-col gap-1
          lg:flex-row lg:justify-between lg:gap-4
          text-sm
        "
      >
        {/* Spent */}
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 bg-green-500 rounded-sm flex-shrink-0" />
          <span className="text-muted-foreground">Spent:</span>
          <span className="text-foreground font-medium">
            ${budget.spent.toFixed(2)}
          </span>
        </div>

        {/* Separator (desktop only) */}
        <span className="hidden lg:inline text-muted-foreground">|</span>

        {/* Allocated */}
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 bg-yellow-400 rounded-sm flex-shrink-0" />
          <span className="text-muted-foreground">Allocated:</span>
          <span className="text-foreground font-medium">
            ${budget.allocated.toFixed(2)}
          </span>
        </div>

        {/* Separator (desktop only) */}
        <span className="hidden lg:inline text-muted-foreground">|</span>

        {/* Remaining */}
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 bg-muted border border-border rounded-sm flex-shrink-0" />
          <span className="text-muted-foreground">Remaining:</span>
          <span className="text-foreground font-medium">
            ${budget.remaining.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default BudgetDisplay;
