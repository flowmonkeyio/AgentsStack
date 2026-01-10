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
 * WorkItemList - Display all work items for a job with premium styling
 */
export function WorkItemList({ workItems, onItemClick }: WorkItemListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /**
   * Handle item click - toggle expansion and notify parent
   */
  const handleItemClick = (work_id: string) => {
    setExpandedId((prev) => (prev === work_id ? null : work_id));
    if (onItemClick) {
      onItemClick(work_id);
    }
  };

  // Empty state
  if (workItems.length === 0) {
    return (
      <div className="text-center py-12 px-4 rounded-xl bg-background-card border border-border">
        <div className="w-14 h-14 rounded-2xl bg-primary-muted flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-7 h-7 text-primary"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
        </div>
        <p className="text-foreground font-heading font-semibold mb-1">No work items yet</p>
        <p className="text-sm text-foreground-muted">
          Work items will appear here as the job progresses
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3" role="list" aria-label="Work items">
      {workItems.map((item, index) => (
        <div
          key={item.work_id}
          role="listitem"
          className="opacity-0 animate-fade-up"
          style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'forwards' }}
        >
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
