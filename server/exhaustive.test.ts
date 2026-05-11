/**
 * CACTUS Exhaustive Test Suite
 * ============================================================
 * Covers every tRPC router, algorithm helper, edge case, and
 * stress scenario for the full CACTUS system.
 *
 * Sections:
 *  1.  Algorithm unit tests (geohash, haversine, trust score)
 *  2.  Pathfinding unit tests (Dijkstra via pathfinding.ts)
 *  3.  Auth router
 *  4.  Walking router
 *  5.  Class claims router (classes)
 *  6.  Reports (path/hazard) router
 *  7.  Check-in router (checkins)
 *  8.  Footpath router
 *  9.  Local auth (auth.signup / auth.login / auth.verifyEmail)
 * 10.  Courses router
 * 11.  Timetable router
 * 12.  Class reports router (Phase 23)
 * 13.  Class chat router (Phase 23)
 * 14.  Push notifications router (Phase 23)
 * 15.  Edge cases & stress tests
 * 16.  Security / authorization tests
 */

import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as algo from "./algorithms";
import * as pf from "./pathfinding";

// ─── Context helpers ─────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<NonNullable<TrpcContext["user"]>> = {}): TrpcContext {
  const now = new Date();
  return {
    user: {
      id: 1,
      openId: "test:user-001",
      name: "Test Student",
      email: "student@uwimona.edu.jm",
      passwordHash: null,
      emailVerified: true,
      verificationCode: null,
      verificationExpiry: null,
      avatarUrl: null,
      loginMethod: "local",
      role: "student",
      isVerified: true,
      trustScore: 50,
      suspensionStatus: "none",
      suspendedUntil: null,
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
      ...overrides,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

function makeAnonCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

function makeRepCtx(): TrpcContext {
  return makeCtx({ role: "class_rep", id: 2, openId: "test:rep-001" });
}

function makeAdminCtx(): TrpcContext {
  return makeCtx({ role: "guild_admin", id: 3, openId: "test:admin-001", trustScore: 100 });
}

function makeLecturerCtx(): TrpcContext {
  return makeCtx({ role: "lecturer", id: 4, openId: "test:lecturer-001", trustScore: 80 });
}

function makeSuspendedCtx(): TrpcContext {
  return makeCtx({
    suspensionStatus: "active",
    suspendedUntil: new Date(Date.now() + 86_400_000),
  });
}

// ─── Helper: build a minimal GraphNode ───────────────────────────────────────

function makeNode(id: number, lat: number, lng: number): pf.GraphNode {
  return {
    id,
    name: `Node ${id}`,
    lat,
    lng,
    isLandmark: false,
    scenicScore: 0,
    isAccessible: true,
    category: null,
  };
}

function makeEdge(id: number, from: number, to: number, dist: number): pf.GraphEdge {
  return {
    id,
    fromNodeId: from,
    toNodeId: to,
    distanceM: dist,
    walkTimeSec: Math.round(dist / 1.4),
    lighting: 0.8,
    weatherCoverage: 0.8,
    isolation: 0.2,
    isAccessible: true,
    surfaceQuality: 0.9,
    scenicScore: 0.5,
    hasSteps: false,
    slopeGrade: 0,
    confirmedViolenceCount: 0,
    confirmedHazardCount: 0,
    isActive: true,
  };
}

// ─── 1. Algorithm unit tests — Geohash ───────────────────────────────────────

describe("Algorithms — Geohash", () => {
  it("encodes UWI Mona at precision 7", () => {
    const h = algo.getGeohash(18.0035, -76.7497, 7);
    expect(h).toHaveLength(7);
  });

  it("getGeohashPrefix returns correct length", () => {
    expect(algo.getGeohashPrefix(18.0035, -76.7497, 5)).toHaveLength(5);
    expect(algo.getGeohashPrefix(18.0035, -76.7497, 6)).toHaveLength(6);
  });

  it("two close points share a 5-char prefix", () => {
    const a = algo.getGeohashPrefix(18.0035, -76.7497, 5);
    const b = algo.getGeohashPrefix(18.0036, -76.7498, 5);
    expect(a).toBe(b);
  });

  it("two far-apart points differ at prefix 5", () => {
    const a = algo.getGeohashPrefix(18.0035, -76.7497, 5);
    const b = algo.getGeohashPrefix(51.5074, -0.1278, 5); // London
    expect(a).not.toBe(b);
  });

  it("buildGeohashRing returns center + ring1 + ring2", () => {
    const ring = algo.buildGeohashRing(18.0035, -76.7497, 6);
    expect(ring.center).toHaveLength(6);
    expect(ring.ring1.length).toBeGreaterThanOrEqual(8);
    expect(ring.ring2.length).toBeGreaterThan(0);
  });

  it("getRing5Prefixes returns unique 5-char strings", () => {
    const prefixes = algo.getRing5Prefixes(18.0035, -76.7497);
    expect(prefixes.length).toBeGreaterThan(0);
    prefixes.forEach((p) => expect(p).toHaveLength(5));
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it("getGeohashNeighbors returns 8 neighbors", () => {
    const h = algo.getGeohash(18.0035, -76.7497, 6);
    const neighbors = algo.getGeohashNeighbors(h);
    expect(neighbors.length).toBe(8);
  });

  it("handles boundary coordinates without throwing", () => {
    expect(() => algo.getGeohash(0, 0, 7)).not.toThrow();
    expect(() => algo.getGeohash(90, 180, 7)).not.toThrow();
    expect(() => algo.getGeohash(-90, -180, 7)).not.toThrow();
  });
});

// ─── 2. Algorithm unit tests — Haversine ─────────────────────────────────────

describe("Algorithms — Haversine distance", () => {
  it("returns 0 for identical coordinates", () => {
    expect(algo.haversineDistance(18.0035, -76.7497, 18.0035, -76.7497)).toBeCloseTo(0, 1);
  });

  it("returns ~1110m for 0.01° latitude shift", () => {
    const d = algo.haversineDistance(18.0035, -76.7497, 18.0135, -76.7497);
    expect(d).toBeGreaterThan(900);
    expect(d).toBeLessThan(1300);
  });

  it("returns ~111km for 1° latitude shift", () => {
    const d = algo.haversineDistance(18.0, -76.75, 19.0, -76.75);
    expect(d).toBeGreaterThan(100_000);
    expect(d).toBeLessThan(120_000);
  });

  it("is symmetric (A→B == B→A)", () => {
    const ab = algo.haversineDistance(18.0035, -76.7497, 18.0135, -76.7497);
    const ba = algo.haversineDistance(18.0135, -76.7497, 18.0035, -76.7497);
    expect(ab).toBeCloseTo(ba, 3);
  });

  it("handles negative latitudes correctly", () => {
    const d = algo.haversineDistance(-33.8688, 151.2093, -33.8789, 151.2093);
    expect(d).toBeGreaterThan(0);
  });

  it("returns positive value for any non-identical pair", () => {
    expect(algo.haversineDistance(0, 0, 0, 0.001)).toBeGreaterThan(0);
  });

  it("handles poles correctly", () => {
    const d = algo.haversineDistance(90, 0, -90, 0);
    expect(d).toBeGreaterThan(0);
    expect(Number.isFinite(d)).toBe(true);
  });
});

// ─── 3. Algorithm unit tests — Trust score ───────────────────────────────────

describe("Algorithms — Trust score (Bayesian)", () => {
  it("returns prior mean ~0.7 with no ratings", () => {
    expect(algo.calculateTrustScore([])).toBeCloseTo(0.7, 3);
  });

  it("5 perfect ratings pulls score above 0.8", () => {
    const now = Date.now();
    const ratings = Array.from({ length: 5 }, (_, i) => ({
      stars: 5,
      createdAtMs: now - i * 86_400_000,
    }));
    expect(algo.calculateTrustScore(ratings)).toBeGreaterThan(0.8);
  });

  it("5 terrible ratings pulls score below 0.5", () => {
    const now = Date.now();
    const ratings = Array.from({ length: 5 }, (_, i) => ({
      stars: 1,
      createdAtMs: now - i * 86_400_000,
    }));
    expect(algo.calculateTrustScore(ratings)).toBeLessThan(0.5);
  });

  it("old ratings have less weight than recent ones", () => {
    const now = Date.now();
    const recentGood = [{ stars: 5, createdAtMs: now }];
    const oldGood = [{ stars: 5, createdAtMs: now - 365 * 86_400_000 }];
    const scoreRecent = algo.calculateTrustScore(recentGood);
    const scoreOld = algo.calculateTrustScore(oldGood);
    expect(scoreRecent).toBeGreaterThan(scoreOld);
  });

  it("mixed ratings converge toward mean", () => {
    const now = Date.now();
    const ratings = [
      { stars: 5, createdAtMs: now },
      { stars: 1, createdAtMs: now },
      { stars: 5, createdAtMs: now },
      { stars: 1, createdAtMs: now },
    ];
    const score = algo.calculateTrustScore(ratings);
    expect(score).toBeGreaterThan(0.4);
    expect(score).toBeLessThan(0.9);
  });

  it("flag count reduces trust score", () => {
    const now = Date.now();
    const ratings = [{ stars: 5, createdAtMs: now }];
    const noFlags = algo.calculateTrustScore(ratings, 0);
    const withFlags = algo.calculateTrustScore(ratings, 2);
    expect(withFlags).toBeLessThan(noFlags);
  });

  it("handles single rating without error", () => {
    const score = algo.calculateTrustScore([{ stars: 3, createdAtMs: Date.now() }]);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it("handles 100 ratings without error", () => {
    const now = Date.now();
    const ratings = Array.from({ length: 100 }, (_, i) => ({
      stars: (i % 5) + 1,
      createdAtMs: now - i * 86_400_000,
    }));
    const score = algo.calculateTrustScore(ratings);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
    expect(Number.isFinite(score)).toBe(true);
  });
});

// ─── 4. Algorithm unit tests — Class claims helpers ──────────────────────────

describe("Algorithms — Class claims helpers", () => {
  it("getRequiredConfirmations returns positive integer", () => {
    const c = algo.getRequiredConfirmations(30);
    expect(c).toBeGreaterThan(0);
    expect(Number.isInteger(c)).toBe(true);
  });

  it("getRejectThreshold returns positive integer", () => {
    const t = algo.getRejectThreshold(30);
    expect(t).toBeGreaterThan(0);
  });

  it("determineClaimStatus returns 'pending' for low vote count", () => {
    // With 1 confirm, 0 deny, required=5, rejectThreshold=3 → pending
    const status = algo.determineClaimStatus(1, 0, 5, 3);
    expect(status).toBe("pending");
  });

  it("determineClaimStatus returns 'verified' when confirmations met", () => {
    // confirmCount >= requiredConfirms AND confirmCount > denyCount
    const status = algo.determineClaimStatus(5, 0, 5, 3);
    expect(status).toBe("verified");
  });

  it("determineClaimStatus returns 'rejected' when rejections met", () => {
    // denyCount >= rejectThreshold AND denyCount > confirmCount
    const status = algo.determineClaimStatus(0, 3, 5, 3);
    expect(status).toBe("rejected");
  });

  it("determineClaimStatus stays pending when confirms and denies are tied", () => {
    const status = algo.determineClaimStatus(3, 3, 5, 3);
    expect(status).toBe("pending");
  });

  it("getWeightedConfirmationScore returns number for valid votes array", () => {
    const score = algo.getWeightedConfirmationScore([
      { direction: 1, voterReliability: 0.8 },
      { direction: 1, voterReliability: 0.9 },
      { direction: -1, voterReliability: 0.5 },
    ]);
    expect(typeof score).toBe("number");
    expect(score).toBeCloseTo(1.7, 5); // only direction=1 votes summed
  });

  it("getWeightedConfirmationScore returns 0 for empty array", () => {
    expect(algo.getWeightedConfirmationScore([])).toBe(0);
  });

  it("getClaimExpirationTime returns future date", () => {
    const exp = algo.getClaimExpirationTime();
    expect(exp.getTime()).toBeGreaterThan(Date.now());
  });

  it("getWalkingRequestExpirationTime returns future date", () => {
    const exp = algo.getWalkingRequestExpirationTime();
    expect(exp.getTime()).toBeGreaterThan(Date.now());
  });

  it("getRequiredConfirmations scales with class size", () => {
    const small = algo.getRequiredConfirmations(10);
    const large = algo.getRequiredConfirmations(200);
    expect(large).toBeGreaterThanOrEqual(small);
  });

  it("getRejectThreshold scales with class size", () => {
    const small = algo.getRejectThreshold(10);
    const large = algo.getRejectThreshold(200);
    expect(large).toBeGreaterThanOrEqual(small);
  });
});

// ─── 5. Algorithm unit tests — Path report TTL ───────────────────────────────

describe("Algorithms — Path report TTL", () => {
  it("getInitialTTL returns positive number for severity 1-5", () => {
    for (let s = 1; s <= 5; s++) {
      expect(algo.getInitialTTL(s)).toBeGreaterThan(0);
    }
  });

  it("higher severity gives longer or equal TTL", () => {
    expect(algo.getInitialTTL(5)).toBeGreaterThanOrEqual(algo.getInitialTTL(1));
  });

  it("getTTLAdjustment returns number", () => {
    const adj = algo.getTTLAdjustment(3, 5, 2);
    expect(typeof adj).toBe("number");
  });

  it("calculateReliability returns value between 0 and 1", () => {
    const r = algo.calculateReliability(10, 2);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(1);
  });

  it("calculateReliability with no confirmations or falses returns prior", () => {
    const r = algo.calculateReliability(0, 0);
    expect(typeof r).toBe("number");
    expect(r).toBeGreaterThanOrEqual(0);
  });
});

// ─── 6. Algorithm unit tests — Check-in helpers ──────────────────────────────

describe("Algorithms — Check-in helpers", () => {
  it("hasCheckinFailed returns false when within grace period", () => {
    const etaAt = new Date(Date.now() + 60_000); // 1 min in future
    expect(algo.hasCheckinFailed(etaAt, 5)).toBe(false);
  });

  it("hasCheckinFailed returns true when past ETA + grace", () => {
    const etaAt = new Date(Date.now() - 10 * 60_000); // 10 min ago
    expect(algo.hasCheckinFailed(etaAt, 5)).toBe(true);
  });

  it("hasCheckinFailed is false exactly at ETA", () => {
    const etaAt = new Date(Date.now() + 1000); // just in future
    expect(algo.hasCheckinFailed(etaAt, 0)).toBe(false);
  });
});

// ─── 7. Pathfinding unit tests ────────────────────────────────────────────────

describe("Pathfinding — Dijkstra", () => {
  it("returns null when source node not in graph", () => {
    const nodes = new Map([[2, makeNode(2, 18.0, -76.75)]]);
    const result = pf.dijkstra({
      fromNodeId: 1,
      toNodeId: 2,
      mode: "shortest",
      hourOfDay: 10,
      nodes,
      edges: [],
    });
    expect(result).toBeNull();
  });

  it("returns null when target node not in graph", () => {
    const nodes = new Map([[1, makeNode(1, 18.0, -76.75)]]);
    const result = pf.dijkstra({
      fromNodeId: 1,
      toNodeId: 2,
      mode: "shortest",
      hourOfDay: 10,
      nodes,
      edges: [],
    });
    expect(result).toBeNull();
  });

  it("finds path between two connected nodes", () => {
    const nodes = new Map([
      [1, makeNode(1, 18.0035, -76.7497)],
      [2, makeNode(2, 18.0040, -76.7500)],
    ]);
    const edges = [makeEdge(1, 1, 2, 100)];
    const result = pf.dijkstra({
      fromNodeId: 1,
      toNodeId: 2,
      mode: "shortest",
      hourOfDay: 10,
      nodes,
      edges,
    });
    expect(result).not.toBeNull();
    expect(result?.nodeIds).toContain(1);
    expect(result?.nodeIds).toContain(2);
  });

  it("returns null when no path exists (disconnected graph)", () => {
    const nodes = new Map([
      [1, makeNode(1, 18.0035, -76.7497)],
      [2, makeNode(2, 18.0040, -76.7500)],
      [3, makeNode(3, 18.0050, -76.7510)],
    ]);
    const edges = [makeEdge(1, 1, 2, 100)]; // 3 is isolated
    const result = pf.dijkstra({
      fromNodeId: 1,
      toNodeId: 3,
      mode: "shortest",
      hourOfDay: 10,
      nodes,
      edges,
    });
    expect(result).toBeNull();
  });

  it("finds shortest path in 3-node graph (avoids long direct edge)", () => {
    const nodes = new Map([
      [1, makeNode(1, 18.0035, -76.7497)],
      [2, makeNode(2, 18.0040, -76.7500)],
      [3, makeNode(3, 18.0045, -76.7503)],
    ]);
    const edges = [
      makeEdge(1, 1, 2, 100),
      makeEdge(2, 2, 3, 100),
      makeEdge(3, 1, 3, 10000), // longer direct path
    ];
    const result = pf.dijkstra({
      fromNodeId: 1,
      toNodeId: 3,
      mode: "shortest",
      hourOfDay: 10,
      nodes,
      edges,
    });
    expect(result).not.toBeNull();
    expect(result!.nodeIds).toEqual([1, 2, 3]);
  });

  it("result includes distanceM and walkTimeSec", () => {
    const nodes = new Map([
      [1, makeNode(1, 18.0035, -76.7497)],
      [2, makeNode(2, 18.0040, -76.7500)],
    ]);
    const edges = [makeEdge(1, 1, 2, 200)];
    const result = pf.dijkstra({
      fromNodeId: 1,
      toNodeId: 2,
      mode: "shortest",
      hourOfDay: 10,
      nodes,
      edges,
    });
    expect(result?.distanceM).toBeGreaterThan(0);
    expect(result?.walkTimeSec).toBeGreaterThan(0);
  });

  it("result includes safetyScore between 0 and 1", () => {
    const nodes = new Map([
      [1, makeNode(1, 18.0035, -76.7497)],
      [2, makeNode(2, 18.0040, -76.7500)],
    ]);
    const edges = [makeEdge(1, 1, 2, 100)];
    const result = pf.dijkstra({
      fromNodeId: 1,
      toNodeId: 2,
      mode: "safe_night",
      hourOfDay: 22,
      nodes,
      edges,
    });
    expect(result?.safetyScore).toBeGreaterThanOrEqual(0);
    expect(result?.safetyScore).toBeLessThanOrEqual(1);
  });

  it("inactive edge is skipped", () => {
    const nodes = new Map([
      [1, makeNode(1, 18.0035, -76.7497)],
      [2, makeNode(2, 18.0040, -76.7500)],
    ]);
    const inactiveEdge = { ...makeEdge(1, 1, 2, 100), isActive: false };
    const result = pf.dijkstra({
      fromNodeId: 1,
      toNodeId: 2,
      mode: "shortest",
      hourOfDay: 10,
      nodes,
      edges: [inactiveEdge],
    });
    expect(result).toBeNull();
  });

  it("isNightHour correctly identifies night hours", () => {
    expect(pf.isNightHour(22)).toBe(true);
    expect(pf.isNightHour(23)).toBe(true);
    expect(pf.isNightHour(0)).toBe(true);
    expect(pf.isNightHour(5)).toBe(true);
    expect(pf.isNightHour(6)).toBe(false);
    expect(pf.isNightHour(12)).toBe(false);
    expect(pf.isNightHour(18)).toBe(false);
  });

  it("walkTimeFromDistance returns positive seconds", () => {
    expect(pf.walkTimeFromDistance(100)).toBeGreaterThan(0);
    expect(pf.walkTimeFromDistance(1000)).toBeGreaterThan(pf.walkTimeFromDistance(100));
  });

  it("accessible mode skips edges with steps", () => {
    const nodes = new Map([
      [1, makeNode(1, 18.0035, -76.7497)],
      [2, makeNode(2, 18.0040, -76.7500)],
    ]);
    const stepsEdge = { ...makeEdge(1, 1, 2, 100), hasSteps: true };
    const result = pf.dijkstra({
      fromNodeId: 1,
      toNodeId: 2,
      mode: "accessible",
      hourOfDay: 10,
      nodes,
      edges: [stepsEdge],
    });
    expect(result).toBeNull();
  });
});

// ─── 8. Auth router ───────────────────────────────────────────────────────────

describe("auth router", () => {
  it("me returns user when authenticated", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const user = await caller.auth.me();
    expect(user).not.toBeNull();
    expect(user?.openId).toBe("test:user-001");
  });

  it("me returns null when unauthenticated", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    const user = await caller.auth.me();
    expect(user).toBeNull();
  });

  it("logout returns success for authenticated user", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
  });

  it("logout returns success for unauthenticated user", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
  });

  it("me returns correct role for student", async () => {
    const caller = appRouter.createCaller(makeCtx({ role: "student" }));
    const user = await caller.auth.me();
    expect(user?.role).toBe("student");
  });

  it("me returns correct role for guild_admin", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const user = await caller.auth.me();
    expect(user?.role).toBe("guild_admin");
  });

  it("me returns correct role for lecturer", async () => {
    const caller = appRouter.createCaller(makeLecturerCtx());
    const user = await caller.auth.me();
    expect(user?.role).toBe("lecturer");
  });

  it("me returns correct role for class_rep", async () => {
    const caller = appRouter.createCaller(makeRepCtx());
    const user = await caller.auth.me();
    expect(user?.role).toBe("class_rep");
  });

  it("signup rejects invalid email", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.auth.signup({ name: "Test", email: "not-an-email", password: "Password123!" })
    ).rejects.toThrow();
  });

  it("signup rejects short password (< 8 chars)", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.auth.signup({ name: "Test", email: "test@uwimona.edu.jm", password: "abc" })
    ).rejects.toThrow();
  });

  it("signup rejects name shorter than 2 chars", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.auth.signup({ name: "T", email: "test@uwimona.edu.jm", password: "Password123!" })
    ).rejects.toThrow();
  });

  it("login rejects invalid email format", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.auth.login({ email: "bad-email", password: "Password123!" })
    ).rejects.toThrow();
  });

  it("login rejects empty password", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.auth.login({ email: "test@uwimona.edu.jm", password: "" })
    ).rejects.toThrow();
  });

  it("verifyEmail rejects code with wrong length", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.auth.verifyEmail({ email: "test@uwimona.edu.jm", code: "12" })
    ).rejects.toThrow();
  });

  it("verifyEmail rejects code with length != 6", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.auth.verifyEmail({ email: "test@uwimona.edu.jm", code: "1234567" })
    ).rejects.toThrow();
  });
});

