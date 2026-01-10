/**
 * Server-Sent Events (SSE) utilities for real-time updates
 */

export type SSEEventType =
  | "status"
  | "plan"
  | "work_item"
  | "agent"
  | "verification"
  | "payment"
  | "error"
  | "complete";

export interface SSEEvent {
  type: SSEEventType;
  data: unknown;
  timestamp: string;
}

export function createSSEEncoder(): TextEncoder {
  return new TextEncoder();
}

export function formatSSEMessage(event: SSEEvent): string {
  const data = JSON.stringify(event);
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
