import { useEffect, useCallback, useRef } from "react";
import type { RealtimeEvent } from "@shared/types";

/**
 * Hook for consuming SSE realtime events
 */
export function useSSE(onEvent: (event: RealtimeEvent) => void) {
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Connect to SSE endpoint
    const eventSource = new EventSource("/api/realtime/events");
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onEvent(data);
      } catch (error) {
        console.error("[SSE] Error parsing event:", error);
      }
    };

    eventSource.onerror = (error) => {
      console.error("[SSE] Connection error:", error);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [onEvent]);

  return {
    isConnected: eventSourceRef.current?.readyState === EventSource.OPEN,
  };
}

/**
 * Hook for watching user's geolocation
 */
export function useGeolocation(onLocationChange: (lat: number, lng: number) => void, interval: number = 3000) {
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      console.error("[Geolocation] Geolocation not supported");
      return;
    }

    // Start watching position
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        onLocationChange(latitude, longitude);
      },
      (error) => {
        console.error("[Geolocation] Error:", error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [onLocationChange, interval]);

  return {
    isSupported: !!navigator.geolocation,
  };
}