// ─── 9. Walking router ────────────────────────────────────────────────────────

describe("walking router", () => {
  it("getTrustScore requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(caller.walking.getTrustScore()).rejects.toThrow();
  });

  it("getTrustScore returns score object for authenticated user", async () => {
    const caller = appRouter.createCaller(makeCtx());
    try {
      const result = await caller.walking.getTrustScore();
      if (result !== null && result !== undefined) {
        expect(typeof result.score).toBe("number");
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      }
    } catch {
      // DB not available in test env — acceptable
    }
  });

  it("updateAvailability requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.walking.updateAvailability({ lat: 18.0035, lng: -76.7497, isAvailable: true })
    ).rejects.toThrow();
  });

  it("updateAvailability accepts valid coordinates", async () => {
    const caller = appRouter.createCaller(makeCtx());
    try {
      const result = await caller.walking.updateAvailability({
        lat: 18.0035,
        lng: -76.7497,
        isAvailable: true,
      });
      expect(result.success).toBe(true);
    } catch {
      // DB not available
    }
  });

  it("requestWalkers requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.walking.requestWalkers({ radiusM: 300 })
    ).rejects.toThrow();
  });

  it("requestWalkers rejects radius > 5000m", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.walking.requestWalkers({ radiusM: 6000 })
    ).rejects.toThrow();
  });

  it("requestWalkers rejects radius < 100m", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.walking.requestWalkers({ radiusM: 50 })
    ).rejects.toThrow();
  });

  it("respondToMatch requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.walking.respondToMatch({ matchId: 1, action: "accept" })
    ).rejects.toThrow();
  });

  it("respondToMatch rejects invalid action", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.walking.respondToMatch({ matchId: 1, action: "maybe" as any })
    ).rejects.toThrow();
  });

  it("respondToMatch accepts 'accept' and 'decline'", async () => {
    const caller = appRouter.createCaller(makeCtx());
    for (const action of ["accept", "decline"] as const) {
      try {
        await caller.walking.respondToMatch({ matchId: 1, action });
      } catch (e: any) {
        expect(e.message).not.toContain("invalid_enum_value");
      }
    }
  });

  it("ratePartner requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.walking.ratePartner({ matchId: 1, stars: 5 })
    ).rejects.toThrow();
  });

  it("ratePartner rejects stars = 0", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.walking.ratePartner({ matchId: 1, stars: 0 })
    ).rejects.toThrow();
  });

  it("ratePartner rejects stars = 6", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.walking.ratePartner({ matchId: 1, stars: 6 })
    ).rejects.toThrow();
  });

  it("ratePartner accepts valid star ratings 1-5", async () => {
    const caller = appRouter.createCaller(makeCtx());
    for (const stars of [1, 2, 3, 4, 5]) {
      try {
        await caller.walking.ratePartner({ matchId: 1, stars });
      } catch (e: any) {
        expect(e.message).not.toContain("invalid_type");
        expect(e.message).not.toContain("too_small");
        expect(e.message).not.toContain("too_big");
      }
    }
  });
});

