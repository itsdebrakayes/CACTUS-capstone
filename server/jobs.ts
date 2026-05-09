import * as cron from "node-cron";
import * as db from "./db";
import * as algo from "./algorithms";
import { eventEmitter } from "./realtime";
import { ENV } from "./_core/env";

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

  if (ENV.sqlDisabled) {
    jobsStarted = true;
    console.log("[Jobs] SQL disabled via DISABLE_SQL=true. Skipping background jobs.");
    return;
  }

  if (!ENV.databaseUrl) {
    jobsStarted = true;
    console.log("[Jobs] DATABASE_URL is not configured. Skipping background jobs.");
    return;
  }

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

  // Class report expiry job - runs every 10 minutes
  cron.schedule("*/10 * * * *", async () => {
    await handleClassReportExpiry();
  });

  // Suspension clearing job - runs every 30 minutes
  cron.schedule("*/30 * * * *", async () => {
    await clearExpiredSuspensions();
  });

  // Expired walking request cleanup - runs every 15 minutes
  cron.schedule("*/15 * * * *", async () => {
    await cleanupExpiredWalkingRequests();
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
 * Expire pending class reports whose expiresAt has passed.
 * Applies a small trust penalty (-2) to the reporter for unresolved reports.
 */
async function handleClassReportExpiry() {
  try {
    const expiredReports = await db.getPendingExpiredClassReports();
    for (const report of expiredReports) {
      await db.updateClassReportStatus(report.id, "expired");
      // Small trust penalty for unresolved report
      await db.applyTrustScoreChange(report.reporterUserId, -2, "expired_report", report.id);
      eventEmitter.emit("event", {
        type: "class_report.expired",
        timestamp: Date.now(),
        data: { reportId: report.id, courseId: report.courseId },
      });
    }
    if (expiredReports.length > 0) {
      console.log(`[Jobs] Expired ${expiredReports.length} class reports`);
    }
  } catch (error) {
    console.error("[Jobs] Error in class report expiry job:", error);
  }
}

/**
 * Clear suspensions that have expired.
 */
export async function clearExpiredSuspensions() {
  try {
    const expiredSuspensions = await db.getExpiredSuspensions();
    for (const user of expiredSuspensions) {
      await db.clearUserSuspension(user.id);
      console.log(`[Jobs] Cleared suspension for user ${user.id}`);
    }
    if (expiredSuspensions.length > 0) {
      console.log(`[Jobs] Cleared ${expiredSuspensions.length} expired suspensions`);
    }
  } catch (error) {
    console.error("[Jobs] Error clearing expired suspensions:", error);
  }
}

/**
 * Clean up expired walking requests.
 */
export async function cleanupExpiredWalkingRequests() {
  try {
    const { eq, lt, and } = await import("drizzle-orm");
    const { walkingRequests } = await import("../drizzle/schema");
    const { getDb } = await import("./db");
    const dbConn = await getDb();
    if (!dbConn) return;
    const now = new Date();
    await dbConn
      .update(walkingRequests)
      .set({ status: "expired" })
      .where(and(eq(walkingRequests.status, "open"), lt(walkingRequests.expiresAt, now)));
    console.log("[Jobs] Cleanup of expired walking requests completed");
  } catch (error) {
    console.error("[Jobs] Error cleaning up expired requests:", error);
  }
}

/**
 * Clean up expired class claims (legacy class_claims table).
 */
export async function cleanupExpiredClaims() {
  try {
    const { eq, lt, and } = await import("drizzle-orm");
    const { classClaims } = await import("../drizzle/schema");
    const { getDb } = await import("./db");
    const dbConn = await getDb();
    if (!dbConn) return;
    const now = new Date();
    await dbConn
      .update(classClaims)
      .set({ status: "expired" })
      .where(and(eq(classClaims.status, "pending"), lt(classClaims.expiresAt, now)));
    console.log("[Jobs] Cleanup of expired class claims completed");
  } catch (error) {
    console.error("[Jobs] Error cleaning up expired claims:", error);
  }
}
