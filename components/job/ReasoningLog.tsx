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
  maxEntries?: number;
}

/**
 * Agent label configuration with premium styling
 */
const AGENT_LABELS: Record<ReasoningAgent, { label: string; bgClass: string; textClass: string }> = {
  main: {
    label: "main",
    bgClass: "bg-secondary-muted",
    textClass: "text-secondary",
  },
  planning: {
    label: "planning",
    bgClass: "bg-info-muted",
    textClass: "text-info",
  },
  plan_verifier: {
    label: "verifier",
    bgClass: "bg-success-muted",
    textClass: "text-success",
  },
  prompt: {
    label: "prompt",
    bgClass: "bg-accent-muted",
    textClass: "text-accent",
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
 * Single reasoning entry component with premium styling
 */
function ReasoningEntryItem({ entry }: { entry: ReasoningEntry }) {
  const agentConfig = AGENT_LABELS[entry.agent];

  return (
    <div className="relative pl-6 pb-6 last:pb-0">
      {/* Timeline dot */}
      <div className={`absolute left-0 top-1 w-3 h-3 rounded-full ${agentConfig.bgClass} ring-4 ring-background`} />

      {/* Timeline line */}
      <div className="absolute left-[5px] top-4 bottom-0 w-0.5 bg-border last:hidden" />

      {/* Content */}
      <div className="space-y-2">
        {/* Header: time, agent, step */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-foreground-subtle font-mono">
            {formatTime(entry.ts)}
          </span>
          <span
            className={`
              text-xs px-2 py-0.5 rounded-full font-medium
              ${agentConfig.bgClass} ${agentConfig.textClass}
            `}
          >
            {agentConfig.label}
          </span>
          <span className="text-xs text-foreground font-medium">{entry.step}</span>
        </div>

        {/* Thought */}
        <p className="text-sm text-foreground-muted italic leading-relaxed">
          &ldquo;{entry.thought}&rdquo;
        </p>

        {/* Decision (if present) */}
        {entry.decision && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-background border border-border">
            <svg className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            <p className="text-sm text-foreground">
              <span className="font-medium text-primary">Decision:</span> {entry.decision}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Custom hook to get responsive max entries based on screen size
 */
function useResponsiveMaxEntries(): number {
  const [maxEntries, setMaxEntries] = useState(10);

  useEffect(() => {
    const updateMaxEntries = () => {
      const width = window.innerWidth;
      if (width < 640) {
        setMaxEntries(3);
      } else if (width < 1024) {
        setMaxEntries(5);
      } else {
        setMaxEntries(10);
      }
    };

    updateMaxEntries();
    window.addEventListener("resize", updateMaxEntries);
    return () => window.removeEventListener("resize", updateMaxEntries);
  }, []);

  return maxEntries;
}

/**
 * ReasoningLog - Display agent reasoning for transparency with premium styling
 */
export function ReasoningLog({ entries, maxEntries }: ReasoningLogProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const responsiveMaxEntries = useResponsiveMaxEntries();

  const effectiveMaxEntries = maxEntries ?? responsiveMaxEntries;
  const displayEntries = isExpanded ? entries : entries.slice(-effectiveMaxEntries);
  const hasMoreEntries = entries.length > effectiveMaxEntries;

  // Empty state
  if (entries.length === 0) {
    return (
      <div className="rounded-xl bg-background-card border border-border overflow-hidden">
        {/* Header */}
        <button
          className="lg:hidden w-full flex justify-between items-center p-4"
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-secondary-muted flex items-center justify-center">
              <svg className="w-4 h-4 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h3 className="font-heading font-semibold text-foreground">Reasoning Log</h3>
          </div>
          <svg
            className={`w-5 h-5 text-foreground-muted transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Desktop header */}
        <div className="hidden lg:flex items-center gap-2 p-4 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-secondary-muted flex items-center justify-center">
            <svg className="w-4 h-4 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h3 className="font-heading font-semibold text-foreground">Reasoning Log</h3>
        </div>

        {/* Empty content */}
        <div className={`${!isExpanded ? "hidden lg:block" : "block"} p-8 text-center`}>
          <p className="text-foreground-muted text-sm">No reasoning entries yet</p>
          <p className="text-foreground-subtle text-xs mt-1">
            Reasoning will appear as the job progresses
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-background-card border border-border overflow-hidden">
      {/* Mobile/Tablet: collapsible header */}
      <button
        className="lg:hidden w-full flex justify-between items-center p-4 border-b border-border"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-secondary-muted flex items-center justify-center">
            <svg className="w-4 h-4 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h3 className="font-heading font-semibold text-foreground">
            Reasoning Log
            <span className="ml-2 text-xs text-foreground-muted font-normal">
              ({entries.length})
            </span>
          </h3>
        </div>
        <svg
          className={`w-5 h-5 text-foreground-muted transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Desktop: always visible header */}
      <div className="hidden lg:flex items-center gap-2 p-4 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-secondary-muted flex items-center justify-center">
          <svg className="w-4 h-4 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <h3 className="font-heading font-semibold text-foreground">
          Reasoning Log
          <span className="ml-2 text-xs text-foreground-muted font-normal">
            ({entries.length} entries)
          </span>
        </h3>
      </div>

      {/* Entries */}
      <div
        className={`
          ${!isExpanded ? "hidden lg:block" : "block"}
          p-4 max-h-[400px] lg:max-h-[600px] overflow-y-auto
        `}
        role="log"
        aria-label="Agent reasoning log"
        aria-live="polite"
      >
        {displayEntries.map((entry, index) => (
          <ReasoningEntryItem key={`${entry.ts}-${index}`} entry={entry} />
        ))}

        {/* Show more button */}
        {!isExpanded && hasMoreEntries && (
          <button
            onClick={() => setIsExpanded(true)}
            className="
              lg:hidden w-full text-center text-sm
              text-primary hover:text-primary-hover
              font-medium py-3 mt-2
              border-t border-border
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