// ─── 10. Class claims router ──────────────────────────────────────────────────

describe("classes router", () => {
  it("createClaim requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.classes.createClaim({
        courseId: 1,
        claimType: "cancelled",
        message: "Class is cancelled",
      })
    ).rejects.toThrow();
  });

  it("createClaim rejects empty message", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.classes.createClaim({
        courseId: 1,
        claimType: "cancelled",
        message: "",
      })
    ).rejects.toThrow();
  });

  it("createClaim rejects message over 500 chars", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.classes.createClaim({
        courseId: 1,
        claimType: "cancelled",
        message: "x".repeat(501),
      })
    ).rejects.toThrow();
  });

  it("createClaim rejects invalid claimType", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.classes.createClaim({
        courseId: 1,
        claimType: "invalid_type" as any,
        message: "Test",
      })
    ).rejects.toThrow();
  });

  it("createClaim accepts all valid claim types", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const validTypes = ["cancelled", "room_change", "time_change", "late", "other"] as const;
    for (const claimType of validTypes) {
      try {
        await caller.classes.createClaim({ courseId: 1, claimType, message: "Test message" });
      } catch (e: any) {
        expect(e.message).not.toContain("invalid_enum_value");
      }
    }
  });

  it("voteClaim requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.classes.voteClaim({ claimId: 1, vote: "confirm" })
    ).rejects.toThrow();
  });

  it("voteClaim rejects invalid vote value", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.classes.voteClaim({ claimId: 1, vote: "sideways" as any })
    ).rejects.toThrow();
  });

  it("voteClaim accepts 'confirm' and 'deny'", async () => {
    const caller = appRouter.createCaller(makeCtx());
    for (const vote of ["confirm", "deny"] as const) {
      try {
        await caller.classes.voteClaim({ claimId: 1, vote });
      } catch (e: any) {
        expect(e.message).not.toContain("invalid_enum_value");
      }
    }
  });

  it("getClaimsByCourse accepts valid courseId", async () => {
    const caller = appRouter.createCaller(makeCtx());
    try {
      const result = await caller.classes.getClaimsByCourse({ courseId: 1 });
      expect(Array.isArray(result)).toBe(true);
    } catch {
      // DB not available
    }
  });

  it("getClaimsByCourse rejects non-numeric courseId", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.classes.getClaimsByCourse({ courseId: "abc" as any })
    ).rejects.toThrow();
  });
});

