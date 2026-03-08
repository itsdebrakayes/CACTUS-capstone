import * as geohash from "ngeohash";

/**
 * CACTUS Core Algorithms
 * ======================
 * All algorithms implemented per the Capstone specification document.
 *
 * Sections:
 *   1. Geohash utilities
 *   2. Walking Body — Bayesian trust score with time-decay and safety penalty
 *   3. Class Claims — dynamic threshold, Bayesian trust update, strike system
 *   4. Caution Reports — TTL management, reliability score, weighted confirmations
 *   5. Check-In — ETA monitoring, no-progress detection
 *   6. Timestamp helpers
 */

// ============================================================================
// 1. GEOHASH UTILITIES
// ============================================================================

const EARTH_RADIUS_M = 6_371_000;

/** Haversine distance between two coordinates in metres. */
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Encode lat/lng to geohash at a given precision. */
export function getGeohash(lat: number, lng: number, precision: number): string {
  return geohash.encode(lat, lng, precision);
}

/** Get the geohash prefix at a lower precision (for indexing). */
export function getGeohashPrefix(lat: number, lng: number, precision: number): string {
  return geohash.encode(lat, lng, precision).substring(0, precision);
}

/** Return the 8 immediate neighbours of a geohash cell. */
export function getGeohashNeighbors(hash: string): string[] {
  const neighbors = geohash.neighbors(hash);
  return Object.values(neighbors) as string[];
}

export interface GeohashRing {
  center: string;
  ring1: string[];
  ring2: string[];
}

/**
 * Build a two-ring neighbourhood around a point.
 * Ring 1 = 8 direct neighbours. Ring 2 = their neighbours minus ring 1.
 */
export function buildGeohashRing(lat: number, lng: number, precision: number): GeohashRing {
  const center = getGeohash(lat, lng, precision);
  const ring1 = getGeohashNeighbors(center);
  const ring2Set = new Set<string>();
  ring1.forEach((cell) => {
    getGeohashNeighbors(cell).forEach((n) => {
      if (n !== center && !ring1.includes(n)) ring2Set.add(n);
    });
  });
  return { center, ring1, ring2: Array.from(ring2Set) };
}

/** Get all geohash-5 prefix cells within two rings of a point. */
export function getRing5Prefixes(lat: number, lng: number): string[] {
  const ring = buildGeohashRing(lat, lng, 6);
  const allCells = [ring.center, ...ring.ring1, ...ring.ring2];
  const prefixes = new Set<string>();
  allCells.forEach((cell) => prefixes.add(cell.substring(0, 5)));
  return Array.from(prefixes);
}

/** Fallback: geohash-5 ring expansion. */
export function getRing5PrefixesFallback(lat: number, lng: number): string[] {
  const ring = buildGeohashRing(lat, lng, 5);
  return [ring.center, ...ring.ring1, ...ring.ring2];
}

// ============================================================================
// 2. WALKING BODY — BAYESIAN TRUST SCORE WITH TIME-DECAY
// ============================================================================

/**
 * Full Bayesian trust score per spec:
 *
 *   T_i = (C·m + Σ w_k·r_k) / (C + Σ w_k)
 *
 * where:
 *   C   = confidence constant (default 5 — equivalent to 5 neutral ratings)
 *   m   = prior mean (0.7)
 *   r_k = normalised rating for interaction k  (stars / 5)
 *   w_k = time-decay weight  e^(−λ · age_days)
 *   λ   = decay constant (default 0.02 → half-life ≈ 35 days)
 *
 * Safety penalty applied after Bayesian estimate:
 *   T_final = T_i · (1 − λ_s · flagCount)   clamped to [0, 1]
 *   λ_s = 0.15 per flag
 */
export function calculateTrustScore(
  ratings: Array<{ stars: number; createdAtMs: number }>,
  flagCount: number = 0,
  confidenceConstant: number = 5,
  priorMean: number = 0.7,
  decayLambda: number = 0.02,
  safetyPenaltyPerFlag: number = 0.15
): number {
  const nowMs = Date.now();
  let weightedSum = 0;
  let totalWeight = 0;

  for (const r of ratings) {
    const ageDays = (nowMs - r.createdAtMs) / (1000 * 60 * 60 * 24);
    const w = Math.exp(-decayLambda * ageDays);
    weightedSum += w * (r.stars / 5);
    totalWeight += w;
  }

  const bayesian = (confidenceConstant * priorMean + weightedSum) / (confidenceConstant + totalWeight);
  const penalty = Math.min(1, safetyPenaltyPerFlag * flagCount);
  return Math.min(1, Math.max(0, bayesian * (1 - penalty)));
}

