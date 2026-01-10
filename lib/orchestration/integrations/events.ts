/**
 * Integration Events Module
 *
 * Event bus implementation for integration events.
 * Uses Node.js EventEmitter for in-process event handling.
 * Events are forwarded to SSE streams for real-time client updates.
 *
 * @see /docs/designs/orchestration/integrations/TECH_DESIGN.md
 */

import { EventEmitter } from "events";
import type { IntegrationEvent } from "./types";

// =============================================================================
// EVENT BUS SINGLETON
// =============================================================================

/**
 * Singleton event bus for the application.
 * In production, could be replaced with Redis pub/sub for multi-instance support.
 */
class IntegrationEventBus extends EventEmitter {
  private static instance: IntegrationEventBus;

  private constructor() {
    super();
    // Increase max listeners for high-concurrency scenarios
    this.setMaxListeners(100);
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): IntegrationEventBus {
    if (!IntegrationEventBus.instance) {
      IntegrationEventBus.instance = new IntegrationEventBus();
    }
    return IntegrationEventBus.instance;
  }
}

/**
 * Global event bus instance
 */
const eventBus = IntegrationEventBus.getInstance();

// =============================================================================
// WILDCARD EVENT NAME
// =============================================================================

/**
 * Wildcard event name used for catch-all subscriptions (e.g., SSE streaming)
 */
const WILDCARD_EVENT = "*";

// =============================================================================
// EVENT EMISSION
// =============================================================================

/**
 * Event handler function type
 */
export type IntegrationEventHandler = (event: IntegrationEvent) => void;

/**
 * Emits an event to the event bus.
 * Events are consumed by:
 * - SSE handler (streams to frontend)
 * - Other modules (inter-module communication)
 *
 * @param event - The event to emit
 */
export function emitEvent(event: IntegrationEvent): void {
  // Emit to specific event type listeners
  eventBus.emit(event.type, event);
  // Also emit to catch-all for SSE streaming
  eventBus.emit(WILDCARD_EVENT, event);
}

// =============================================================================
// EVENT SUBSCRIPTION
// =============================================================================

/**
 * Subscribe to all integration events.
 * Used by SSE handler to stream events to frontend.
 *
 * @param handler - Function to call when events occur
 * @returns Unsubscribe function
 */
export function subscribeToEvents(
  handler: IntegrationEventHandler
): () => void {
  eventBus.on(WILDCARD_EVENT, handler);
  return () => eventBus.off(WILDCARD_EVENT, handler);
}

/**
 * Subscribe to a specific event type.
 *
 * @param eventType - The event type to subscribe to
 * @param handler - Function to call when events occur
 * @returns Unsubscribe function
 */
export function subscribeToEventType(
  eventType: IntegrationEvent["type"],
  handler: IntegrationEventHandler
): () => void {
  eventBus.on(eventType, handler);
  return () => eventBus.off(eventType, handler);
}

/**
 * Subscribe to an event type once (auto-unsubscribe after first event).
 *
 * @param eventType - The event type to subscribe to
 * @param handler - Function to call when event occurs
 */
export function subscribeOnce(
  eventType: IntegrationEvent["type"],
  handler: IntegrationEventHandler
): void {
  eventBus.once(eventType, handler);
}

// =============================================================================
// EVENT BUS UTILITIES
// =============================================================================

/**
 * Get the current listener count for debugging.
 *
 * @param eventType - Optional event type (if omitted, returns total count)
 * @returns Number of listeners
 */
export function getListenerCount(eventType?: string): number {
  if (eventType) {
    return eventBus.listenerCount(eventType);
  }
  // Return total across all events
  return eventBus.eventNames().reduce((total, name) => {
    return total + eventBus.listenerCount(name);
  }, 0);
}

/**
 * Remove all listeners (useful for testing).
 */
export function removeAllListeners(): void {
  eventBus.removeAllListeners();
}

/**
 * Get the raw event bus instance (for advanced usage).
 * Use with caution - prefer the typed functions above.
 */
export function getEventBus(): EventEmitter {
  return eventBus;
}