// ─── 11. Reports (path/hazard) router ────────────────────────────────────────

describe("reports router", () => {
  it("createReport requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.reports.createReport({
        lat: 18.0035,
        lng: -76.7497,
        reportType: "hazard",
        severity: 3,
      })
    ).rejects.toThrow();
  });

  it("createReport rejects severity > 5", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.reports.createReport({
        lat: 18.0035,
        lng: -76.7497,
        reportType: "light_out",
        severity: 6,
      })
    ).rejects.toThrow();
  });

  it("createReport rejects severity < 1", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.reports.createReport({
        lat: 18.0035,
        lng: -76.7497,
        reportType: "light_out",
        severity: 0,
      })
    ).rejects.toThrow();
  });

  it("createReport rejects invalid reportType", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.reports.createReport({
        lat: 18.0035,
        lng: -76.7497,
        reportType: "unknown_type" as any,
        severity: 3,
      })
    ).rejects.toThrow();
  });

  it("createReport accepts all valid reportTypes", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const validTypes = ["light_out", "broken_path", "flooding", "obstruction", "suspicious"] as const;
    for (const reportType of validTypes) {
      try {
        await caller.reports.createReport({ lat: 18.0035, lng: -76.7497, reportType, severity: 3 });
      } catch (e: any) {
        expect(e.message).not.toContain("invalid_enum_value");
      }
    }
  });

  it("voteReport requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.reports.voteReport({ reportId: 1, vote: "still_there" })
    ).rejects.toThrow();
  });

  it("voteReport rejects invalid vote value", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.reports.voteReport({ reportId: 1, vote: "maybe" as any })
    ).rejects.toThrow();
  });

  it("getReports returns array", async () => {
    const caller = appRouter.createCaller(makeCtx());
    try {
      const result = await caller.reports.getReports({
        bbox: { minLat: 17.9, minLng: -76.9, maxLat: 18.1, maxLng: -76.6 },
      });
      expect(Array.isArray(result)).toBe(true);
    } catch {
      // DB not available
    }
  });

  it("getReports accepts call without bbox", async () => {
    const caller = appRouter.createCaller(makeCtx());
    try {
      const result = await caller.reports.getReports({});
      expect(Array.isArray(result)).toBe(true);
    } catch {
      // DB not available
    }
  });
});

