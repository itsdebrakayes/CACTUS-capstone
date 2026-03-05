import { Router } from "express";
import { registerSSEClient, sseClients } from "./realtime";
import type { RealtimeEvent } from "@shared/types";

/**
 * SSE Router for real-time event streaming
 */
export const sseRouter = Router();

/**
 * GET /realtime/events - Server-Sent Events stream
 * Clients connect here to receive real-time updates
 */
sseRouter.get("/events", (req, res) => {
  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  // Send initial connection message
  res.write("data: {\"type\":\"connected\",\"timestamp\":" + Date.now() + "}\n\n");

  // Register this client to receive events
  const unregister = registerSSEClient((event: RealtimeEvent) => {
    try {
      res.write("data: " + JSON.stringify(event) + "\n\n");
    } catch (error) {
      console.error("[SSE] Error writing to client:", error);
      unregister();
    }
  });

  // Handle client disconnect
  req.on("close", () => {
    unregister();
    console.log("[SSE] Client disconnected");
  });

  req.on("error", (error) => {
    console.error("[SSE] Client error:", error);
    unregister();
  });

  // Send heartbeat every 30 seconds to keep connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
    } catch (error) {
      clearInterval(heartbeat);
      unregister();
    }
  }, 30000);

  // Cleanup on response end
  res.on("finish", () => {
    clearInterval(heartbeat);
    unregister();
  });
});

/**
 * GET /realtime/stats - Get current SSE client count (optional monitoring endpoint)
 */
sseRouter.get("/stats", (req, res) => {
  res.json({
    connectedClients: sseClients.size,
    timestamp: Date.now(),
  });
});
