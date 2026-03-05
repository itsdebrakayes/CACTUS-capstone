/**
 * Unified type exports
 * Import shared types from this single entry point.
 */

export type * from "../drizzle/schema";
export * from "./_core/errors";

// ============================================================================
// CACTUS-SPECIFIC TYPES
// ============================================================================

// Walking Body Types
export interface WalkingAvailabilityUpdate {
  lat: number;
  lng: number;
  isAvailable: boolean;
}

export interface WalkingRequestInput {
  radiusM: number;
}

export interface WalkingMatchResponse {
  matchId: number;
  action: "accept" | "decline";
}

export interface WalkingRatingInput {
  matchId: number;
  stars: number;
  comment?: string;
}

// Class Claims Types
export type ClaimType = "cancelled" | "room_change" | "time_change" | "late" | "other";

export interface ClassClaimInput {
  courseId: number;
  claimType: ClaimType;
  message: string;
}

export interface ClassClaimVoteInput {
  claimId: number;
  vote: "confirm" | "deny";
}

// Path Reports Types
export type ReportType = "light_out" | "broken_path" | "flooding" | "obstruction" | "suspicious";

export interface PathReportInput {
  reportType: ReportType;
  severity: number; // 1-5
  lat: number;
  lng: number;
}

export interface PathReportVoteInput {
  reportId: number;
  vote: "still_there" | "not_there";
}

// Check-In Types
export interface CheckinInput {
  destLat: number;
  destLng: number;
  etaAt: Date;
  graceMinutes: number;
  emergencyContact?: string;
}

// Realtime Event Types
export type RealtimeEventType =
  | "walking.availability.updated"
  | "walking.request.created"
  | "walking.match.updated"
  | "trust.walking.updated"
  | "class.claim.created"
  | "class.claim.voted"
  | "class.claim.resolved"
  | "class.rep.strike"
  | "class.rep.forgiveness"
  | "reports.created"
  | "reports.voted"
  | "reports.ttl.tick"
  | "reports.expired"
  | "checkins.created"
  | "checkins.completed"
  | "checkins.failed";

export interface RealtimeEvent {
  type: RealtimeEventType;
  timestamp: number;
  data: any;
}

// Geohash Types
export interface GeohashRing {
  center: string;
  ring1: string[];
  ring2: string[];
}

// Trust Score Types
export interface TrustScore {
  userId: number;
  score: number;
  ratingCount: number;
  averageStars: number;
}

// Course Types
export interface CourseInput {
  courseCode: string;
  courseName: string;
  classSize: number;
}

export interface EnrollInput {
  courseId: number;
  userId: number;
  membershipRole: "student" | "class_rep" | "lecturer";
}

// Footpath Types
export interface FootpathInput {
  name?: string;
  geoJson: any; // GeoJSON LineString
}