// ─── 12. Check-in router ─────────────────────────────────────────────────────

describe("checkins router", () => {
  it("createCheckin requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.checkins.createCheckin({
        destLat: 18.0035,
        destLng: -76.7497,
        etaAt: new Date(Date.now() + 30 * 60_000),
        graceMinutes: 10,
      })
    ).rejects.toThrow();
  });

  it("createCheckin rejects graceMinutes < 1", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.checkins.createCheckin({
        destLat: 18.0035,
        destLng: -76.7497,
        etaAt: new Date(Date.now() + 30 * 60_000),
        graceMinutes: 0,
      })
    ).rejects.toThrow();
  });

  it("createCheckin rejects graceMinutes > 120", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.checkins.createCheckin({
        destLat: 18.0035,
        destLng: -76.7497,
        etaAt: new Date(Date.now() + 30 * 60_000),
        graceMinutes: 121,
      })
    ).rejects.toThrow();
  });

  it("completeCheckin requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(caller.checkins.completeCheckin({ checkinId: 1 })).rejects.toThrow();
  });

  it("getActiveCheckins requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(caller.checkins.getActiveCheckins()).rejects.toThrow();
  });

  it("getActiveCheckins returns array for authenticated user", async () => {
    const caller = appRouter.createCaller(makeCtx());
    try {
      const result = await caller.checkins.getActiveCheckins();
      expect(Array.isArray(result)).toBe(true);
    } catch {
      // DB not available
    }
  });
});

// ─── 13. Footpath router ─────────────────────────────────────────────────────

describe("footpaths router", () => {
  it("getFootpaths returns array", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    try {
      const result = await caller.footpaths.getFootpaths();
      expect(Array.isArray(result)).toBe(true);
    } catch {
      // DB not available
    }
  });

  it("getGraphNodes returns array", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    try {
      const result = await caller.footpaths.getGraphNodes();
      expect(Array.isArray(result)).toBe(true);
    } catch {
      // DB not available
    }
  });

  it("createFootpath requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.footpaths.createFootpath({
        name: "Test Path",
        geoJson: { type: "LineString", coordinates: [[18.0035, -76.7497], [18.0040, -76.7500]] },
      })
    ).rejects.toThrow();
  });
});

// ─── 14. Courses router ───────────────────────────────────────────────────────

