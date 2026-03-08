import {
  int,
  varchar,
  text,
  timestamp,
  mysqlEnum,
  mysqlTable,
  decimal,
  boolean,
  json,
  index,
  unique,
  float,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

/**
 * CACTUS Database Schema
 * Campus Assistant for Class Tracking, Updates, and Safety
 */

// ============================================================================
// USERS & AUTHENTICATION
// ============================================================================

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  emailVerified: boolean("emailVerified").default(false).notNull(),
  verificationCode: varchar("verificationCode", { length: 6 }),
  verificationExpiry: timestamp("verificationExpiry"),
  avatarUrl: text("avatarUrl"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["student", "class_rep", "year_rep", "guild_admin", "lecturer"]).default("student").notNull(),
  isVerified: boolean("isVerified").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============================================================================
// COURSES & MEMBERSHIPS
// ============================================================================

export const courses = mysqlTable("courses", {
  id: int("id").autoincrement().primaryKey(),
  courseCode: varchar("courseCode", { length: 32 }).notNull().unique(),
  courseName: varchar("courseName", { length: 255 }).notNull(),
  description: text("description"),
  thumbnailUrl: varchar("thumbnailUrl", { length: 512 }),
  room: varchar("room", { length: 64 }),
  lecturer: varchar("lecturer", { length: 255 }),
  department: varchar("department", { length: 128 }),
  classSize: int("classSize").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Course = typeof courses.$inferSelect;
export type InsertCourse = typeof courses.$inferInsert;

// Course announcements (official broadcasts from class reps)
export const courseAnnouncements = mysqlTable(
  "course_announcements",
  {
    id: int("id").autoincrement().primaryKey(),
    courseId: int("courseId").notNull(),
    authorId: int("authorId").notNull(),
    announcementType: mysqlEnum("announcementType", ["cancelled", "room_changed", "lecturer_late", "rescheduled", "materials_uploaded", "general"]).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body"),
    isOfficial: boolean("isOfficial").default(false).notNull(),
    status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
    upvotes: int("upvotes").default(0).notNull(),
    downvotes: int("downvotes").default(0).notNull(),
    reviewedBy: int("reviewedBy"),
    reviewedAt: timestamp("reviewedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    courseIdIdx: index("idx_ann_course_id").on(table.courseId),
    authorIdIdx: index("idx_ann_author_id").on(table.authorId),
    statusIdx: index("idx_ann_status").on(table.status),
  })
);
export type CourseAnnouncement = typeof courseAnnouncements.$inferSelect;
export type InsertCourseAnnouncement = typeof courseAnnouncements.$inferInsert;

// User saved courses (bookmarks)
export const savedCourses = mysqlTable(
  "saved_courses",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    courseId: int("courseId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    uniqueSave: unique("unique_saved_course").on(table.userId, table.courseId),
  })
);
export type SavedCourse = typeof savedCourses.$inferSelect;
export type InsertSavedCourse = typeof savedCourses.$inferInsert;

export const courseMemberships = mysqlTable(
  "course_memberships",
  {
    id: int("id").autoincrement().primaryKey(),
    courseId: int("courseId").notNull(),
    userId: int("userId").notNull(),
    membershipRole: mysqlEnum("membershipRole", ["student", "class_rep", "lecturer"]).notNull(),
    verifiedBy: int("verifiedBy"),
    verifiedAt: timestamp("verifiedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    courseIdIdx: index("idx_course_id").on(table.courseId),
    userIdIdx: index("idx_user_id").on(table.userId),
    uniqueMembership: unique("unique_course_user").on(table.courseId, table.userId),
  })
);

export type CourseMembership = typeof courseMemberships.$inferSelect;
export type InsertCourseMembership = typeof courseMemberships.$inferInsert;

// ============================================================================
// WALKING BODY - GEOSPATIAL MATCHING
// ============================================================================

export const walkingAvailability = mysqlTable(
  "walking_availability",
  {
    userId: int("userId").primaryKey(),
    isAvailable: boolean("isAvailable").default(false).notNull(),
    lat: decimal("lat", { precision: 10, scale: 7 }).notNull(),
    lng: decimal("lng", { precision: 10, scale: 7 }).notNull(),
    geohash: varchar("geohash", { length: 12 }).notNull(), // precision 7
    geohash5: varchar("geohash5", { length: 5 }).notNull(), // prefix for indexing
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    geohash5Idx: index("idx_geohash5").on(table.geohash5),
    availabilityIdx: index("idx_is_available").on(table.isAvailable),
  })
);

export type WalkingAvailability = typeof walkingAvailability.$inferSelect;
export type InsertWalkingAvailability = typeof walkingAvailability.$inferInsert;

export const walkingRequests = mysqlTable(
  "walking_requests",
  {
    id: int("id").autoincrement().primaryKey(),
    requesterId: int("requesterId").notNull(),
    originLat: decimal("originLat", { precision: 10, scale: 7 }).notNull(),
    originLng: decimal("originLng", { precision: 10, scale: 7 }).notNull(),
    originGeohash: varchar("originGeohash", { length: 12 }).notNull(),
    originGeohash5: varchar("originGeohash5", { length: 5 }).notNull(),
    radiusM: int("radiusM").notNull(),
    status: mysqlEnum("status", ["open", "matched", "cancelled", "expired"]).default("open").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
  },
  (table) => ({
    requesterIdIdx: index("idx_requester_id").on(table.requesterId),
    statusIdx: index("idx_request_status").on(table.status),
  })
);

export type WalkingRequest = typeof walkingRequests.$inferSelect;
export type InsertWalkingRequest = typeof walkingRequests.$inferInsert;

export const walkingMatches = mysqlTable(
  "walking_matches",
  {
    id: int("id").autoincrement().primaryKey(),
    requestId: int("requestId").notNull(),
    walkerId: int("walkerId").notNull(),
    status: mysqlEnum("status", ["pending", "accepted", "declined", "completed", "cancelled"]).default("pending").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    respondedAt: timestamp("respondedAt"),
    completedAt: timestamp("completedAt"),
  },
  (table) => ({
    requestIdIdx: index("idx_match_request_id").on(table.requestId),
    walkerIdIdx: index("idx_walker_id").on(table.walkerId),
    statusIdx: index("idx_match_status").on(table.status),
  })
);

export type WalkingMatch = typeof walkingMatches.$inferSelect;
export type InsertWalkingMatch = typeof walkingMatches.$inferInsert;

export const walkingRatings = mysqlTable(
  "walking_ratings",
  {
    id: int("id").autoincrement().primaryKey(),
    matchId: int("matchId").notNull(),
    raterId: int("raterId").notNull(),
    rateeId: int("rateeId").notNull(),
    stars: int("stars").notNull(), // 1-5
    comment: text("comment"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    matchIdIdx: index("idx_rating_match_id").on(table.matchId),
    rateeIdIdx: index("idx_ratee_id").on(table.rateeId),
  })
);

export type WalkingRating = typeof walkingRatings.$inferSelect;
export type InsertWalkingRating = typeof walkingRatings.$inferInsert;

// ============================================================================
// CLASS CLAIMS - VERIFICATION & REPUTATION
// ============================================================================

export const classClaims = mysqlTable(
  "class_claims",
  {
    id: int("id").autoincrement().primaryKey(),
    courseId: int("courseId").notNull(),
    claimType: mysqlEnum("claimType", ["cancelled", "room_change", "time_change", "late", "other"]).notNull(),
    message: text("message").notNull(),
    createdBy: int("createdBy").notNull(),
    status: mysqlEnum("status", ["pending", "verified", "rejected", "expired"]).default("pending").notNull(),
    resolvedAt: timestamp("resolvedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
  },
  (table) => ({
    courseIdIdx: index("idx_claim_course_id").on(table.courseId),
    createdByIdx: index("idx_claim_created_by").on(table.createdBy),
    statusIdx: index("idx_claim_status").on(table.status),
  })
);

export type ClassClaim = typeof classClaims.$inferSelect;
export type InsertClassClaim = typeof classClaims.$inferInsert;

export const classClaimVotes = mysqlTable(
  "class_claim_votes",
  {
    id: int("id").autoincrement().primaryKey(),
    claimId: int("claimId").notNull(),
    voterId: int("voterId").notNull(),
    vote: int("vote").notNull(), // +1 confirm, -1 deny
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    claimIdIdx: index("idx_vote_claim_id").on(table.claimId),
    voterIdIdx: index("idx_voter_id").on(table.voterId),
    uniqueVote: unique("unique_claim_voter").on(table.claimId, table.voterId),
  })
);

export type ClassClaimVote = typeof classClaimVotes.$inferSelect;
export type InsertClassClaimVote = typeof classClaimVotes.$inferInsert;

export const repStrikes = mysqlTable(
  "rep_strikes",
  {
    id: int("id").autoincrement().primaryKey(),
    repId: int("repId").notNull(),
    courseId: int("courseId").notNull(),
    strikeCount: int("strikeCount").default(0).notNull(),
    bypassDisabledUntil: timestamp("bypassDisabledUntil"),
    bypassRevoked: boolean("bypassRevoked").default(false).notNull(),
    trueStreak: int("trueStreak").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    repIdIdx: index("idx_rep_id").on(table.repId),
    courseIdIdx: index("idx_strike_course_id").on(table.courseId),
    uniqueRepCourse: unique("unique_rep_course").on(table.repId, table.courseId),
  })
);

