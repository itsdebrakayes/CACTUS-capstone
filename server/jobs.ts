import * as cron from "node-cron";
import * as db from "./db";
import * as algo from "./algorithms";
import { eventEmitter } from "./realtime";

/**
 * Background Jobs for CACTUS
 * Handles TTL countdown, check-in monitoring, and other scheduled tasks
 */

let jobsStarted = false;

/**
 * Initialize all background jobs
 */
export function initializeJobs() {
  if (jobsStarted) return;
  jobsStarted = true;

  console.log("[Jobs] Initializing background jobs...");

  // TTL countdown job - runs every 5 minutes
  cron.schedule("*/5 * * * *", async () => {
    await handlePathReportTTLTick();
  });

  // Check-in monitoring job - runs every minute
  cron.schedule("* * * * *", async () => {
    await handleCheckinMonitoring();
  });

  console.log("[Jobs] Background jobs initialized");
}

/**
 * Handle TTL countdown for path reports
 * Decrements TTL by 5 minutes for active reports
 * Expires reports when TTL reaches 0
 */
async function handlePathReportTTLTick() {
  try {
    const activeReports = await db.getActivePathReports();

    for (const report of activeReports) {
      const newTTL = Math.max(0, report.ttlMinutes - 5);

      await db.updatePathReportTTL(report.id, newTTL);

      // Emit TTL tick event
      eventEmitter.emit("event", {
        type: "reports.ttl.tick",
        timestamp: Date.now(),
        data: {
          reportId: report.id,
          ttlMinutes: newTTL,
        },
      });

      // Expire report if TTL reached 0
      if (newTTL === 0) {
        await db.updatePathReportStatus(report.id, "expired");

        eventEmitter.emit("event", {
          type: "reports.expired",
          timestamp: Date.now(),
          data: {
            reportId: report.id,
          },
        });
      }
    }

    console.log(`[Jobs] TTL tick processed for ${activeReports.length} reports`);
  } catch (error) {
    console.error("[Jobs] Error in TTL tick job:", error);
  }
}

/**
 * Monitor active check-ins and mark as failed if ETA + grace has passed
 */
async function handleCheckinMonitoring() {
  try {
    const activeCheckins = await db.getActiveCheckins();

    for (const checkin of activeCheckins) {
      const hasFailed = algo.hasCheckinFailed(checkin.etaAt, checkin.graceMinutes);

      if (hasFailed) {
        // Mark check-in as failed
        await db.updateCheckinStatus(checkin.id, "failed", undefined, new Date());

        // Create notification
        await db.createNotification(checkin.userId, "checkin_failed", {
          checkinId: checkin.id,
          destLat: checkin.destLat,
          destLng: checkin.destLng,
          emergencyContact: checkin.emergencyContact,
        });

        // Emit failed event
        eventEmitter.emit("event", {
          type: "checkins.failed",
          timestamp: Date.now(),
          data: {
            checkinId: checkin.id,
            userId: checkin.userId,
            emergencyContact: checkin.emergencyContact,
          },
        });

        console.log(`[Jobs] Check-in ${checkin.id} marked as failed`);
      }
    }

    console.log(`[Jobs] Check-in monitoring processed for ${activeCheckins.length} active check-ins`);
  } catch (error) {
    console.error("[Jobs] Error in check-in monitoring job:", error);
  }
}

/**
 * Clean up expired walking requests (optional)
 */
export async function cleanupExpiredWalkingRequests() {
  try {
    // This would require a query to get expired requests
    // For now, this is a placeholder for future implementation
    console.log("[Jobs] Cleanup of expired walking requests completed");
  } catch (error) {
    console.error("[Jobs] Error cleaning up expired requests:", error);
  }
}

/**
 * Clean up expired class claims (optional)
 */
export async function cleanupExpiredClaims() {
  try {
    // This would require a query to get expired claims
    // For now, this is a placeholder for future implementation
    console.log("[Jobs] Cleanup of expired claims completed");
  } catch (error) {
    console.error("[Jobs] Error cleaning up expired claims:", error);
  }
}