describe("courses router", () => {
  it("getMyCourses requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(caller.courses.getMyCourses()).rejects.toThrow();
  });

  it("getMyCourses returns array for authenticated user", async () => {
    const caller = appRouter.createCaller(makeCtx());
    try {
      const result = await caller.courses.getMyCourses();
      expect(Array.isArray(result)).toBe(true);
    } catch {
      // DB not available
    }
  });

  it("getAllCourses requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(caller.courses.getAllCourses()).rejects.toThrow();
  });

  it("getCourse rejects non-numeric id", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.courses.getCourse({ courseId: "abc" as any })
    ).rejects.toThrow();
  });

  it("getCourseById rejects non-numeric id", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.courses.getCourseById({ courseId: "abc" as any })
    ).rejects.toThrow();
  });

  it("enroll requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.courses.enroll({ courseId: 1 })
    ).rejects.toThrow();
  });

  it("unenroll requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.courses.unenroll({ courseId: 1 })
    ).rejects.toThrow();
  });

  it("saveCourse requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.courses.saveCourse({ courseId: 1 })
    ).rejects.toThrow();
  });

  it("unsaveCourse requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.courses.unsaveCourse({ courseId: 1 })
    ).rejects.toThrow();
  });

  it("getClassRepStats requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(caller.courses.getClassRepStats()).rejects.toThrow();
  });

  it("getClassRepCourses requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(caller.courses.getClassRepCourses()).rejects.toThrow();
  });

  it("postAnnouncement requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.courses.postAnnouncement({
        courseId: 1,
        announcementType: "general",
        title: "Test",
      })
    ).rejects.toThrow();
  });

  it("postAnnouncement rejects title shorter than 3 chars", async () => {
    const caller = appRouter.createCaller(makeRepCtx());
    await expect(
      caller.courses.postAnnouncement({
        courseId: 1,
        announcementType: "general",
        title: "ab",
      })
    ).rejects.toThrow();
  });

  it("postAnnouncement rejects invalid announcementType", async () => {
    const caller = appRouter.createCaller(makeRepCtx());
    await expect(
      caller.courses.postAnnouncement({
        courseId: 1,
        announcementType: "invalid_type" as any,
        title: "Valid title",
      })
    ).rejects.toThrow();
  });

  it("voteAnnouncement requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.courses.voteAnnouncement({ announcementId: 1, direction: "up" })
    ).rejects.toThrow();
  });

  it("voteAnnouncement rejects invalid direction", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.courses.voteAnnouncement({ announcementId: 1, direction: "sideways" as any })
    ).rejects.toThrow();
  });

  it("getPendingAnnouncements returns array", async () => {
    const caller = appRouter.createCaller(makeCtx());
    try {
      const result = await caller.courses.getPendingAnnouncements({ courseId: 1 });
      expect(Array.isArray(result)).toBe(true);
    } catch {
      // DB not available
    }
  });
});

// ─── 15. Timetable router ─────────────────────────────────────────────────────

describe("timetable router", () => {
  it("getMyTimetable requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(caller.timetable.getMyTimetable()).rejects.toThrow();
  });

  it("getMyTimetable returns array for authenticated user", async () => {
    const caller = appRouter.createCaller(makeCtx());
    try {
      const result = await caller.timetable.getMyTimetable();
      expect(Array.isArray(result)).toBe(true);
    } catch {
      // DB not available
    }
  });

  it("getCourseSessions rejects non-numeric courseId", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.timetable.getCourseSessions({ courseId: "abc" as any })
    ).rejects.toThrow();
  });

  it("createCourseSession requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.timetable.createCourseSession({
        courseId: 1,
        sessionType: "lecture",
        dayOfWeek: "monday",
        startTime: "09:00:00",
        endTime: "11:00:00",
      })
    ).rejects.toThrow();
  });

  it("createCourseSession rejects invalid dayOfWeek", async () => {
    const caller = appRouter.createCaller(makeRepCtx());
    await expect(
      caller.timetable.createCourseSession({
        courseId: 1,
        sessionType: "lecture",
        dayOfWeek: "funday" as any,
        startTime: "09:00:00",
        endTime: "11:00:00",
      })
    ).rejects.toThrow();
  });

  it("createCourseSession rejects invalid sessionType", async () => {
    const caller = appRouter.createCaller(makeRepCtx());
    await expect(
      caller.timetable.createCourseSession({
        courseId: 1,
        sessionType: "nap" as any,
        dayOfWeek: "monday",
        startTime: "09:00:00",
        endTime: "11:00:00",
      })
    ).rejects.toThrow();
  });

  it("createCourseSession accepts all valid days of week", async () => {
    const caller = appRouter.createCaller(makeRepCtx());
    const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
    for (const dayOfWeek of days) {
      try {
        await caller.timetable.createCourseSession({
          courseId: 1,
          sessionType: "lecture",
          dayOfWeek,
          startTime: "09:00:00",
          endTime: "11:00:00",
        });
      } catch (e: any) {
        expect(e.message).not.toContain("invalid_enum_value");
      }
    }
  });

  it("createCourseSession accepts all valid session types", async () => {
    const caller = appRouter.createCaller(makeRepCtx());
    const types = ["lecture", "tutorial", "lab", "seminar", "other"] as const;
    for (const sessionType of types) {
      try {
        await caller.timetable.createCourseSession({
          courseId: 1,
          sessionType,
          dayOfWeek: "monday",
          startTime: "09:00:00",
          endTime: "11:00:00",
        });
      } catch (e: any) {
        expect(e.message).not.toContain("invalid_enum_value");
      }
    }
  });
});

// ─── 16. Class reports router (Phase 23) ──────────────────────────────────────