export type RepStrike = typeof repStrikes.$inferSelect;
export type InsertRepStrike = typeof repStrikes.$inferInsert;

// ============================================================================
// PATH REPORTS - CAUTION REPORTING
// ============================================================================

export const pathReports = mysqlTable(
  "path_reports",
  {
    id: int("id").autoincrement().primaryKey(),
    reportType: mysqlEnum("reportType", ["light_out", "broken_path", "flooding", "obstruction", "suspicious"]).notNull(),
    severity: int("severity").notNull(), // 1-5
    lat: decimal("lat", { precision: 10, scale: 7 }).notNull(),
    lng: decimal("lng", { precision: 10, scale: 7 }).notNull(),
    geohash: varchar("geohash", { length: 12 }).notNull(), // precision 7
    geohash6: varchar("geohash6", { length: 6 }).notNull(), // prefix for indexing
    createdBy: int("createdBy").notNull(),
    description: text("description"),
    ttlMinutes: int("ttlMinutes").notNull(),
    status: mysqlEnum("status", ["active", "verified", "expired", "resolved"]).default("active").notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    geohash6Idx: index("idx_geohash6").on(table.geohash6),
    createdByIdx: index("idx_report_created_by").on(table.createdBy),
    statusIdx: index("idx_report_status").on(table.status),
  })
);