/**
 * Simplified overload: pre-aggregated averageStars + count.
 * Used when individual rating timestamps are not available.
 */
export function calculateTrustScoreSimple(
  averageStars: number,
  ratingCount: number,
  flagCount: number = 0,
  confidenceConstant: number = 5,
  priorMean: number = 0.7,
  safetyPenaltyPerFlag: number = 0.15
): number {
  const p = averageStars / 5;
  const bayesian = (confidenceConstant * priorMean + ratingCount * p) / (confidenceConstant + ratingCount);
  const penalty = Math.min(1, safetyPenaltyPerFlag * flagCount);
  return Math.min(1, Math.max(0, bayesian * (1 - penalty)));
}

// ============================================================================
// 3. CLASS CLAIMS — DYNAMIC THRESHOLD & STRIKE SYSTEM
// ============================================================================

/**
 * Dynamic confirmation threshold per spec:
 *
 *   θ = ceil( α · N · R · (1 − β · T_u) )
 *
 * where:
 *   α  = base fraction (0.3 for regular users, 0.1 for class reps)
 *   N  = enrolled class size
 *   R  = role multiplier (1.0 for students, 0.5 for class reps)
 *   β  = trust discount factor (0.5)
 *   T_u = submitter's trust score [0, 1]
 *
 * Minimum of 1 confirmation always required.
 */
export function getRequiredConfirmations(
  classSize: number,
  isRepClaim: boolean,
  submitterTrust: number = 0.5
): number {
  const alpha = isRepClaim ? 0.1 : 0.3;
  const roleMultiplier = isRepClaim ? 0.5 : 1.0;
  const beta = 0.5;
  const raw = alpha * classSize * roleMultiplier * (1 - beta * submitterTrust);
  return Math.max(1, Math.ceil(raw));
}

/**
 * Rejection threshold: votes needed to reject a claim.
 * Set at 25% of class size, minimum 2.
 */
export function getRejectThreshold(classSize: number): number {
  return Math.max(2, Math.ceil(0.25 * classSize));
}

/**
 * Bayesian trust update after a claim resolves:
 *
 *   T_new = T / (C + T + F)
 *
 * where T = confirmed votes, F = denied votes, C = confidence constant (5).
 */
export function updateClaimTrust(
  confirmedVotes: number,
  deniedVotes: number,
  confidenceConstant: number = 5
): number {
  const denominator = confidenceConstant + confirmedVotes + deniedVotes;
  return Math.min(1, Math.max(0, confirmedVotes / denominator));
}

/**
 * Determine claim status from current vote counts.
 */
export function determineClaimStatus(
  confirmCount: number,
  denyCount: number,
  requiredConfirms: number,
  rejectThreshold: number
): "pending" | "verified" | "rejected" {
  if (confirmCount >= requiredConfirms && confirmCount > denyCount) return "verified";
  if (denyCount >= rejectThreshold && denyCount > confirmCount) return "rejected";
  return "pending";
}

// ─── Strike System ────────────────────────────────────────────────────────────

export type StrikeAction = "warning" | "bypass_suspended" | "extended_suspend" | "semester_ban";

export interface StrikeOutcome {
  action: StrikeAction;
  /** Days the bypass privilege is suspended (0 = no suspension). */
  suspendDays: number;
  message: string;
}

/**
 * 4-strike escalation per spec:
 *
 *   Strike 1 → Warning only
 *   Strike 2 → Bypass suspended 7 days
 *   Strike 3 → Bypass suspended 14 days
 *   Strike 4+ → Semester ban (bypass permanently revoked)
 */
export function getStrikePenalty(newStrikeCount: number): StrikeOutcome {
  switch (newStrikeCount) {
    case 1:
      return { action: "warning", suspendDays: 0, message: "Warning issued. One more false claim may suspend your bypass." };
    case 2:
      return { action: "bypass_suspended", suspendDays: 7, message: "Bypass privilege suspended for 7 days." };
    case 3:
      return { action: "extended_suspend", suspendDays: 14, message: "Bypass privilege suspended for 14 days." };
    default:
      return { action: "semester_ban", suspendDays: 365, message: "Bypass privilege permanently revoked for this semester." };
  }
}

/**
 * Strike forgiveness: a 30-day clean streak decays one strike.
 * Returns the adjusted strike count (never below 0).
 */
export function applyStrikeForgiveness(
  currentStrikes: number,
  lastStrikeMs: number,
  forgivenessWindowDays: number = 30
): number {
  if (currentStrikes <= 0) return 0;
  const daysSince = (Date.now() - lastStrikeMs) / (1000 * 60 * 60 * 24);
  return daysSince >= forgivenessWindowDays ? Math.max(0, currentStrikes - 1) : currentStrikes;
}