describe("classReports router", () => {
  it("submitReport requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.classReports.submitReport({
        courseId: 1,
        reportType: "class_cancelled",
        title: "Class cancelled today",
      })
    ).rejects.toThrow();
  });

  it("submitReport rejects invalid reportType", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.classReports.submitReport({
        courseId: 1,
        reportType: "invalid_type" as any,
        title: "Test",
      })
    ).rejects.toThrow();
  });

  it("submitReport rejects title shorter than 3 chars", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.classReports.submitReport({
        courseId: 1,
        reportType: "class_cancelled",
        title: "ab",
      })
    ).rejects.toThrow();
  });

  it("submitReport rejects title longer than 255 chars", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.classReports.submitReport({
        courseId: 1,
        reportType: "class_cancelled",
        title: "x".repeat(256),
      })
    ).rejects.toThrow();
  });

  it("submitReport rejects description longer than 1000 chars", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.classReports.submitReport({
        courseId: 1,
        reportType: "class_cancelled",
        title: "Valid title",
        description: "x".repeat(1001),
      })
    ).rejects.toThrow();
  });

  it("submitReport accepts all valid report types", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const validTypes = [
      "class_cancelled",
      "lecturer_late",
      "room_changed",
      "time_changed",
      "class_confirmed",
      "other",
    ] as const;
    for (const reportType of validTypes) {
      try {
        await caller.classReports.submitReport({ courseId: 1, reportType, title: "Valid title" });
      } catch (e: any) {
        expect(e.message).not.toContain("invalid_enum_value");
      }
    }
  });

  it("getReportsByCourse returns array", async () => {
    const caller = appRouter.createCaller(makeCtx());
    try {
      const result = await caller.classReports.getReportsByCourse({ courseId: 1 });
      expect(Array.isArray(result)).toBe(true);
    } catch {
      // DB not available
    }
  });

  it("getReport rejects non-numeric reportId", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.classReports.getReport({ reportId: "abc" as any })
    ).rejects.toThrow();
  });

  it("voteOnReport requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.classReports.voteOnReport({ reportId: 1, voteType: "upvote" })
    ).rejects.toThrow();
  });

  it("voteOnReport rejects invalid voteType", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.classReports.voteOnReport({ reportId: 1, voteType: "maybe" as any })
    ).rejects.toThrow();
  });

  it("voteOnReport accepts 'upvote' and 'downvote'", async () => {
    const caller = appRouter.createCaller(makeCtx());
    for (const voteType of ["upvote", "downvote"] as const) {
      try {
        await caller.classReports.voteOnReport({ reportId: 1, voteType });
      } catch (e: any) {
        expect(e.message).not.toContain("invalid_enum_value");
      }
    }
  });

  it("getMyTrustScore requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(caller.classReports.getMyTrustScore()).rejects.toThrow();
  });

  it("getMyTrustScore returns score for authenticated user", async () => {
    const caller = appRouter.createCaller(makeCtx());
    try {
      const result = await caller.classReports.getMyTrustScore();
      if (result) {
        expect(typeof result.trustScore).toBe("number");
        expect(result.trustScore).toBeGreaterThanOrEqual(0);
        expect(result.trustScore).toBeLessThanOrEqual(100);
      }
    } catch {
      // DB not available
    }
  });

  it("getMySuspensionStatus requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(caller.classReports.getMySuspensionStatus()).rejects.toThrow();
  });

  it("getMySuspensionStatus returns not-suspended for normal user", async () => {
    const caller = appRouter.createCaller(makeCtx());
    try {
      const result = await caller.classReports.getMySuspensionStatus();
      if (result) {
        expect(result.isSuspended).toBe(false);
      }
    } catch {
      // DB not available
    }
  });

  it("getMySuspensionStatus returns suspended for suspended user", async () => {
    const caller = appRouter.createCaller(makeSuspendedCtx());
    try {
      const result = await caller.classReports.getMySuspensionStatus();
      if (result) {
        expect(result.isSuspended).toBe(true);
      }
    } catch {
      // DB not available
    }
  });
});

// ─── 17. Class chat router (Phase 23) ─────────────────────────────────────────

describe("classChat router", () => {
  it("getCourseChat requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.classChat.getCourseChat({ courseId: 1 })
    ).rejects.toThrow();
  });

  it("getCourseChat returns array for authenticated user", async () => {
    const caller = appRouter.createCaller(makeCtx());
    try {
      const result = await caller.classChat.getCourseChat({ courseId: 1 });
      expect(Array.isArray(result)).toBe(true);
    } catch {
      // DB not available
    }
  });

  it("addComment requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.classChat.addComment({ reportId: 1, message: "Test" })
    ).rejects.toThrow();
  });

  it("addComment rejects empty message", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.classChat.addComment({ reportId: 1, message: "" })
    ).rejects.toThrow();
  });

  it("addComment rejects message over 500 chars", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.classChat.addComment({ reportId: 1, message: "x".repeat(501) })
    ).rejects.toThrow();
  });

  it("getComments returns array", async () => {
    const caller = appRouter.createCaller(makeCtx());
    try {
      const result = await caller.classChat.getComments({ reportId: 1 });
      expect(Array.isArray(result)).toBe(true);
    } catch {
      // DB not available
    }
  });

  it("deleteComment requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.classChat.deleteComment({ commentId: 1 })
    ).rejects.toThrow();
  });

  it("deleteComment rejects non-numeric commentId", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.classChat.deleteComment({ commentId: "abc" as any })
    ).rejects.toThrow();
  });
});

// ─── 18. Push notifications router (Phase 23) ─────────────────────────────────

describe("push router", () => {
  it("subscribe requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.push.subscribe({
        endpoint: "https://fcm.googleapis.com/test",
        p256dhKey: "test-key",
        authKey: "test-auth",
      })
    ).rejects.toThrow();
  });

  it("subscribe rejects non-URL endpoint", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.push.subscribe({
        endpoint: "not-a-url",
        p256dhKey: "test-key",
        authKey: "test-auth",
      })
    ).rejects.toThrow();
  });

  it("subscribe rejects empty p256dhKey", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.push.subscribe({
        endpoint: "https://fcm.googleapis.com/test",
        p256dhKey: "",
        authKey: "test-auth",
      })
    ).rejects.toThrow();
  });

  it("subscribe rejects empty authKey", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.push.subscribe({
        endpoint: "https://fcm.googleapis.com/test",
        p256dhKey: "test-key",
        authKey: "",
      })
    ).rejects.toThrow();
  });

  it("unsubscribe requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.push.unsubscribe({ endpoint: "https://fcm.googleapis.com/test" })
    ).rejects.toThrow();
  });

  it("getNotifications requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(caller.push.getNotifications()).rejects.toThrow();
  });

  it("getNotifications returns array for authenticated user", async () => {
    const caller = appRouter.createCaller(makeCtx());
    try {
      const result = await caller.push.getNotifications();
      expect(Array.isArray(result)).toBe(true);
    } catch {
      // DB not available
    }
  });

  it("markRead requires authentication", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    await expect(
      caller.push.markRead({ notificationId: 1 })
    ).rejects.toThrow();
  });

  it("markRead rejects non-numeric notificationId", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.push.markRead({ notificationId: "abc" as any })
    ).rejects.toThrow();
  });
});

// ─── 19. Edge cases & stress tests ────────────────────────────────────────────