export type PathReport = typeof pathReports.$inferSelect;
export type InsertPathReport = typeof pathReports.$inferInsert;

export const pathReportVotes = mysqlTable(
  "path_report_votes",
  {
    id: int("id").autoincrement().primaryKey(),
    reportId: int("reportId").notNull(),
    voterId: int("voterId").notNull(),
    vote: int("vote").notNull(), // +1 still_there, -1 not_there
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    reportIdIdx: index("idx_report_vote_report_id").on(table.reportId),
    voterIdIdx: index("idx_report_voter_id").on(table.voterId),
    uniqueReportVote: unique("unique_report_voter").on(table.reportId, table.voterId),
  })
);

export type PathReportVote = typeof pathReportVotes.$inferSelect;
export type InsertPathReportVote = typeof pathReportVotes.$inferInsert;

export const pathReportReliability = mysqlTable(
  "path_report_reliability",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().unique(),
    trueVotes: int("trueVotes").default(0).notNull(),
    falseVotes: int("falseVotes").default(0).notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("idx_reliability_user_id").on(table.userId),
  })
);

export type PathReportReliability = typeof pathReportReliability.$inferSelect;
export type InsertPathReportReliability = typeof pathReportReliability.$inferInsert;

// ============================================================================
// CHECK-INS - PRIVACY-PRESERVING DESTINATION TRACKING
// ============================================================================

