import { useEffect, useRef } from "react";

export type SSEEvent = Record<string, unknown>;

export function useSSE(onMessage: (event: SSEEvent) => void, url = "/api/events") {
  const handlerRef = useRef(onMessage);

  useEffect(() => {
    handlerRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (typeof window === "undefined" || !("EventSource" in window)) return;

    const source = new EventSource(url, { withCredentials: true });
    source.onmessage = (message) => {
      try {
        handlerRef.current(JSON.parse(message.data));
      } catch {
        handlerRef.current({ type: "message", data: message.data });
      }
    };

    return () => source.close();
  }, [url]);
}

export function useGeolocation(onPosition: (lat: number, lng: number) => void, intervalMs = 10000) {
  const handlerRef = useRef(onPosition);

  useEffect(() => {
    handlerRef.current = onPosition;
  }, [onPosition]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    let watchId: number | undefined;
    const update = (position: GeolocationPosition) => {
      handlerRef.current(position.coords.latitude, position.coords.longitude);
    };

    navigator.geolocation.getCurrentPosition(update, undefined, { enableHighAccuracy: true, maximumAge: intervalMs });
    watchId = navigator.geolocation.watchPosition(update, undefined, { enableHighAccuracy: true, maximumAge: intervalMs });

    return () => {
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
    };
  }, [intervalMs]);
}