import { describe, it, expect } from "vitest";
import * as algo from "./algorithms";

describe("CACTUS Algorithms (Hardened per Spec)", () => {

  // ============================================================================
  // 1. GEOHASH UTILITIES
  // ============================================================================
  describe("Geohash utilities", () => {
    it("encodes UWI Mona to a 7-char geohash", () => {
      const hash = algo.getGeohash(18.0035, -76.7497, 7);
      expect(hash).toHaveLength(7);
    });

    it("getGeohashPrefix returns correct prefix length", () => {
      expect(algo.getGeohashPrefix(18.0035, -76.7497, 5)).toHaveLength(5);
    });

    it("haversineDistance returns ~0 for identical coords", () => {
      expect(algo.haversineDistance(18.0035, -76.7497, 18.0035, -76.7497)).toBeCloseTo(0, 1);
    });

    it("haversineDistance returns ~1110m for 0.01° lat shift", () => {
      const dist = algo.haversineDistance(18.0235, -76.8099, 18.0335, -76.8099);
      expect(dist).toBeGreaterThan(900);
      expect(dist).toBeLessThan(1200);
    });

    it("buildGeohashRing returns center + ring1 + ring2", () => {
      const ring = algo.buildGeohashRing(18.0035, -76.7497, 6);
      expect(ring.center).toHaveLength(6);
      expect(ring.ring1.length).toBeGreaterThanOrEqual(8);
      expect(ring.ring2.length).toBeGreaterThan(0);
    });

    it("getRing5Prefixes returns unique 5-char prefixes", () => {
      const prefixes = algo.getRing5Prefixes(18.0035, -76.7497);
      expect(prefixes.length).toBeGreaterThan(0);
      prefixes.forEach((p) => expect(p).toHaveLength(5));
      expect(new Set(prefixes).size).toBe(prefixes.length);
    });
  });

  // ============================================================================
  // 2. WALKING BODY — TRUST SCORE
  // ============================================================================
  describe("calculateTrustScore (time-decay Bayesian)", () => {
    it("returns prior mean 0.7 with no ratings", () => {
      // (5 * 0.7 + 0) / (5 + 0) = 0.7
      expect(algo.calculateTrustScore([])).toBeCloseTo(0.7, 3);
    });

    it("approaches 1.0 with many recent 5-star ratings", () => {
      const now = Date.now();
      const ratings = Array.from({ length: 50 }, () => ({ stars: 5, createdAtMs: now }));
      expect(algo.calculateTrustScore(ratings)).toBeGreaterThan(0.95);
    });

    it("drops with many 1-star ratings and flags", () => {
      const now = Date.now();
      const ratings = Array.from({ length: 50 }, () => ({ stars: 1, createdAtMs: now }));
      expect(algo.calculateTrustScore(ratings, 5)).toBeLessThan(0.3);
    });

    it("decays older ratings more than recent ones", () => {
      const now = Date.now();
      const oldMs = now - 60 * 24 * 60 * 60 * 1000;
      const recent = algo.calculateTrustScore([{ stars: 5, createdAtMs: now }]);
      const old = algo.calculateTrustScore([{ stars: 5, createdAtMs: oldMs }]);
      expect(recent).toBeGreaterThan(old);
    });

    it("applies 15% safety penalty per flag", () => {
      const now = Date.now();
      const ratings = [{ stars: 5, createdAtMs: now }];
      const noFlags = algo.calculateTrustScore(ratings, 0);
      const twoFlags = algo.calculateTrustScore(ratings, 2);
      expect(twoFlags).toBeCloseTo(noFlags * 0.7, 2);
    });
  });

  describe("calculateTrustScoreSimple", () => {
    it("returns 0.7 with 0 ratings", () => {
      expect(algo.calculateTrustScoreSimple(0, 0)).toBeCloseTo(0.7, 3);
    });

    it("returns high score for 5-star average with many ratings", () => {
      expect(algo.calculateTrustScoreSimple(5, 100)).toBeGreaterThan(0.95);
    });

    it("returns low score for 1-star average", () => {
      expect(algo.calculateTrustScoreSimple(1, 10)).toBeLessThan(0.4);
    });

    it("clamps to [0, 1]", () => {
      const s = algo.calculateTrustScoreSimple(5, 1000, 100);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    });
  });

  // ============================================================================
  // 3. CLASS CLAIMS — THRESHOLD & VALIDATION
  // ============================================================================
  describe("getRequiredConfirmations", () => {
    it("requires fewer confirmations for rep claims", () => {
      expect(algo.getRequiredConfirmations(40, true, 0.5)).toBeLessThan(
        algo.getRequiredConfirmations(40, false, 0.5)
      );
    });

    it("requires fewer confirmations for high-trust submitters", () => {
      expect(algo.getRequiredConfirmations(40, false, 0.9)).toBeLessThan(
        algo.getRequiredConfirmations(40, false, 0.1)
      );
    });

    it("always requires at least 1 confirmation", () => {
      expect(algo.getRequiredConfirmations(1, true, 1.0)).toBeGreaterThanOrEqual(1);
    });
  });

  describe("getRejectThreshold", () => {
    it("returns at least 2", () => {
      expect(algo.getRejectThreshold(5)).toBeGreaterThanOrEqual(2);
    });

    it("scales with class size", () => {
      expect(algo.getRejectThreshold(100)).toBeGreaterThan(algo.getRejectThreshold(20));
    });

    it("returns 25 for class size 100", () => {
      expect(algo.getRejectThreshold(100)).toBe(25);
    });
  });

  describe("updateClaimTrust", () => {
    it("returns 0 with no confirmed votes", () => {
      expect(algo.updateClaimTrust(0, 0)).toBeCloseTo(0, 3);
    });

    it("increases with more confirmed votes", () => {
      expect(algo.updateClaimTrust(10, 2)).toBeGreaterThan(algo.updateClaimTrust(2, 5));
    });

    it("clamps to [0, 1]", () => {
      expect(algo.updateClaimTrust(1000, 0)).toBeLessThanOrEqual(1);
    });
  });

  describe("determineClaimStatus", () => {
    it("returns verified when confirmations meet threshold", () => {
      expect(algo.determineClaimStatus(10, 2, 8, 5)).toBe("verified");
    });

    it("returns rejected when denials meet threshold", () => {
      expect(algo.determineClaimStatus(2, 8, 10, 6)).toBe("rejected");
    });

    it("returns pending when neither threshold is met", () => {
      expect(algo.determineClaimStatus(3, 2, 10, 8)).toBe("pending");
    });
  });

  // ============================================================================
  // 4. STRIKE SYSTEM
  // ============================================================================
  describe("getStrikePenalty", () => {
    it("issues warning for strike 1 with 0 suspend days", () => {
      const p = algo.getStrikePenalty(1);
      expect(p.action).toBe("warning");
      expect(p.suspendDays).toBe(0);
    });

    it("suspends bypass 7 days for strike 2", () => {
      const p = algo.getStrikePenalty(2);
      expect(p.action).toBe("bypass_suspended");
      expect(p.suspendDays).toBe(7);
    });

    it("extends suspension 14 days for strike 3", () => {
      const p = algo.getStrikePenalty(3);
      expect(p.action).toBe("extended_suspend");
      expect(p.suspendDays).toBe(14);
    });

    it("issues semester ban for strike 4+", () => {
      expect(algo.getStrikePenalty(4).action).toBe("semester_ban");
      expect(algo.getStrikePenalty(10).action).toBe("semester_ban");
    });
  });

  describe("applyStrikeForgiveness", () => {
    it("decays one strike after 30-day clean streak", () => {
      const oldMs = Date.now() - 31 * 24 * 60 * 60 * 1000;
      expect(algo.applyStrikeForgiveness(2, oldMs)).toBe(1);
    });

    it("does not decay within the window", () => {
      const recentMs = Date.now() - 5 * 24 * 60 * 60 * 1000;
      expect(algo.applyStrikeForgiveness(2, recentMs)).toBe(2);
    });

    it("never goes below 0", () => {
      const oldMs = Date.now() - 60 * 24 * 60 * 60 * 1000;
      expect(algo.applyStrikeForgiveness(0, oldMs)).toBe(0);
    });
  });

  describe("getBypassDisabledDuration", () => {
    it("returns 0 for strike 1 (warning only)", () => {
      expect(algo.getBypassDisabledDuration(1)).toBe(0);
    });

    it("returns 7 for strike 2", () => {
      expect(algo.getBypassDisabledDuration(2)).toBe(7);
    });

    it("returns 14 for strike 3", () => {
      expect(algo.getBypassDisabledDuration(3)).toBe(14);
    });

    it("returns 365 for strike 4+ (semester ban)", () => {
      expect(algo.getBypassDisabledDuration(4)).toBe(365);
    });
  });

  describe("canRepBypass", () => {
    it("allows bypass with 0 strikes and no suspension", () => {
      expect(algo.canRepBypass(0, null, false)).toBe(true);
    });

    it("blocks when revoked", () => {
      expect(algo.canRepBypass(0, null, true)).toBe(false);
    });

    it("blocks when 4+ strikes", () => {
      expect(algo.canRepBypass(4, null, false)).toBe(false);
    });

    it("blocks when suspension is active", () => {
      const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      expect(algo.canRepBypass(2, future, false)).toBe(false);
    });

    it("allows when suspension has expired", () => {
      const past = new Date(Date.now() - 1000);
      expect(algo.canRepBypass(2, past, false)).toBe(true);
    });
  });

  // ============================================================================
  // 5. CAUTION REPORTS — TTL & RELIABILITY
  // ============================================================================
  describe("getInitialTTL", () => {
    it("returns 20 for severity 1-2", () => {
      expect(algo.getInitialTTL(1)).toBe(20);
      expect(algo.getInitialTTL(2)).toBe(20);
    });
    it("returns 40 for severity 3", () => {
      expect(algo.getInitialTTL(3)).toBe(40);
    });
    it("returns 60 for severity 4", () => {
      expect(algo.getInitialTTL(4)).toBe(60);
    });
    it("returns 120 for severity 5", () => {
      expect(algo.getInitialTTL(5)).toBe(120);
    });
  });

  describe("getTTLAdjustment", () => {
    it("increases TTL for still_there vote (default reliability)", () => {
      expect(algo.getTTLAdjustment(3, 1, 1.0)).toBeGreaterThan(0);
    });

    it("decreases TTL for not_there vote", () => {
      expect(algo.getTTLAdjustment(3, -1, 1.0)).toBeLessThan(0);
    });

    it("adjusts more for high-severity reports", () => {
      expect(Math.abs(algo.getTTLAdjustment(5, 1, 1.0))).toBeGreaterThan(
        Math.abs(algo.getTTLAdjustment(2, 1, 1.0))
      );
    });

    it("scales with voter reliability", () => {
      expect(Math.abs(algo.getTTLAdjustment(3, 1, 1.0))).toBeGreaterThan(
        Math.abs(algo.getTTLAdjustment(3, 1, 0.3))
      );
    });
  });

  describe("getWeightedConfirmationScore", () => {
    it("sums reliability for still_there votes only", () => {
      const votes = [
        { direction: 1 as const, voterReliability: 0.8 },
        { direction: 1 as const, voterReliability: 0.6 },
        { direction: -1 as const, voterReliability: 0.9 },
      ];
      expect(algo.getWeightedConfirmationScore(votes)).toBeCloseTo(1.4, 3);
    });

    it("returns 0 with no still_there votes", () => {
      expect(algo.getWeightedConfirmationScore([{ direction: -1 as const, voterReliability: 0.9 }])).toBe(0);
    });
  });

  describe("calculateReliability", () => {
    it("returns 0.7 prior with no votes", () => {
      expect(algo.calculateReliability(0, 0)).toBeCloseTo(0.7, 3);
    });

    it("increases with more true votes", () => {
      expect(algo.calculateReliability(20, 0)).toBeGreaterThan(algo.calculateReliability(2, 0));
    });

    it("decreases with more false votes", () => {
      expect(algo.calculateReliability(5, 0)).toBeGreaterThan(algo.calculateReliability(5, 10));
    });
  });

  describe("needsRevalidation", () => {
    it("returns true when never voted on and TTL > 0", () => {
      expect(algo.needsRevalidation(null, 30)).toBe(true);
    });

    it("returns false when TTL is 0", () => {
      expect(algo.needsRevalidation(null, 0)).toBe(false);
    });

    it("returns true when last vote was more than threshold ago", () => {
      const old = Date.now() - 35 * 60 * 1000;
      expect(algo.needsRevalidation(old, 20, 30)).toBe(true);
    });

    it("returns false when last vote was recent", () => {
      const recent = Date.now() - 5 * 60 * 1000;
      expect(algo.needsRevalidation(recent, 20, 30)).toBe(false);
    });
  });

  // ============================================================================
  // 6. CHECK-IN
  // ============================================================================
  describe("hasCheckinFailed", () => {
    it("returns true when ETA + grace has passed", () => {
      const past = new Date(Date.now() - 10 * 60 * 1000);
      expect(algo.hasCheckinFailed(past, 5)).toBe(true);
    });

    it("returns false when within grace period", () => {
      const future = new Date(Date.now() + 10 * 60 * 1000);
      expect(algo.hasCheckinFailed(future, 5)).toBe(false);
    });

    it("respects grace period (3 min elapsed, 5 min grace)", () => {
      const eta = new Date(Date.now() - 3 * 60 * 1000);
      expect(algo.hasCheckinFailed(eta, 5)).toBe(false);
    });
  });

  describe("isStationary", () => {
    it("returns false when window has not elapsed", () => {
      const recentMs = Date.now() - 2 * 60 * 1000;
      expect(algo.isStationary(18.0035, -76.7497, 18.0035, -76.7497, recentMs, 5, 20)).toBe(false);
    });

    it("returns true when window elapsed and no movement", () => {
      const oldMs = Date.now() - 10 * 60 * 1000;
      expect(algo.isStationary(18.0035, -76.7497, 18.0035, -76.7497, oldMs, 5, 20)).toBe(true);
    });

    it("returns false when user has moved significantly", () => {
      const oldMs = Date.now() - 10 * 60 * 1000;
      expect(algo.isStationary(18.0035, -76.7497, 18.0055, -76.7497, oldMs, 5, 20)).toBe(false);
    });
  });

  // ============================================================================
  // 7. TIMESTAMP HELPERS
  // ============================================================================
  describe("Timestamp helpers", () => {
    it("getClaimExpirationTime returns ~24h from now", () => {
      const diff = algo.getClaimExpirationTime().getTime() - Date.now();
      expect(diff).toBeGreaterThan(23.9 * 60 * 60 * 1000);
      expect(diff).toBeLessThan(24.1 * 60 * 60 * 1000);
    });

    it("getWalkingRequestExpirationTime returns ~5min from now", () => {
      const diff = algo.getWalkingRequestExpirationTime().getTime() - Date.now();
      expect(diff).toBeGreaterThan(4.9 * 60 * 1000);
      expect(diff).toBeLessThan(5.1 * 60 * 1000);
    });

    it("getBypassSuspendedUntil returns correct future date", () => {
      const diff = algo.getBypassSuspendedUntil(7).getTime() - Date.now();
      expect(diff).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);
      expect(diff).toBeLessThan(7.1 * 24 * 60 * 60 * 1000);
    });
  });
});
