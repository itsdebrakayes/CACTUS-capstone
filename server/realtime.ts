import { EventEmitter } from "events";
import type { RealtimeEvent } from "@shared/types";

/**
 * Global event emitter for realtime SSE updates
 */
export const eventEmitter = new EventEmitter();

// Keep track of active SSE clients
export const sseClients = new Set<(event: RealtimeEvent) => void>();

/**
 * Register an SSE client to receive events
 */
export function registerSSEClient(callback: (event: RealtimeEvent) => void) {
  sseClients.add(callback);
  return () => {
    sseClients.delete(callback);
  };
}

/**
 * Broadcast event to all connected SSE clients
 */
export function broadcastEvent(event: RealtimeEvent) {
  sseClients.forEach((callback) => {
    try {
      callback(event);
    } catch (error) {
      console.error("[SSE] Error broadcasting event:", error);
    }
  });
}

// Listen for events and broadcast to all clients
eventEmitter.on("event", (event: RealtimeEvent) => {
  broadcastEvent(event);
});
