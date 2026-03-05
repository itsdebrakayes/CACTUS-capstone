import * as geohash from "ngeohash";

/**
 * CACTUS Core Algorithms
 * Geohashing, trust scoring, claim validation, and more
 */

// ============================================================================
// GEOHASHING & SPATIAL MATCHING
// ============================================================================

const EARTH_RADIUS_M = 6371000;

/**
 * Calculate Haversine distance between two coordinates in meters
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

/**
 * Get geohash at specified precision
 */
export function getGeohash(lat: number, lng: number, precision: number): string {
  return geohash.encode(lat, lng, precision);
}

/**
 * Get geohash prefix (for indexing)
 */
export function getGeohashPrefix(lat: number, lng: number, precision: number): string {
  return geohash.encode(lat, lng, precision).substring(0, precision);
}

/**
 * Get all neighbors of a geohash cell
 */
export function getGeohashNeighbors(hash: string): string[] {
  const neighbors = geohash.neighbors(hash);
  return Object.values(neighbors) as string[];
}

/**
 * Build ring expansion for geohash-based search
 * Returns all cells within ring 0 (center), ring 1 (neighbors), and ring 2 (neighbors-of-neighbors)
 */
export function buildGeohashRing(lat: number, lng: number, precision: number) {
  const center = getGeohash(lat, lng, precision);
  const ring1 = getGeohashNeighbors(center);

  const ring2Set = new Set<string>();
  ring1.forEach((cell) => {
    const neighbors = getGeohashNeighbors(cell);
    neighbors.forEach((n) => ring2Set.add(n));
  });
  const ring2 = Array.from(ring2Set);

  return {
    center,
    ring1,
    ring2,
  };
}

/**
 * Get all geohash5 prefixes for a ring expansion
 */
export function getRing5Prefixes(lat: number, lng: number): string[] {
  const ring = buildGeohashRing(lat, lng, 6);
  const allCells = [ring.center, ...ring.ring1, ...ring.ring2];
  const prefixes = new Set<string>();

  allCells.forEach((cell) => {
    prefixes.add(cell.substring(0, 5));
  });

  return Array.from(prefixes);
}

/**
 * Fallback: Get geohash5 prefixes for precision 5 ring expansion
 */
export function getRing5PrefixesFallback(lat: number, lng: number): string[] {
  const ring = buildGeohashRing(lat, lng, 5);
  const allCells = [ring.center, ...ring.ring1, ...ring.ring2];
  return allCells;
}

// ============================================================================
// TRUST SCORE CALCULATION
// ============================================================================

/**
 * Calculate Bayesian stabilized trust score
 * Formula: trust = (Cm + np) / (C + n)
 * where C=5 (confidence), n=rating count, p=average stars / 5
 */
export function calculateTrustScore(
  averageStars: number,
  ratingCount: number,
  confidenceConstant: number = 5
): number {
  const p = averageStars / 5;
  const trust = (confidenceConstant * 0.7 + ratingCount * p) / (confidenceConstant + ratingCount);
  return Math.min(1, Math.max(0, trust)); // Clamp to [0, 1]
}

// ============================================================================
// CLASS CLAIM VALIDATION
// ============================================================================

/**
 * Calculate required confirmations based on class size
 */
export function getRequiredConfirmations(classSize: number, isRepClaim: boolean): number {
  if (isRepClaim) {
    return Math.max(1, Math.ceil(0.1 * classSize));
  }
  return Math.max(2, Math.ceil(0.3 * classSize));
}

/**
 * Calculate rejection threshold based on class size
 */
export function getRejectThreshold(classSize: number): number {
  return Math.max(2, Math.ceil(0.25 * classSize));
}

/**
 * Determine claim status based on vote counts
 */
export function determineClaimStatus(
  confirmCount: number,
  denyCount: number,
  requiredConfirms: number,
  rejectThreshold: number
): "pending" | "verified" | "rejected" {
  if (confirmCount >= requiredConfirms && confirmCount > denyCount) {
    return "verified";
  }
  if (denyCount >= rejectThreshold && denyCount > confirmCount) {
    return "rejected";
  }
  return "pending";
}

/**
 * Calculate bypass disabled duration based on strike count
 */
export function getBypassDisabledDuration(strikeCount: number): number {
  // Returns days
  if (strikeCount === 1) return 7;
  if (strikeCount === 2) return 14;
  if (strikeCount === 3) return 30;
  return 30; // Max 30 days
}

/**
 * Check if rep can bypass claim validation
 */
export function canRepBypass(
  strikeCount: number,
  bypassDisabledUntil: Date | null,
  bypassRevoked: boolean
): boolean {
  if (bypassRevoked) return false;
  if (strikeCount >= 4) return false;
  if (bypassDisabledUntil && new Date() < bypassDisabledUntil) return false;
  return true;
}

// ============================================================================
// PATH REPORT TTL & RELIABILITY
// ============================================================================

/**
 * Calculate TTL adjustment based on severity and vote
 */
export function getTTLAdjustment(severity: number, vote: number): number {
  // vote: +1 for "still there", -1 for "not there"
  const adjustment = severity >= 4 ? 30 : 15; // minutes
  return vote > 0 ? adjustment : -adjustment;
}

/**
 * Calculate reporter reliability score
 * Formula: reliability = (5*0.7 + true_votes) / (5 + true_votes + false_votes)
 */
export function calculateReliability(
  trueVotes: number,
  falseVotes: number,
  confidenceConstant: number = 5
): number {
  const numerator = confidenceConstant * 0.7 + trueVotes;
  const denominator = confidenceConstant + trueVotes + falseVotes;
  return numerator / denominator;
}

// ============================================================================
// CHECK-IN VALIDATION
// ============================================================================

/**
 * Check if a check-in has failed based on current time
 */
export function hasCheckinFailed(etaAt: Date, graceMinutes: number): boolean {
  const failTime = new Date(etaAt.getTime() + graceMinutes * 60 * 1000);
  return new Date() > failTime;
}

// ============================================================================
// TIMESTAMP UTILITIES
// ============================================================================

/**
 * Get expiration time for a claim (24 hours from now)
 */
export function getClaimExpirationTime(): Date {
  const now = new Date();
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * Get expiration time for a walking request (5 minutes from now)
 */
export function getWalkingRequestExpirationTime(): Date {
  const now = new Date();
  return new Date(now.getTime() + 5 * 60 * 1000);
}
