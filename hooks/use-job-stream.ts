"use client";

import { useState, useEffect, useCallback } from "react";
import type { SSEEvent } from "@/lib/api";

interface JobStreamState {
  isConnected: boolean;
  events: SSEEvent[];
  error: string | null;
}

export function useJobStream(jobId: string | null) {
  const [state, setState] = useState<JobStreamState>({
    isConnected: false,
    events: [],
    error: null,
  });

  const connect = useCallback(() => {
    if (!jobId) return;

    const eventSource = new EventSource(`/api/jobs/${jobId}/stream`);

    eventSource.onopen = () => {
      setState((prev) => ({ ...prev, isConnected: true, error: null }));
    };

    eventSource.onerror = () => {
      setState((prev) => ({
        ...prev,
        isConnected: false,
        error: "Connection lost",
      }));
      eventSource.close();
    };

    const eventTypes = [
      "status",
      "plan",
      "work_item",
      "agent",
      "verification",
      "payment",
      "error",
      "complete",
    ];

    eventTypes.forEach((type) => {
      eventSource.addEventListener(type, (e) => {
        const event = JSON.parse(e.data) as SSEEvent;
        setState((prev) => ({
          ...prev,
          events: [...prev.events, event],
        }));

        if (type === "complete" || type === "error") {
          eventSource.close();
          setState((prev) => ({ ...prev, isConnected: false }));
        }
      });
    });

    return () => {
      eventSource.close();
    };
  }, [jobId]);

  useEffect(() => {
    const cleanup = connect();
    return cleanup;
  }, [connect]);

  return {
    ...state,
    reconnect: connect,
  };
}
