"use client";

/**
 * useJobStream Hook
 *
 * SSE connection hook with exponential backoff reconnection strategy.
 * @see /docs/designs/frontend/TECH_DESIGN.md
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  WorkItemStatus,
  JobStartedData,
  JobCompletedData,
  WorkCreatedData,
  WorkStatusChangedData,
  WorkOutputReceivedData,
  WorkVerifiedData,
  WorkPaymentConfirmedData,
  ReasoningData,
} from "@/types/api";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Reconnection configuration for SSE connection
 */
export interface ReconnectionConfig {
  initialDelayMs: number; // 1000 (1 second)
  maxDelayMs: number; // 30000 (30 seconds)
  backoffMultiplier: number; // 2
  maxAttempts: number; // 10
  jitterFactor: number; // 0.1 (10% random jitter)
}

/**
 * Default reconnection configuration
 */
export const DEFAULT_RECONNECTION_CONFIG: ReconnectionConfig = {
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  maxAttempts: 10,
  jitterFactor: 0.1,
};

/**
 * Connection state for UI display
 */
export interface ConnectionState {
  isConnected: boolean;
  attemptCount: number;
  lastConnectedAt: Date | null;
  nextRetryAt: Date | null;
}

/**
 * Job state tracked by the hook
 */
export interface JobState {
  status:
    | "planning"
    | "plan_verification"
    | "executing"
    | "completed"
    | "failed";
  version?: number;
}

/**
 * Work item display type for UI rendering
 */
export interface WorkItemDisplay {
  work_id: string;
  action_item_id: number;
  action: string;
  status: WorkItemStatus;
  output?: WorkItemOutput;
  verification?: {
    score: number;
    passed: boolean;
  };
  payment?: {
    amount: number;
    confirmed: boolean;
  };
}

/**
 * Discriminated union for type-safe output content
 */
export type OutputContent =
  | { type: "text"; data: string }
  | { type: "image"; data: ImageOutput }
  | { type: "json"; data: Record<string, unknown> }
  | { type: "markdown"; data: string };

/**
 * Image output structure
 */
export interface ImageOutput {
  url: string;
  alt: string;
  width?: number;
  height?: number;
}

/**
 * Work item output structure
 */
export interface WorkItemOutput {
  title: string;
  description: string;
  content: OutputContent;
}

/**
 * Reasoning entry for transparency display
 */
export interface ReasoningEntry {
  ts: string;
  agent: "main" | "planning" | "plan_verifier" | "prompt";
  step: string;
  thought: string;
  decision?: string;
}

/**
 * Return type of the useJobStream hook
 */
export interface UseJobStreamReturn {
  jobState: JobState | null;
  workItems: WorkItemDisplay[];
  reasoningLog: ReasoningEntry[];
  connectionState: ConnectionState;
  error: Error | null;
  reconnect: () => void;
}

// =============================================================================
// HOOK IMPLEMENTATION
// =============================================================================

/**
 * useJobStream - SSE connection hook with reconnection strategy
 *
 * @param job_id - The job ID to stream updates for
 * @param config - Optional partial configuration to override defaults
 * @returns Object with job state, work items, reasoning log, connection state, error, and reconnect function
 */
