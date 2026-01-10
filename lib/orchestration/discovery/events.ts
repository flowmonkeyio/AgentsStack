/**
 * Discovery Event Emission
 *
 * Discovery events for SSE streaming to the frontend.
 * Events are published to the job-specific event bus channel.
 *
 * @see /docs/designs/orchestration/discovery/TECH_DESIGN.md
 */

// =============================================================================
// EVENT TYPES
// =============================================================================

/**
 * Discovery event types for SSE streaming.
 * Events are published to the job-specific event bus channel.
 */
export type DiscoveryEvent =
  | {
      type: "discovery:started";
      job_id: string;
      task: string;
      timestamp: Date;
    }
  | {
      type: "discovery:embedding_complete";
      job_id: string;
      tokens: number;
      cost: number;
      timestamp: Date;
    }
  | {
      type: "discovery:vector_search_complete";
      job_id: string;
      candidates_count: number;
      search_time_ms: number;
      timestamp: Date;
    }
  | {
      type: "discovery:rerank_complete";
      job_id: string;
      top_candidates: string[];
      timestamp: Date;
    }
  | {
      type: "discovery:complete";
      job_id: string;
      candidates_count: number;
      total_cost: number;
      total_time_ms: number;
      timestamp: Date;
    }
  | {
      type: "discovery:error";
      job_id: string;
      error: string;
      timestamp: Date;
    };

// =============================================================================
// EVENT EMITTER INTERFACE
// =============================================================================

/**
 * Event emitter interface (injected from ORCH_GRAPH event bus).
 * In production, this publishes to Redis pub/sub for SSE streaming.
 */
export interface DiscoveryEventEmitter {
  emit(event: DiscoveryEvent): void;
}

/**
 * Default no-op emitter for standalone usage or testing.
 */
export const noOpEmitter: DiscoveryEventEmitter = {
  emit: () => {},
};

// =============================================================================
// EVENT BUS INTERFACE
// =============================================================================

/**
 * Event bus interface for publishing discovery events.
 * This matches the pattern established in ORCH_GRAPH.
 */
export interface EventBus {
  publish: (channel: string, event: unknown) => void;
}

// =============================================================================
// EMITTER FACTORY
// =============================================================================

/**
 * Create an event emitter that publishes to the ORCH_GRAPH event bus.
 * This follows the pattern established in ORCH_GRAPH for SSE streaming.
 *
 * @param eventBus - The event bus instance (Redis pub/sub or similar)
 * @param job_id - The job ID for channel routing
 */
export function createDiscoveryEmitter(
  eventBus: EventBus,
  job_id: string
): DiscoveryEventEmitter {
  return {
    emit: (event: DiscoveryEvent) => {
      // Publish to job-specific channel for SSE streaming
      eventBus.publish(`job:${job_id}`, event);
    },
  };
}
