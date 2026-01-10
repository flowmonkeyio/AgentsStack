"use client";

import { useState, useEffect } from "react";

/**
 * Agent types for reasoning entries
 */
export type ReasoningAgent = "main" | "planning" | "plan_verifier" | "prompt";

/**
 * Reasoning entry data structure
 */
export interface ReasoningEntry {
  ts: string;
  agent: ReasoningAgent;
  step: string;
  thought: string;
  decision?: string;
}

/**
 * Props interface for ReasoningLog component
 */
export interface ReasoningLogProps {
  entries: ReasoningEntry[];
  maxEntries?: number; // Default: responsive based on breakpoint
}

/**
 * Agent label configuration
 */
const AGENT_LABELS: Record<ReasoningAgent, { label: string; color: string }> = {
  main: {
    label: "main",
    color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  },
  planning: {
    label: "planning",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  },
  plan_verifier: {
    label: "verifier",
    color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  },
  prompt: {
    label: "prompt",
    color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  },
};

/**
 * Format timestamp for display
 */
function formatTime(ts: string): string {
  try {
    const date = new Date(ts);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return ts;
  }
}

/**
 * Single reasoning entry component
 */
function ReasoningEntryItem({ entry }: { entry: ReasoningEntry }) {
  const agentConfig = AGENT_LABELS[entry.agent];

  return (
    <div className="space-y-1">
      {/* Header: time, agent, step */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground font-mono">
          {formatTime(entry.ts)}
        </span>
        <span
          className={`
            text-xs px-1.5 py-0.5 rounded font-medium
            ${agentConfig.color}
          `}
        >
          [{agentConfig.label}]
        </span>
        <span className="text-xs text-foreground font-medium">{entry.step}</span>
      </div>

      {/* Thought */}
      <p className="text-sm text-muted-foreground pl-0 sm:pl-2 italic">
        &ldquo;{entry.thought}&rdquo;
      </p>

      {/* Decision (if present) */}
      {entry.decision && (
        <p className="text-sm text-foreground pl-0 sm:pl-2">
          <span className="font-medium">Decision:</span> {entry.decision}
        </p>
      )}
    </div>
  );
}

/**
 * Chevron icon component
 */
function ChevronIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      className={`w-5 h-5 transition-transform ${direction === "up" ? "rotate-180" : ""}`}
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
  );
}

/**
 * Custom hook to get responsive max entries based on screen size
 *
 * Responsive defaults:
 * - Mobile (<640px): 3 entries
 * - Tablet (640-1023px): 5 entries
 * - Desktop (>=1024px): 10 entries
 */
function useResponsiveMaxEntries(): number {
  const [maxEntries, setMaxEntries] = useState(10); // Default to desktop

  useEffect(() => {
    const updateMaxEntries = () => {
      const width = window.innerWidth;
      if (width < 640) {
        setMaxEntries(3); // Mobile
      } else if (width < 1024) {
        setMaxEntries(5); // Tablet
      } else {
        setMaxEntries(10); // Desktop
      }
    };

    // Set initial value
    updateMaxEntries();

    // Listen for resize
    window.addEventListener("resize", updateMaxEntries);
    return () => window.removeEventListener("resize", updateMaxEntries);
  }, []);

  return maxEntries;
}

/**
 * ReasoningLog - Display agent reasoning for transparency
 *
 * Responsive behavior:
 * - Mobile: Collapsed by default, expandable accordion. Shows only latest 3 entries.
 * - Tablet: Collapsed by default, expandable accordion. Shows latest 5 entries.
 * - Desktop: Always visible sidebar. Shows latest 10 entries with scrollable overflow.
 */
export function ReasoningLog({ entries, maxEntries }: ReasoningLogProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const responsiveMaxEntries = useResponsiveMaxEntries();

  // Use provided maxEntries or responsive default
  const effectiveMaxEntries = maxEntries ?? responsiveMaxEntries;

  // Get entries to display (most recent first, limited by maxEntries unless expanded)
  const displayEntries = isExpanded
    ? entries
    : entries.slice(-effectiveMaxEntries);

  // Check if there are more entries than displayed
  const hasMoreEntries = entries.length > effectiveMaxEntries;

  // Empty state
  if (entries.length === 0) {
    return (
      <div className="border rounded-lg p-4 bg-background">
        {/* Mobile/Tablet: collapsible header */}
        <button
          className="lg:hidden w-full flex justify-between items-center"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
        >
          <h3 className="font-semibold text-foreground">Reasoning Log</h3>
          <ChevronIcon direction={isExpanded ? "up" : "down"} />
        </button>

        {/* Desktop: always visible header */}
        <h3 className="hidden lg:block font-semibold text-foreground mb-4">
          Reasoning Log
        </h3>

        {/* Empty state content */}
        <div
          className={`
            ${!isExpanded ? "hidden lg:block" : "block"}
            text-center py-4 text-muted-foreground
          `}
        >
          <p className="text-sm">No reasoning entries yet</p>
          <p className="text-xs mt-1">
            Reasoning will appear as the job progresses
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="
        border rounded-lg p-4
        bg-background
        max-h-[300px] md:max-h-[400px] lg:max-h-[600px]
        overflow-y-auto
      "
    >
      {/* Mobile/Tablet: collapsible header */}
      <button
        className="lg:hidden w-full flex justify-between items-center mb-2"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <h3 className="font-semibold text-foreground">
          Reasoning Log
          <span className="ml-2 text-xs text-muted-foreground font-normal">
            ({entries.length} entries)
          </span>
        </h3>
        <ChevronIcon direction={isExpanded ? "up" : "down"} />
      </button>

      {/* Desktop: always visible header */}
      <h3 className="hidden lg:block font-semibold text-foreground mb-4">
        Reasoning Log
        <span className="ml-2 text-xs text-muted-foreground font-normal">
          ({entries.length} entries)
        </span>
      </h3>

      {/* Entries */}
      <div
        className={`
          ${!isExpanded ? "hidden lg:block" : "block"}
          space-y-4
        `}
        role="log"
        aria-label="Agent reasoning log"
        aria-live="polite"
      >
        {displayEntries.map((entry, index) => (
          <ReasoningEntryItem key={`${entry.ts}-${index}`} entry={entry} />
        ))}

        {/* Show more button (mobile/tablet when collapsed) */}
        {!isExpanded && hasMoreEntries && (
          <button
            onClick={() => setIsExpanded(true)}
            className="
              lg:hidden
              w-full text-center text-sm text-primary
              hover:text-primary/80
              py-2
            "
          >
            Show {entries.length - effectiveMaxEntries} more entries
          </button>
        )}
      </div>
    </div>
  );
}

export default ReasoningLog;
