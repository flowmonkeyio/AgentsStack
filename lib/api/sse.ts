/**
 * Server-Sent Events (SSE) utilities for real-time updates
 *
 * Updated to match the API design specification event types.
 * @see /docs/designs/api/TECH_DESIGN.md
 */

/**
 * SSE Event Types matching the API design specification
 */
export type SSEEventType =
  // Job lifecycle
  | "job:started"
  | "job:planning"
  | "job:plan_verified"
  | "job:executing"
  | "job:completed"
  | "job:failed"
  | "job:continued"
  // Work item lifecycle
  | "work:created"
  | "work:status_changed"
  | "work:prompt_generated"
  | "work:output_received"
  | "work:verified"
  | "work:retry"
  | "work:payment_confirmed"
  | "work:failed"
  // Dynamic spawning
  | "todo:spawned"
  // Reasoning (for UI display)
  | "reasoning"
  // Connection management
  | "heartbeat";

export interface SSEEvent {
  type: SSEEventType;
  data: unknown;
  timestamp: string;
}

export function createSSEEncoder(): TextEncoder {
  return new TextEncoder();
}

export function formatSSEMessage(event: SSEEvent): string {
  const data = JSON.stringify(event.data);
  return `event: ${event.type}\ndata: ${data}\n\n`;
}

export function createSSEStream(): {
  readable: ReadableStream;
  send: (event: SSEEvent) => void;
  close: () => void;
} {
  let controller: ReadableStreamDefaultController | null = null;
  const encoder = createSSEEncoder();

  const readable = new ReadableStream({
    start(c) {
      controller = c;
    },
    cancel() {
      controller = null;
    },
  });

  return {
    readable,
    send: (event: SSEEvent) => {
      if (controller) {
        const message = formatSSEMessage({
          ...event,
          timestamp: event.timestamp || new Date().toISOString(),
        });
        controller.enqueue(encoder.encode(message));
      }
    },
    close: () => {
      if (controller) {
        controller.close();
        controller = null;
      }
    },
  };
}

export function createSSEHeaders(): HeadersInit {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}