export function useJobStream(
  job_id: string,
  config: Partial<ReconnectionConfig> = {}
): UseJobStreamReturn {
  const reconnectionConfig = { ...DEFAULT_RECONNECTION_CONFIG, ...config };

  const [jobState, setJobState] = useState<JobState | null>(null);
  const [workItems, setWorkItems] = useState<Map<string, WorkItemDisplay>>(
    new Map()
  );
  const [reasoningLog, setReasoningLog] = useState<ReasoningEntry[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    isConnected: false,
    attemptCount: 0,
    lastConnectedAt: null,
    nextRetryAt: null,
  });
  const [error, setError] = useState<Error | null>(null);

  // Refs to track reconnection state
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const attemptCountRef = useRef(0);

  /**
   * Calculate delay with exponential backoff and jitter
   */
  const calculateDelay = useCallback(
    (attempt: number): number => {
      const baseDelay = Math.min(
        reconnectionConfig.initialDelayMs *
          Math.pow(reconnectionConfig.backoffMultiplier, attempt),
        reconnectionConfig.maxDelayMs
      );
      // Add jitter to prevent thundering herd
      const jitter =
        baseDelay * reconnectionConfig.jitterFactor * (Math.random() - 0.5);
      return Math.round(baseDelay + jitter);
    },
    [reconnectionConfig]
  );

  /**
   * Connect to the SSE stream
   */
  const connect = useCallback(() => {
    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const eventSource = new EventSource(`/api/jobs/${job_id}/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      attemptCountRef.current = 0;
      setConnectionState({
        isConnected: true,
        attemptCount: 0,
        lastConnectedAt: new Date(),
        nextRetryAt: null,
      });
      setError(null);
    };

    eventSource.onerror = () => {
      eventSource.close();
      eventSourceRef.current = null;

      // Check if we should retry
      if (attemptCountRef.current < reconnectionConfig.maxAttempts) {
        const delay = calculateDelay(attemptCountRef.current);
        attemptCountRef.current += 1;

        setConnectionState((prev) => ({
          ...prev,
          isConnected: false,
          attemptCount: attemptCountRef.current,
          nextRetryAt: new Date(Date.now() + delay),
        }));
        setError(
          new Error(
            `Connection lost. Reconnecting in ${Math.round(delay / 1000)}s...`
          )
        );

        // Schedule reconnection
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      } else {
        // Max attempts reached
        setConnectionState((prev) => ({
          ...prev,
          isConnected: false,
          nextRetryAt: null,
        }));
        setError(
          new Error(
            "Connection failed after maximum retry attempts. Please refresh the page."
          )
        );
      }
    };

    // Job events
    eventSource.addEventListener("job:started", (e: MessageEvent) => {
      const data = JSON.parse(e.data) as JobStartedData;
      setJobState({ status: "planning" });
    });

    eventSource.addEventListener("job:planning", () => {
      setJobState((prev) => ({ ...prev, status: "planning" } as JobState));
    });

    eventSource.addEventListener("job:plan_verified", () => {
      setJobState(
        (prev) => ({ ...prev, status: "plan_verification" } as JobState)
      );
    });

    eventSource.addEventListener("job:executing", () => {
      setJobState((prev) => ({ ...prev, status: "executing" } as JobState));
    });

    eventSource.addEventListener("job:completed", (e: MessageEvent) => {
      const data = JSON.parse(e.data) as JobCompletedData;
      setJobState({ status: "completed", version: data.version });
    });

    eventSource.addEventListener("job:failed", () => {
      setJobState((prev) => ({ ...prev, status: "failed" } as JobState));
    });

    // Work item events
    eventSource.addEventListener("work:created", (e: MessageEvent) => {
      const data = JSON.parse(e.data) as WorkCreatedData;
      setWorkItems(
        (prev) =>
          new Map(prev).set(data.work_id, {
            work_id: data.work_id,
            action_item_id: data.action_item_id,
            action: data.action,
            status: "pending",
          })
      );
    });

    eventSource.addEventListener("work:status_changed", (e: MessageEvent) => {
      const data = JSON.parse(e.data) as WorkStatusChangedData;
      setWorkItems((prev) => {
        const updated = new Map(prev);
        const item = updated.get(data.work_id);
        if (item) {
          updated.set(data.work_id, { ...item, status: data.status });
        }
        return updated;
      });
    });

    eventSource.addEventListener("work:output_received", (e: MessageEvent) => {
      const data = JSON.parse(e.data) as WorkOutputReceivedData;
      setWorkItems((prev) => {
        const updated = new Map(prev);
        const item = updated.get(data.work_id);
        if (item) {
          updated.set(data.work_id, {
            ...item,
            output: {
              title: data.title,
              description: data.description,
              content: data.content as OutputContent,
            },
          });
        }
        return updated;
      });
    });

    eventSource.addEventListener("work:verified", (e: MessageEvent) => {
      const data = JSON.parse(e.data) as WorkVerifiedData;
      setWorkItems((prev) => {
        const updated = new Map(prev);
        const item = updated.get(data.work_id);
        if (item) {
          updated.set(data.work_id, {
            ...item,
            verification: {
              score: data.score,
              passed: data.passed,
            },
          });
        }
        return updated;
      });
    });

    eventSource.addEventListener(
      "work:payment_confirmed",
      (e: MessageEvent) => {
        const data = JSON.parse(e.data) as WorkPaymentConfirmedData;
        setWorkItems((prev) => {
          const updated = new Map(prev);
          const item = updated.get(data.work_id);
          if (item) {
            updated.set(data.work_id, {
              ...item,
              payment: {
                amount: data.amount,
                confirmed: true,
              },
            });
          }
          return updated;
        });
      }
    );

    // Reasoning events
    eventSource.addEventListener("reasoning", (e: MessageEvent) => {
      const data = JSON.parse(e.data) as ReasoningData;
      setReasoningLog((prev) => [
        ...prev,
        {
          ts: new Date().toISOString(),
          agent: data.agent as ReasoningEntry["agent"],
          step: data.step,
          thought: data.thought,
          decision: data.decision,
        },
      ]);
    });

    // Heartbeat keeps connection alive and resets stale detection
    eventSource.addEventListener("heartbeat", () => {
      // Connection is healthy - nothing to do, but confirms we're receiving events
    });
  }, [job_id, calculateDelay, reconnectionConfig.maxAttempts]);

  // Initial connection
  useEffect(() => {
    connect();

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [connect]);

  /**
   * Manual reconnect function for UI retry button
   */
  const reconnect = useCallback(() => {
    attemptCountRef.current = 0;
    connect();
  }, [connect]);

  return {
    jobState,
    workItems: Array.from(workItems.values()),
    reasoningLog,
    connectionState,
    error,
    reconnect, // Allow manual reconnection from UI
  };
}