export const checkins = mysqlTable(
  "checkins",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    destLat: decimal("destLat", { precision: 10, scale: 7 }).notNull(),
    destLng: decimal("destLng", { precision: 10, scale: 7 }).notNull(),
    destGeohash: varchar("destGeohash", { length: 12 }).notNull(),
    etaAt: timestamp("etaAt").notNull(),
    graceMinutes: int("graceMinutes").notNull(),
    status: mysqlEnum("status", ["active", "completed", "failed", "cancelled"]).default("active").notNull(),
    emergencyContact: varchar("emergencyContact", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
    failedAt: timestamp("failedAt"),
  },
  (table) => ({
    userIdIdx: index("idx_checkin_user_id").on(table.userId),
    statusIdx: index("idx_checkin_status").on(table.status),
  })
);

export type Checkin = typeof checkins.$inferSelect;
export type InsertCheckin = typeof checkins.$inferInsert;

// ============================================================================
// NOTIFICATIONS
// ============================================================================

export const notificationsOutbox = mysqlTable(
  "notifications_outbox",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    type: varchar("type", { length: 64 }).notNull(),
    payload: json("payload"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("idx_notification_user_id").on(table.userId),
  })
);

export type NotificationOutbox = typeof notificationsOutbox.$inferSelect;
export type InsertNotificationOutbox = typeof notificationsOutbox.$inferInsert;

// ============================================================================
// FOOTPATHS - MAP OVERLAYS
// ============================================================================

export const footpaths = mysqlTable(
  "footpaths",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 255 }),
    geoJson: json("geoJson").notNull(), // GeoJSON LineString
    createdBy: int("createdBy").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    createdByIdx: index("idx_footpath_created_by").on(table.createdBy),
  })
);

export type Footpath = typeof footpaths.$inferSelect;
export type InsertFootpath = typeof footpaths.$inferInsert;

// ============================================================================
// PATHFINDING GRAPH — NODES & EDGES
// ============================================================================

/**
 * A node in the campus footpath graph.
 * Represents a junction, landmark, or endpoint on the campus path network.
 */
export const pathNodes = mysqlTable(
  "pathNodes",
  {
    id: int("id").autoincrement().primaryKey(),
    /** Human-readable label (e.g. "Main Gate", "Library Junction") */
    name: varchar("name", { length: 255 }),
    lat: decimal("lat", { precision: 10, scale: 7 }).notNull(),
    lng: decimal("lng", { precision: 10, scale: 7 }).notNull(),
    /** Is this a named landmark worth visiting on a scenic route? */
    isLandmark: boolean("isLandmark").default(false).notNull(),
    /** Scenic desirability score 0-1 (higher = more scenic) */
    scenicScore: float("scenicScore").default(0).notNull(),
    /** Is this node fully accessible (no steps, ramps available)? */
    isAccessible: boolean("isAccessible").default(true).notNull(),
    /** Optional category for the landmark */
    category: varchar("category", { length: 64 }), // e.g. 'library','gate','cafeteria','admin'
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    latLngIdx: index("idx_pathnode_latlng").on(table.lat, table.lng),
  })
);
export type PathNode = typeof pathNodes.$inferSelect;
export type InsertPathNode = typeof pathNodes.$inferInsert;

/**
 * A directed edge between two path nodes.
 * Stores all metadata needed for multi-criteria cost calculation.
 */