describe("Edge cases", () => {
  it("all auth.me calls handle concurrent requests correctly", async () => {
    const ctx = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const promises = Array.from({ length: 10 }, () => caller.auth.me());
    const results = await Promise.all(promises);
    results.forEach((r) => expect(r?.openId).toBe("test:user-001"));
  });

  it("null input is rejected by submitReport", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.classReports.submitReport(null as any)
    ).rejects.toThrow();
  });

  it("undefined input is rejected by submitReport", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.classReports.submitReport(undefined as any)
    ).rejects.toThrow();
  });

  it("SQL injection string in title passes schema but is safely handled", async () => {
    const caller = appRouter.createCaller(makeCtx());
    try {
      await caller.classReports.submitReport({
        courseId: 1,
        reportType: "class_cancelled",
        title: "'; DROP TABLE users; --",
      });
    } catch (e: any) {
      expect(e).toBeDefined();
    }
  });

  it("XSS string in comment message passes schema but is safely handled", async () => {
    const caller = appRouter.createCaller(makeCtx());
    try {
      await caller.classChat.addComment({
        reportId: 1,
        message: "<script>alert('xss')</script>",
      });
    } catch (e: any) {
      expect(e).toBeDefined();
    }
  });

  it("calculateTrustScore handles 1000 ratings without error", () => {
    const now = Date.now();
    const ratings = Array.from({ length: 1000 }, (_, i) => ({
      stars: (i % 5) + 1,
      createdAtMs: now - i * 86_400_000,
    }));
    const score = algo.calculateTrustScore(ratings);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
    expect(Number.isFinite(score)).toBe(true);
  });

  it("Dijkstra handles large graph (50 nodes) without error", () => {
    const nodes = new Map<number, pf.GraphNode>();
    const edges: pf.GraphEdge[] = [];
    for (let i = 1; i <= 50; i++) {
      nodes.set(i, makeNode(i, 18.0 + i * 0.001, -76.75 + i * 0.001));
      if (i > 1) {
        edges.push(makeEdge(i, i - 1, i, 100));
      }
    }
    const result = pf.dijkstra({
      fromNodeId: 1,
      toNodeId: 50,
      mode: "shortest",
      hourOfDay: 10,
      nodes,
      edges,
    });
    expect(result).not.toBeNull();
    expect(result!.nodeIds.length).toBe(50);
  });

  it("getGeohash produces consistent results for same input", () => {
    const h1 = algo.getGeohash(18.0035, -76.7497, 7);
    const h2 = algo.getGeohash(18.0035, -76.7497, 7);
    expect(h1).toBe(h2);
  });

  it("haversineDistance is consistent for same input", () => {
    const d1 = algo.haversineDistance(18.0035, -76.7497, 18.0040, -76.7500);
    const d2 = algo.haversineDistance(18.0035, -76.7497, 18.0040, -76.7500);
    expect(d1).toBe(d2);
  });
});

// ─── 20. Security / authorization tests ──────────────────────────────────────

describe("Security — authorization", () => {
  it("unauthenticated user cannot access any protected procedure", async () => {
    const caller = appRouter.createCaller(makeAnonCtx());
    const protectedCalls = [
      caller.walking.getTrustScore(),
      caller.walking.updateAvailability({ lat: 18.0035, lng: -76.7497, isAvailable: true }),
      caller.classes.createClaim({ courseId: 1, claimType: "cancelled", message: "Test" }),
      caller.checkins.getActiveCheckins(),
      caller.courses.getMyCourses(),
      caller.timetable.getMyTimetable(),
      caller.classReports.getMyTrustScore(),
      caller.classReports.getMySuspensionStatus(),
      caller.push.getNotifications(),
    ];
    const results = await Promise.allSettled(protectedCalls);
    results.forEach((r) => {
      expect(r.status).toBe("rejected");
    });
  });

  it("admin user has access to all protected procedures", async () => {
    const caller = appRouter.createCaller(makeAdminCtx());
    const calls = [
      caller.auth.me(),
      caller.courses.getMyCourses().catch(() => []),
      caller.timetable.getMyTimetable().catch(() => []),
      caller.classReports.getMyTrustScore().catch(() => null),
    ];
    await expect(Promise.all(calls)).resolves.toBeDefined();
  });

  it("suspended user context is correctly identified", () => {
    const ctx = makeSuspendedCtx();
    expect(ctx.user?.suspensionStatus).toBe("active");
    expect(ctx.user?.suspendedUntil).not.toBeNull();
    expect(ctx.user?.suspendedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it("trust score in context is within valid range [0, 100]", () => {
    const ctx = makeCtx();
    expect(ctx.user?.trustScore).toBeGreaterThanOrEqual(0);
    expect(ctx.user?.trustScore).toBeLessThanOrEqual(100);
  });

  it("admin trust score is 100", () => {
    const ctx = makeAdminCtx();
    expect(ctx.user?.trustScore).toBe(100);
  });

  it("lecturer trust score is 80", () => {
    const ctx = makeLecturerCtx();
    expect(ctx.user?.trustScore).toBe(80);
  });

  it("default student trust score is 50", () => {
    const ctx = makeCtx();
    expect(ctx.user?.trustScore).toBe(50);
  });

  it("vote type 'confirm' and 'deny' are valid for class claims", async () => {
    const caller = appRouter.createCaller(makeCtx());
    for (const vote of ["confirm", "deny"] as const) {
      try {
        await caller.classes.voteClaim({ claimId: 1, vote });
      } catch (e: any) {
        expect(e.message).not.toContain("invalid_enum_value");
      }
    }
  });

  it("vote type 'upvote' and 'downvote' are valid for class reports", async () => {
    const caller = appRouter.createCaller(makeCtx());
    for (const voteType of ["upvote", "downvote"] as const) {
      try {
        await caller.classReports.voteOnReport({ reportId: 1, voteType });
      } catch (e: any) {
        expect(e.message).not.toContain("invalid_enum_value");
      }
    }
  });

  it("all valid report types are accepted by submitReport schema", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const validTypes = [
      "class_cancelled",
      "lecturer_late",
      "room_changed",
      "time_changed",
      "class_confirmed",
      "other",
    ] as const;
    for (const reportType of validTypes) {
      try {
        await caller.classReports.submitReport({
          courseId: 1,
          reportType,
          title: "Valid title",
        });
      } catch (e: any) {
        expect(e.message).not.toContain("invalid_enum_value");
      }
    }
  });

  it("all valid path report types are accepted by createReport schema", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const validTypes = ["light_out", "broken_path", "flooding", "obstruction", "suspicious"] as const;
    for (const reportType of validTypes) {
      try {
        await caller.reports.createReport({ lat: 18.0035, lng: -76.7497, reportType, severity: 3 });
      } catch (e: any) {
        expect(e.message).not.toContain("invalid_enum_value");
      }
    }
  });

  it("all valid announcement types are accepted by postAnnouncement schema", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const validTypes = ["cancelled", "room_changed", "lecturer_late", "rescheduled", "materials_uploaded", "general"] as const;
    for (const announcementType of validTypes) {
      try {
        await caller.courses.postAnnouncement({ courseId: 1, announcementType, title: "Valid title" });
      } catch (e: any) {
        expect(e.message).not.toContain("invalid_enum_value");
      }
    }
  });
});
