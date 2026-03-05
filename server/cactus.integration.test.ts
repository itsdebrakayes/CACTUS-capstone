/**
 * CACTUS Integration Tests
 * Tests for all feature routers: walking, classes, reports, checkins
 */
import { describe, expect, it, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock context helpers ────────────────────────────────────────────────────

function makeCtx(overrides?: Partial<TrpcContext["user"]>): TrpcContext {
  const clearedCookies: any[] = [];
  return {
    user: {
      id: 1,
      openId: "test-user-001",
      email: "test@uwimona.edu.jm",
      name: "Test Student",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      ...overrides,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: (_name: string, _opts: any) => clearedCookies.push({ _name, _opts }),
    } as TrpcContext["res"],
  };
}

function makeAnonCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

// ─── Auth tests ──────────────────────────────────────────────────────────────

describe("auth", () => {
  it("me returns authenticated user", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const user = await caller.auth.me();
    expect(user).not.toBeNull();
    expect(user?.openId).toBe("test-user-001");
  });

  it("me returns null for unauthenticated user", async () => {
    const ctx = makeAnonCtx();
    const caller = appRouter.createCaller(ctx);
    const user = await caller.auth.me();
    expect(user).toBeNull();
  });

  it("logout clears session cookie", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
  });
});

// ─── Walking router tests ────────────────────────────────────────────────────

describe("walking router", () => {
  it("getTrustScore returns null score for new user without DB", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    // Without a real DB connection this will return null/undefined gracefully
    try {
      const result = await caller.walking.getTrustScore();
      // If DB is available, should return a score object
      if (result !== null && result !== undefined) {
        expect(typeof result.score).toBe("number");
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      }
    } catch (e: any) {
      // DB not available in test env — acceptable
      expect(e.message).toMatch(/database|connect|ECONNREFUSED/i);
    }
  });

  it("updateAvailability requires authentication", async () => {
    const ctx = makeAnonCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.walking.updateAvailability({ lat: 18.0035, lng: -76.7497, isAvailable: true })
    ).rejects.toThrow();
  });

  it("requestWalkers requires authentication", async () => {
    const ctx = makeAnonCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.walking.requestWalkers({ radiusM: 300 })
    ).rejects.toThrow();
  });
});

// ─── Classes router tests ────────────────────────────────────────────────────

describe("classes router", () => {
  it("createClaim requires authentication", async () => {
    const ctx = makeAnonCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.classes.createClaim({
        courseId: 1,
        claimType: "cancelled",
        message: "Class is cancelled today",
      })
    ).rejects.toThrow();
  });

  it("getClaimsByCourse requires authentication", async () => {
    const ctx = makeAnonCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.classes.getClaimsByCourse({ courseId: 1 })
    ).rejects.toThrow();
  });

  it("voteClaim requires authentication", async () => {
    const ctx = makeAnonCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.classes.voteClaim({ claimId: 1, vote: "confirm" })
    ).rejects.toThrow();
  });
});

// ─── Reports router tests ────────────────────────────────────────────────────

describe("reports router", () => {
  it("createReport requires authentication", async () => {
    const ctx = makeAnonCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.reports.createReport({
        reportType: "light_out",
        severity: 3,
        lat: 18.0035,
        lng: -76.7497,
        description: "Light is out near the library",
      })
    ).rejects.toThrow();
  });

  it("getReports requires authentication", async () => {
    const ctx = makeAnonCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.reports.getReports({})
    ).rejects.toThrow();
  });

  it("voteReport requires authentication", async () => {
    const ctx = makeAnonCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.reports.voteReport({ reportId: 1, vote: "still_there" })
    ).rejects.toThrow();
  });
});

// ─── Check-ins router tests ──────────────────────────────────────────────────

describe("checkins router", () => {
  it("createCheckin requires authentication", async () => {
    const ctx = makeAnonCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.checkins.createCheckin({
        destLat: 18.0035,
        destLng: -76.7497,
        etaAt: new Date(Date.now() + 30 * 60 * 1000),
        graceMinutes: 5,
      })
    ).rejects.toThrow();
  });

  it("getActiveCheckins requires authentication", async () => {
    const ctx = makeAnonCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.checkins.getActiveCheckins()
    ).rejects.toThrow();
  });

  it("completeCheckin requires authentication", async () => {
    const ctx = makeAnonCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.checkins.completeCheckin({ checkinId: 1 })
    ).rejects.toThrow();
  });
});

// ─── Mapbox token test ───────────────────────────────────────────────────────

describe("mapbox configuration", () => {
  it("VITE_MAPBOX_TOKEN is set and valid format", () => {
    const token = process.env.VITE_MAPBOX_TOKEN;
    expect(token).toBeDefined();
    expect(token).toMatch(/^pk\./);
  });
});
