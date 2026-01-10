"use client";

import { useState } from "react";
import { WorkItemCard, WorkItemDisplay } from "./WorkItemCard";

/**
 * Props interface for WorkItemList component
 */
export interface WorkItemListProps {
  workItems: WorkItemDisplay[];
  onItemClick?: (work_id: string) => void;
}

/**
 * WorkItemList - Display all work items for a job
 *
 * Layout (from design):
 * - Mobile: Full-width cards, vertically stacked. Tap to expand details.
 * - Tablet: 2-column card grid. Click to expand inline.
 * - Desktop: List view with expandable rows. Side panel for selected item details.
 *
 * Responsive classes:
 * - flex flex-col gap-3: Mobile - vertical stack
 * - md:grid md:grid-cols-2 md:gap-4: Tablet - 2 column grid
 * - lg:flex lg:flex-col lg:gap-2: Desktop - vertical list
 */
export function WorkItemList({ workItems, onItemClick }: WorkItemListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /**
   * Handle item click - toggle expansion and notify parent
   */
  const handleItemClick = (work_id: string) => {
    // Toggle expanded state
    setExpandedId((prev) => (prev === work_id ? null : work_id));

    // Notify parent if callback provided
    if (onItemClick) {
      onItemClick(work_id);
    }
  };

  // Empty state
  if (workItems.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <svg
          className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
        <p className="text-sm sm:text-base">No work items yet</p>
        <p className="text-xs sm:text-sm mt-1">
          Work items will appear here as the job progresses
        </p>
      </div>
    );
  }

  return (
    <div
      className="
        flex flex-col gap-3
        md:grid md:grid-cols-2 md:gap-4
        lg:flex lg:flex-col lg:gap-2
      "
      role="list"
      aria-label="Work items"
    >
      {workItems.map((item) => (
        <div key={item.work_id} role="listitem">
          <WorkItemCard
            workItem={item}
            expanded={expandedId === item.work_id}
            onClick={() => handleItemClick(item.work_id)}
          />
        </div>
      ))}
    </div>
  );
}

// Re-export WorkItemDisplay for convenience
export type { WorkItemDisplay };

export default WorkItemList;
