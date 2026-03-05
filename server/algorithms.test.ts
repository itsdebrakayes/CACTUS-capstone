import { describe, it, expect } from "vitest";
import * as algo from "./algorithms";

describe("Algorithms", () => {
  // ============================================================================
  // GEOHASHING TESTS
  // ============================================================================

  describe("Geohashing", () => {
    it("should encode coordinates to geohash", () => {
      const hash = algo.getGeohash(18.0235, -76.8099, 7);
      expect(hash).toBeDefined();
      expect(hash.length).toBe(7);
    });

    it("should get geohash prefix", () => {
      const prefix = algo.getGeohashPrefix(18.0235, -76.8099, 5);
      expect(prefix).toBeDefined();
      expect(prefix.length).toBe(5);
    });

    it("should calculate Haversine distance correctly", () => {
      // UWI Mona coordinates
      const lat1 = 18.0235;
      const lng1 = -76.8099;

      // Nearby point (approximately 1km away)
      const lat2 = 18.0335;
      const lng2 = -76.8099;

      const distance = algo.haversineDistance(lat1, lng1, lat2, lng2);

      // Should be approximately 1000-1200 meters
      expect(distance).toBeGreaterThan(900);
      expect(distance).toBeLessThan(1200);
    });

    it("should build geohash ring expansion", () => {
      const ring = algo.buildGeohashRing(18.0235, -76.8099, 6);

      expect(ring.center).toBeDefined();
      expect(ring.ring1).toBeDefined();
      expect(ring.ring2).toBeDefined();
      expect(ring.ring1.length).toBeGreaterThan(0);
      expect(ring.ring2.length).toBeGreaterThan(0);
    });

    it("should get ring5 prefixes", () => {
      const prefixes = algo.getRing5Prefixes(18.0235, -76.8099);

      expect(prefixes).toBeDefined();
      expect(prefixes.length).toBeGreaterThan(0);
      expect(prefixes.every((p) => p.length === 5)).toBe(true);
    });
  });

  // ============================================================================
  // TRUST SCORE TESTS
  // ============================================================================

  describe("Trust Score Calculation", () => {
    it("should calculate trust score with no ratings", () => {
      const score = algo.calculateTrustScore(0, 0);
      expect(score).toBe(0.7); // Confidence constant default is 5, so (5*0.7 + 0) / (5 + 0) = 0.7
    });

    it("should calculate trust score with perfect ratings", () => {
      const score = algo.calculateTrustScore(5, 10); // 10 ratings of 5 stars
      // (5*0.7 + 10*1) / (5 + 10) = 15 / 15 = 1.0, but clamped
      expect(score).toBeGreaterThanOrEqual(0.9);
      expect(score).toBeLessThanOrEqual(1);
    });

    it("should calculate trust score with poor ratings", () => {
      const score = algo.calculateTrustScore(1, 10); // 10 ratings of 1 star
      // (5*0.7 + 10*0.2) / (5 + 10) = 5.5 / 15 ≈ 0.367
      expect(score).toBeLessThan(0.4);
      expect(score).toBeGreaterThan(0.3);
    });

    it("should clamp trust score to [0, 1]", () => {
      const score1 = algo.calculateTrustScore(10, 100); // Very high
      const score2 = algo.calculateTrustScore(-5, 100); // Negative (shouldn't happen)

      expect(score1).toBeLessThanOrEqual(1);
      expect(score2).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // CLASS CLAIM VALIDATION TESTS
  // ============================================================================

  describe("Class Claim Validation", () => {
    it("should calculate required confirmations for students", () => {
      const required = algo.getRequiredConfirmations(100, false);
      expect(required).toBe(Math.max(2, Math.ceil(0.3 * 100))); // 30
    });

    it("should calculate required confirmations for class reps", () => {
      const required = algo.getRequiredConfirmations(100, true);
      expect(required).toBe(Math.max(1, Math.ceil(0.1 * 100))); // 10
    });

    it("should enforce minimum confirmations", () => {
      const required1 = algo.getRequiredConfirmations(5, false);
      expect(required1).toBe(2); // Minimum for students

      const required2 = algo.getRequiredConfirmations(5, true);
      expect(required2).toBe(1); // Minimum for reps
    });

    it("should calculate rejection threshold", () => {
      const threshold = algo.getRejectThreshold(100);
      expect(threshold).toBe(Math.max(2, Math.ceil(0.25 * 100))); // 25
    });

    it("should determine claim status: verified", () => {
      const status = algo.determineClaimStatus(30, 10, 30, 25);
      expect(status).toBe("verified");
    });

    it("should determine claim status: rejected", () => {
      const status = algo.determineClaimStatus(10, 30, 30, 25);
      expect(status).toBe("rejected");
    });

    it("should determine claim status: pending", () => {
      const status = algo.determineClaimStatus(15, 15, 30, 25);
      expect(status).toBe("pending");
    });

    it("should calculate bypass disabled duration", () => {
      expect(algo.getBypassDisabledDuration(1)).toBe(7);
      expect(algo.getBypassDisabledDuration(2)).toBe(14);
      expect(algo.getBypassDisabledDuration(3)).toBe(30);
      expect(algo.getBypassDisabledDuration(4)).toBe(30);
    });

    it("should check if rep can bypass", () => {
      const now = new Date();
      const future = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const past = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      expect(algo.canRepBypass(0, null, false)).toBe(true);
      expect(algo.canRepBypass(0, future, false)).toBe(false);
      expect(algo.canRepBypass(0, past, false)).toBe(true);
      expect(algo.canRepBypass(4, null, false)).toBe(false);
      expect(algo.canRepBypass(0, null, true)).toBe(false);
    });
  });

  // ============================================================================
  // PATH REPORT TTL & RELIABILITY TESTS
  // ============================================================================

  describe("Path Report TTL & Reliability", () => {
    it("should calculate TTL adjustment for high severity + still there", () => {
      const adjustment = algo.getTTLAdjustment(5, 1);
      expect(adjustment).toBe(30);
    });

    it("should calculate TTL adjustment for high severity + not there", () => {
      const adjustment = algo.getTTLAdjustment(5, -1);
      expect(adjustment).toBe(-30);
    });

    it("should calculate TTL adjustment for low severity + still there", () => {
      const adjustment = algo.getTTLAdjustment(2, 1);
      expect(adjustment).toBe(15);
    });

    it("should calculate TTL adjustment for low severity + not there", () => {
      const adjustment = algo.getTTLAdjustment(2, -1);
      expect(adjustment).toBe(-15);
    });

    it("should calculate reliability score", () => {
      const reliability = algo.calculateReliability(10, 2);
      expect(reliability).toBeGreaterThan(0.5);
      expect(reliability).toBeLessThan(1);
    });

    it("should calculate reliability with no votes", () => {
      const reliability = algo.calculateReliability(0, 0);
      expect(reliability).toBe(0.7); // (5*0.7 + 0) / (5 + 0 + 0)
    });
  });

  // ============================================================================
  // CHECK-IN VALIDATION TESTS
  // ============================================================================

  describe("Check-In Validation", () => {
    it("should detect failed check-in", () => {
      const pastETA = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      const failed = algo.hasCheckinFailed(pastETA, 5);
      expect(failed).toBe(true);
    });

    it("should not mark active check-in as failed", () => {
      const futureETA = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
      const failed = algo.hasCheckinFailed(futureETA, 5);
      expect(failed).toBe(false);
    });

    it("should respect grace period", () => {
      const eta = new Date(Date.now() - 3 * 60 * 1000); // 3 minutes ago
      const failed = algo.hasCheckinFailed(eta, 5); // 5 minute grace
      expect(failed).toBe(false);
    });
  });

  // ============================================================================
  // TIMESTAMP UTILITIES TESTS
  // ============================================================================

  describe("Timestamp Utilities", () => {
    it("should get claim expiration time (24 hours)", () => {
      const now = Date.now();
      const expiration = algo.getClaimExpirationTime();
      const diff = expiration.getTime() - now;

      // Should be approximately 24 hours (within 1 second tolerance)
      expect(diff).toBeGreaterThan(24 * 60 * 60 * 1000 - 1000);
      expect(diff).toBeLessThan(24 * 60 * 60 * 1000 + 1000);
    });

    it("should get walking request expiration time (5 minutes)", () => {
      const now = Date.now();
      const expiration = algo.getWalkingRequestExpirationTime();
      const diff = expiration.getTime() - now;

      // Should be approximately 5 minutes (within 1 second tolerance)
      expect(diff).toBeGreaterThan(5 * 60 * 1000 - 1000);
      expect(diff).toBeLessThan(5 * 60 * 1000 + 1000);
    });
  });
});