/**
 * Bypass disabled duration in days based on strike count.
 */
export function getBypassDisabledDuration(strikeCount: number): number {
  if (strikeCount <= 1) return 0;
  if (strikeCount === 2) return 7;
  if (strikeCount === 3) return 14;
  return 365; // semester ban
}

/**
 * Check whether a class rep can bypass claim validation.
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
// 4. CAUTION REPORTS — TTL & RELIABILITY
// ============================================================================

/**
 * Initial TTL in minutes based on report severity:
 *
 *   Severity 1-2 → 20 min
 *   Severity 3   → 40 min
 *   Severity 4   → 60 min
 *   Severity 5   → 120 min
 */
export function getInitialTTL(severity: number): number {
  if (severity <= 2) return 20;
  if (severity === 3) return 40;
  if (severity === 4) return 60;
  return 120;
}

/**
 * TTL adjustment from a single vote, weighted by voter reliability:
 *
 *   Δ = direction · base · reliability
 *
 * where:
 *   direction = +1 (still_there) or -1 (not_there)
 *   base      = severity >= 4 ? 30 : 15  (minutes)
 *   reliability = voter's reliability score [0, 1]
 */
export function getTTLAdjustment(
  severity: number,
  voteDirection: 1 | -1 | number,
  voterReliability: number = 0.7
): number {
  const base = severity >= 4 ? 30 : 15;
  const direction = voteDirection > 0 ? 1 : -1;
  return Math.round(direction * base * voterReliability);
}

/**
 * Reputation-weighted confirmation score:
 *
 *   W = Σ reliability_i  for all "still_there" votes
 */
export function getWeightedConfirmationScore(
  votes: Array<{ direction: 1 | -1; voterReliability: number }>
): number {
  return votes
    .filter((v) => v.direction === 1)
    .reduce((sum, v) => sum + v.voterReliability, 0);
}

/**
 * Path-Report Reliability Score (separate from walking trust):
 *
 *   R = (C·m + T) / (C + T + F)
 *
 * where C = 5, m = 0.7, T = true confirmations, F = false confirmations.
 */
export function calculateReliability(
  trueVotes: number,
  falseVotes: number,
  confidenceConstant: number = 5,
  priorMean: number = 0.7
): number {
  const numerator = confidenceConstant * priorMean + trueVotes;
  const denominator = confidenceConstant + trueVotes + falseVotes;
  return Math.min(1, Math.max(0, numerator / denominator));
}

/**
 * Determine whether a stale report needs re-validation.
 * Stale = last vote was more than `staleThresholdMinutes` ago AND TTL > 0.
 */
export function needsRevalidation(
  lastVoteMs: number | null,
  ttlMinutes: number,
  staleThresholdMinutes: number = 30
): boolean {
  if (ttlMinutes <= 0) return false;
  if (!lastVoteMs) return true;
  const minutesSince = (Date.now() - lastVoteMs) / (1000 * 60);
  return minutesSince >= staleThresholdMinutes;
}

// ============================================================================
// 5. CHECK-IN — ETA MONITORING
// ============================================================================

/**
 * Check whether a check-in has failed (ETA + grace period has passed).
 */
export function hasCheckinFailed(etaAt: Date, graceMinutes: number): boolean {
  const failTime = new Date(etaAt.getTime() + graceMinutes * 60 * 1000);
  return new Date() > failTime;
}

/**
 * Detect no-progress: user has not moved `minDistanceMeters` in `windowMinutes`.
 */
export function isStationary(
  lastLat: number, lastLng: number,
  currentLat: number, currentLng: number,
  lastUpdateMs: number,
  windowMinutes: number = 5,
  minDistanceMeters: number = 20
): boolean {
  const elapsedMinutes = (Date.now() - lastUpdateMs) / (1000 * 60);
  if (elapsedMinutes < windowMinutes) return false;
  return haversineDistance(lastLat, lastLng, currentLat, currentLng) < minDistanceMeters;
}

// ============================================================================
// 6. TIMESTAMP HELPERS
// ============================================================================

/** Claim expiration: 24 hours from now. */
export function getClaimExpirationTime(): Date {
  return new Date(Date.now() + 24 * 60 * 60 * 1000);
}

/** Walking request expiration: 5 minutes from now. */
export function getWalkingRequestExpirationTime(): Date {
  return new Date(Date.now() + 5 * 60 * 1000);
}

/** Bypass suspension end date: N days from now. */
export function getBypassSuspendedUntil(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