export const pathEdges = mysqlTable(
  "pathEdges",
  {
    id: int("id").autoincrement().primaryKey(),
    fromNodeId: int("fromNodeId").notNull(),
    toNodeId: int("toNodeId").notNull(),
    /** Euclidean/haversine distance in metres */
    distanceM: float("distanceM").notNull(),
    /** Estimated walk time in seconds (distanceM / 1.4 m/s baseline) */
    walkTimeSec: int("walkTimeSec").notNull(),
    /**
     * Lighting quality 0-1.
     * 0 = completely unlit, 1 = well-lit street lamps throughout.
     * Used to penalise night-time traversal.
     */
    lighting: float("lighting").default(0.5).notNull(),
    /**
     * Weather coverage 0-1.
     * 0 = fully exposed, 1 = fully covered (walkway/arcade).
     * Used to penalise wet-weather traversal.
     */
    weatherCoverage: float("weatherCoverage").default(0.5).notNull(),
    /**
     * Isolation score 0-1.
     * 0 = very isolated (no bystanders), 1 = busy/populated path.
     * High isolation raises night-time cost.
     */
    isolation: float("isolation").default(0.5).notNull(),
    /**
     * Accessibility: true if the edge is step-free and wide enough for
     * wheelchairs/mobility aids.
     */
    isAccessible: boolean("isAccessible").default(true).notNull(),
    /**
     * Surface quality 0-1.
     * 0 = rough/unpaved, 1 = smooth paved.
     * Affects accessibility cost.
     */
    surfaceQuality: float("surfaceQuality").default(0.8).notNull(),
    /**
     * Scenic value 0-1.
     * Higher values reduce cost on the scenic profile.
     */
    scenicScore: float("scenicScore").default(0).notNull(),
    /**
     * Whether this edge has steps (immediately excludes from accessible route).
     */
    hasSteps: boolean("hasSteps").default(false).notNull(),
    /**
     * Slope grade percentage (positive = uphill from→to).
     * > 8% is considered inaccessible per ADA guidelines.
     */
    slopeGrade: float("slopeGrade").default(0).notNull(),
    /**
     * Cached count of confirmed violence/high-hazard reports in last 24h.
     * Updated by the background job every 5 minutes.
     * Edges with confirmedViolenceCount >= 3 are blocked on all profiles.
     */
    confirmedViolenceCount: int("confirmedViolenceCount").default(0).notNull(),
    /**
     * Cached count of any confirmed hazard reports in last 24h.
     */
    confirmedHazardCount: int("confirmedHazardCount").default(0).notNull(),
    /** Soft-delete: admin can disable an edge without removing it */
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    fromIdx: index("idx_edge_from").on(table.fromNodeId),
    toIdx: index("idx_edge_to").on(table.toNodeId),
    activeIdx: index("idx_edge_active").on(table.isActive),
  })
);
export type PathEdge = typeof pathEdges.$inferSelect;
export type InsertPathEdge = typeof pathEdges.$inferInsert;

/**
 * Cached route plans (avoids recomputing popular A→B pairs).
 * Expires every 5 minutes since hazard counts change frequently.
 */
export const routePlans = mysqlTable(
  "routePlans",
  {
    id: int("id").autoincrement().primaryKey(),
    fromNodeId: int("fromNodeId").notNull(),
    toNodeId: int("toNodeId").notNull(),
    mode: mysqlEnum("mode", ["shortest", "scenic", "accessible", "safe_night"]).notNull(),
    /** Hour of day (0-23) used for time-sensitive cost calculation */
    hourOfDay: int("hourOfDay").notNull(),
    /** Serialised route result (node IDs + GeoJSON coordinates) */
    result: json("result").notNull(),
    distanceM: float("distanceM").notNull(),
    walkTimeSec: int("walkTimeSec").notNull(),
    safetyScore: float("safetyScore").notNull(),
    /** Cache expires after 5 minutes */
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    modeIdx: index("idx_routeplan_mode").on(table.mode),
    expiresIdx: index("idx_routeplan_expires").on(table.expiresAt),
    fromToIdx: index("idx_routeplan_from_to").on(table.fromNodeId, table.toNodeId),
  })
);
export type RoutePlan = typeof routePlans.$inferSelect;
export type InsertRoutePlan = typeof routePlans.$inferInsert;
