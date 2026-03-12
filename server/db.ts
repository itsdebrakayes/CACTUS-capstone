import { eq, and, or, gt, lt, lte, gte, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  InsertUser,
  users,
  courses,
  courseMemberships,
  walkingAvailability,
  walkingRequests,
  walkingMatches,
  walkingRatings,
  classClaims,
  classClaimVotes,
  repStrikes,
  pathReports,
  pathReportVotes,
  pathReportReliability,
  checkins,
  notificationsOutbox,
  footpaths,
  courseAnnouncements,
  savedCourses,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _client = postgres(process.env.DATABASE_URL, {
        prepare: false,
        max: 1,
      });
      _db = drizzle(_client);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _client = null;
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'guild_admin';
      updateSet.role = 'guild_admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createLocalUser(data: {
  name: string;
  email: string;
  passwordHash: string;
  verificationCode: string;
  verificationExpiry: Date;
  role?: "student" | "class_rep" | "year_rep" | "guild_admin" | "lecturer";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const openId = `local:${data.email}`;
  await db.insert(users).values({
    openId,
    name: data.name,
    email: data.email,
    passwordHash: data.passwordHash,
    emailVerified: false,
    verificationCode: data.verificationCode,
    verificationExpiry: data.verificationExpiry,
    loginMethod: "local",
    role: data.role ?? "student",
    lastSignedIn: new Date(),
  });
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function setVerificationCode(userId: number, code: string, expiry: Date) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ verificationCode: code, verificationExpiry: expiry }).where(eq(users.id, userId));
}

export async function verifyUserEmail(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ emailVerified: true, isVerified: true, verificationCode: null, verificationExpiry: null }).where(eq(users.id, userId));
}

// ============================================================================
// WALKING BODY QUERIES
// ============================================================================

export async function upsertWalkingAvailability(
  userId: number,
  isAvailable: boolean,
  lat: string,
  lng: string,
  geohash: string,
  geohash5: string
) {
  const db = await getDb();
  if (!db) return;

  await db
    .insert(walkingAvailability)
    .values({
      userId,
      isAvailable,
      lat,
      lng,
      geohash,
      geohash5,
    })
    .onConflictDoUpdate({
      target: walkingAvailability.userId,
      set: {
        isAvailable,
        lat,
        lng,
        geohash,
        geohash5,
        updatedAt: new Date(),
      },
    });
}

export async function getAvailableWalkersByGeohash5(geohash5Prefixes: string[]) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(walkingAvailability)
    .where(and(inArray(walkingAvailability.geohash5, geohash5Prefixes), eq(walkingAvailability.isAvailable, true)));
}

export async function getWalkingAvailability(userId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(walkingAvailability)
    .where(eq(walkingAvailability.userId, userId))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function createWalkingRequest(
  requesterId: number,
  originLat: string,
  originLng: string,
  originGeohash: string,
  originGeohash5: string,
  radiusM: number,
  expiresAt: Date
) {
  const db = await getDb();
  if (!db) return null;

  await db.insert(walkingRequests).values({
    requesterId,
    originLat,
    originLng,
    originGeohash,
    originGeohash5,
    radiusM,
    expiresAt,
  });

  // Return the created request by querying it back
  const result = await db
    .select()
    .from(walkingRequests)
    .where(eq(walkingRequests.requesterId, requesterId))
    .orderBy(sql`id DESC`)
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getWalkingRequest(requestId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(walkingRequests)
    .where(eq(walkingRequests.id, requestId))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function createWalkingMatch(requestId: number, walkerId: number) {
  const db = await getDb();
  if (!db) return null;

  await db.insert(walkingMatches).values({
    requestId,
    walkerId,
  });

  // Return the created match by querying it back
  const result = await db
    .select()
    .from(walkingMatches)
    .where(and(eq(walkingMatches.requestId, requestId), eq(walkingMatches.walkerId, walkerId)))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getWalkingMatch(matchId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(walkingMatches)
    .where(eq(walkingMatches.id, matchId))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function updateWalkingMatchStatus(matchId: number, status: string) {
  const db = await getDb();
  if (!db) return;

  await db
    .update(walkingMatches)
    .set({
      status: status as any,
      respondedAt: new Date(),
    })
    .where(eq(walkingMatches.id, matchId));
}

export async function createWalkingRating(
  matchId: number,
  raterId: number,
  rateeId: number,
  stars: number,
  comment?: string
) {
  const db = await getDb();
  if (!db) return null;

  await db.insert(walkingRatings).values({
    matchId,
    raterId,
    rateeId,
    stars,
    comment,
  });

  return { success: true };
}

export async function getWalkingRatingsForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(walkingRatings).where(eq(walkingRatings.rateeId, userId));
}

// ============================================================================
// CLASS CLAIMS QUERIES
// ============================================================================

export async function createClassClaim(
  courseId: number,
  claimType: string,
  message: string,
  createdBy: number,
  expiresAt: Date
) {
  const db = await getDb();
  if (!db) return null;

  await db.insert(classClaims).values({
    courseId,
    claimType: claimType as any,
    message,
    createdBy,
    expiresAt,
  });

  // Return the created claim by querying it back
  const result = await db
    .select()
    .from(classClaims)
    .where(eq(classClaims.createdBy, createdBy))
    .orderBy(sql`id DESC`)
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getClassClaim(claimId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(classClaims)
    .where(eq(classClaims.id, claimId))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getClassClaimsByCourse(courseId: number) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(classClaims).where(eq(classClaims.courseId, courseId));
}

export async function createClassClaimVote(claimId: number, voterId: number, vote: number) {
  const db = await getDb();
  if (!db) return null;

  await db.insert(classClaimVotes).values({
    claimId,
    voterId,
    vote,
  });

  return { success: true };
}

export async function getClassClaimVotes(claimId: number) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(classClaimVotes).where(eq(classClaimVotes.claimId, claimId));
}

export async function updateClassClaimStatus(claimId: number, status: string) {
  const db = await getDb();
  if (!db) return;

  await db
    .update(classClaims)
    .set({
      status: status as any,
      resolvedAt: new Date(),
    })
    .where(eq(classClaims.id, claimId));
}

export async function getOrCreateRepStrike(repId: number, courseId: number) {
  const db = await getDb();
  if (!db) return null;

  const existing = await db
    .select()
    .from(repStrikes)
    .where(and(eq(repStrikes.repId, repId), eq(repStrikes.courseId, courseId)))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  await db.insert(repStrikes).values({
    repId,
    courseId,
  });

  // Return the created strike by querying it back
  const result = await db
    .select()
    .from(repStrikes)
    .where(and(eq(repStrikes.repId, repId), eq(repStrikes.courseId, courseId)))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function updateRepStrike(
  repId: number,
  courseId: number,
  strikeCount: number,
  bypassDisabledUntil?: Date,
  bypassRevoked?: boolean,
  trueStreak?: number
) {
  const db = await getDb();
  if (!db) return;

  const updateData: any = { strikeCount };
  if (bypassDisabledUntil !== undefined) updateData.bypassDisabledUntil = bypassDisabledUntil;
  if (bypassRevoked !== undefined) updateData.bypassRevoked = bypassRevoked;
  if (trueStreak !== undefined) updateData.trueStreak = trueStreak;

  await db
    .update(repStrikes)
    .set(updateData)
    .where(and(eq(repStrikes.repId, repId), eq(repStrikes.courseId, courseId)));
}

// ============================================================================
// PATH REPORTS QUERIES
// ============================================================================

export async function createPathReport(
  reportType: string,
  severity: number,
  lat: string,
  lng: string,
  geohash: string,
  geohash6: string,
  createdBy: number,
  ttlMinutes: number,
  description?: string
) {
  const db = await getDb();
  if (!db) return null;

  await db.insert(pathReports).values({
    reportType: reportType as any,
    severity,
    lat,
    lng,
    geohash,
    geohash6,
    createdBy,
    ttlMinutes,
    description: description || null,
  });

  // Return the created report by querying it back
  const result = await db
    .select()
    .from(pathReports)
    .where(eq(pathReports.createdBy, createdBy))
    .orderBy(sql`id DESC`)
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getPathReport(reportId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(pathReports)
    .where(eq(pathReports.id, reportId))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getPathReportsByGeohash6(geohash6Prefixes: string[]) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(pathReports)
    .where(
      and(inArray(pathReports.geohash6, geohash6Prefixes), eq(pathReports.status, "active"))
    );
}

export async function createPathReportVote(reportId: number, voterId: number, vote: number) {
  const db = await getDb();
  if (!db) return null;

  await db.insert(pathReportVotes).values({
    reportId,
    voterId,
    vote,
  });

  return { success: true };
}

export async function getPathReportVotes(reportId: number) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(pathReportVotes).where(eq(pathReportVotes.reportId, reportId));
}

export async function updatePathReportTTL(reportId: number, ttlMinutes: number) {
  const db = await getDb();
  if (!db) return;

  await db
    .update(pathReports)
    .set({
      ttlMinutes,
      updatedAt: new Date(),
    })
    .where(eq(pathReports.id, reportId));
}

export async function updatePathReportStatus(reportId: number, status: string) {
  const db = await getDb();
  if (!db) return;

  await db
    .update(pathReports)
    .set({
      status: status as any,
      updatedAt: new Date(),
    })
    .where(eq(pathReports.id, reportId));
}

export async function getActivePathReports() {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(pathReports).where(eq(pathReports.status, "active"));
}

export async function getOrCreatePathReportReliability(userId: number) {
  const db = await getDb();
  if (!db) return null;

  const existing = await db
    .select()
    .from(pathReportReliability)
    .where(eq(pathReportReliability.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  await db.insert(pathReportReliability).values({
    userId,
  });

  // Return the created reliability by querying it back
  const result = await db
    .select()
    .from(pathReportReliability)
    .where(eq(pathReportReliability.userId, userId))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function updatePathReportReliability(
  userId: number,
  trueVotes: number,
  falseVotes: number
) {
  const db = await getDb();
  if (!db) return;

  await db
    .update(pathReportReliability)
    .set({
      trueVotes,
      falseVotes,
      updatedAt: new Date(),
    })
    .where(eq(pathReportReliability.userId, userId));
}

// ============================================================================
// CHECK-IN QUERIES
// ============================================================================

export async function createCheckin(
  userId: number,
  destLat: string,
  destLng: string,
  destGeohash: string,
  etaAt: Date,
  graceMinutes: number,
  emergencyContact?: string
) {
  const db = await getDb();
  if (!db) return null;

  await db.insert(checkins).values({
    userId,
    destLat,
    destLng,
    destGeohash,
    etaAt,
    graceMinutes,
    emergencyContact,
  });

  // Return the created checkin by querying it back
  const result = await db
    .select()
    .from(checkins)
    .where(eq(checkins.userId, userId))
    .orderBy(sql`id DESC`)
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getCheckin(checkinId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(checkins)
    .where(eq(checkins.id, checkinId))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getActiveCheckinsForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(checkins)
    .where(and(eq(checkins.userId, userId), eq(checkins.status, "active")));
}

export async function getActiveCheckins() {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(checkins).where(eq(checkins.status, "active"));
}

export async function updateCheckinStatus(checkinId: number, status: string, completedAt?: Date, failedAt?: Date) {
  const db = await getDb();
  if (!db) return;

  const updateData: any = { status: status as any };
  if (completedAt) updateData.completedAt = completedAt;
  if (failedAt) updateData.failedAt = failedAt;

  await db
    .update(checkins)
    .set(updateData)
    .where(eq(checkins.id, checkinId));
}

// ============================================================================
// NOTIFICATION QUERIES
// ============================================================================

export async function createNotification(userId: number, type: string, payload: any) {
  const db = await getDb();
  if (!db) return null;

  await db.insert(notificationsOutbox).values({
    userId,
    type,
    payload,
  });

  return { success: true };
}

// ============================================================================
// COURSE & MEMBERSHIP QUERIES
// ============================================================================

export async function createCourse(courseCode: string, courseName: string, classSize: number) {
  const db = await getDb();
  if (!db) return null;

  await db.insert(courses).values({
    courseCode,
    courseName,
    classSize,
  });

  // Return the created course by querying it back
  const result = await db
    .select()
    .from(courses)
    .where(eq(courses.courseCode, courseCode))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getCourse(courseId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getCourseMembership(courseId: number, userId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(courseMemberships)
    .where(and(eq(courseMemberships.courseId, courseId), eq(courseMemberships.userId, userId)))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function verifyRepMembership(courseId: number, userId: number) {
  const db = await getDb();
  if (!db) return;

  await db
    .update(courseMemberships)
    .set({
      verifiedAt: new Date(),
    })
    .where(and(eq(courseMemberships.courseId, courseId), eq(courseMemberships.userId, userId)));
}

// ============================================================================
// FOOTPATH QUERIES
// ============================================================================

export async function createFootpath(name: string | null, geoJson: any, createdBy: number) {
  const db = await getDb();
  if (!db) return null;

  await db.insert(footpaths).values({
    name,
    geoJson,
    createdBy,
  });

  // Return the created footpath by querying it back
  const result = await db
    .select()
    .from(footpaths)
    .where(eq(footpaths.createdBy, createdBy))
    .orderBy(sql`id DESC`)
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getAllFootpaths() {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(footpaths);
}

// ============================================================================
// PATHFINDING GRAPH QUERIES
// ============================================================================

// Add missing imports at the top — these are appended here for the graph tables
import {
  pathNodes as _pathNodes,
  pathEdges as _pathEdges,
  routePlans as _routePlans,
} from "../drizzle/schema";

export async function getAllPathNodes() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(_pathNodes);
}

export async function getAllPathEdges() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(_pathEdges).where(eq(_pathEdges.isActive, true));
}

export async function getPathNode(nodeId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(_pathNodes).where(eq(_pathNodes.id, nodeId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function insertPathNode(data: {
  name?: string | null;
  lat: string;
  lng: string;
  isLandmark?: boolean;
  scenicScore?: number;
  isAccessible?: boolean;
  category?: string | null;
}) {
  const db = await getDb();
  if (!db) return null;
  await db.insert(_pathNodes).values(data as any);
  const result = await db
    .select()
    .from(_pathNodes)
    .orderBy(sql`id DESC`)
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function insertPathEdge(data: {
  fromNodeId: number;
  toNodeId: number;
  distanceM: number;
  walkTimeSec: number;
  lighting?: number;
  weatherCoverage?: number;
  isolation?: number;
  isAccessible?: boolean;
  surfaceQuality?: number;
  scenicScore?: number;
  hasSteps?: boolean;
  slopeGrade?: number;
  confirmedViolenceCount?: number;
  confirmedHazardCount?: number;
}) {
  const db = await getDb();
  if (!db) return null;
  await db.insert(_pathEdges).values(data as any);
  return { success: true };
}

export async function updateEdgeHazardCounts(
  edgeId: number,
  confirmedViolenceCount: number,
  confirmedHazardCount: number
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(_pathEdges)
    .set({ confirmedViolenceCount, confirmedHazardCount })
    .where(eq(_pathEdges.id, edgeId));
}

export async function getCachedRoutePlan(
  fromNodeId: number,
  toNodeId: number,
  mode: string,
  hourOfDay: number
) {
  const db = await getDb();
  if (!db) return null;
  const now = new Date();
  const result = await db
    .select()
    .from(_routePlans)
    .where(
      and(
        eq(_routePlans.fromNodeId, fromNodeId),
        eq(_routePlans.toNodeId, toNodeId),
        eq(_routePlans.mode, mode as any),
        eq(_routePlans.hourOfDay, hourOfDay),
        gt(_routePlans.expiresAt, now)
      )
    )
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function cacheRoutePlan(data: {
  fromNodeId: number;
  toNodeId: number;
  mode: string;
  hourOfDay: number;
  result: any;
  distanceM: number;
  walkTimeSec: number;
  safetyScore: number;
}) {
  const db = await getDb();
  if (!db) return;
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
  await db.insert(_routePlans).values({ ...data, mode: data.mode as any, expiresAt });
}

export async function countPathNodes() {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`COUNT(*)` }).from(_pathNodes);
  return Number(result[0]?.count ?? 0);
}

// ============================================================================
// COURSES & COURSE MANAGEMENT QUERIES
// ============================================================================

export async function getAllCourses() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(courses).where(eq(courses.isActive, true));
}

export async function getCourseById(courseId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getCoursesByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const memberships = await db
    .select()
    .from(courseMemberships)
    .where(eq(courseMemberships.userId, userId));
  if (memberships.length === 0) return [];
  const courseIds = memberships.map((m) => m.courseId);
  const courseList = await db
    .select()
    .from(courses)
    .where(and(inArray(courses.id, courseIds), eq(courses.isActive, true)));
  return courseList.map((c) => {
    const membership = memberships.find((m) => m.courseId === c.id);
    return { ...c, membershipRole: membership?.membershipRole ?? "student" };
  });
}

export async function getSavedCoursesByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const saved = await db.select().from(savedCourses).where(eq(savedCourses.userId, userId));
  if (saved.length === 0) return [];
  const courseIds = saved.map((s) => s.courseId);
  return db.select().from(courses).where(inArray(courses.id, courseIds));
}

export async function saveCourse(userId: number, courseId: number) {
  const db = await getDb();
  if (!db) return;
  await db.insert(savedCourses).values({ userId, courseId }).onConflictDoNothing({
    target: [savedCourses.userId, savedCourses.courseId],
  });
}

export async function unsaveCourse(userId: number, courseId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(savedCourses).where(and(eq(savedCourses.userId, userId), eq(savedCourses.courseId, courseId)));
}

export async function getUserMembershipForCourse(userId: number, courseId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(courseMemberships)
    .where(and(eq(courseMemberships.userId, userId), eq(courseMemberships.courseId, courseId)))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function enrollUserInCourse(userId: number, courseId: number, membershipRole: "student" | "class_rep" | "lecturer" = "student") {
  const db = await getDb();
  if (!db) return;
  await db.insert(courseMemberships).values({ userId, courseId, membershipRole }).onConflictDoUpdate({
    target: [courseMemberships.courseId, courseMemberships.userId],
    set: { membershipRole },
  });
}

export async function unenrollUserFromCourse(userId: number, courseId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(courseMemberships).where(and(eq(courseMemberships.userId, userId), eq(courseMemberships.courseId, courseId)));
}

// ============================================================================
// COURSE ANNOUNCEMENTS QUERIES
// ============================================================================

export async function createCourseAnnouncement(data: {
  courseId: number;
  authorId: number;
  announcementType: "cancelled" | "room_changed" | "lecturer_late" | "rescheduled" | "materials_uploaded" | "general";
  title: string;
  body?: string;
  isOfficial: boolean;
}) {
  const db = await getDb();
  if (!db) return null;
  await db.insert(courseAnnouncements).values({
    ...data,
    status: data.isOfficial ? "approved" : "pending",
  });
  const result = await db
    .select()
    .from(courseAnnouncements)
    .where(eq(courseAnnouncements.authorId, data.authorId))
    .orderBy(sql`id DESC`)
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getAnnouncementsByCourse(courseId: number, includeAll = false) {
  const db = await getDb();
  if (!db) return [];
  if (includeAll) {
    return db.select().from(courseAnnouncements).where(eq(courseAnnouncements.courseId, courseId)).orderBy(sql`id DESC`);
  }
  return db
    .select()
    .from(courseAnnouncements)
    .where(and(eq(courseAnnouncements.courseId, courseId), eq(courseAnnouncements.status, "approved")))
    .orderBy(sql`id DESC`);
}

export async function getPendingAnnouncementsByCourse(courseId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(courseAnnouncements)
    .where(and(eq(courseAnnouncements.courseId, courseId), eq(courseAnnouncements.status, "pending")))
    .orderBy(sql`id DESC`);
}

export async function reviewAnnouncement(announcementId: number, reviewerId: number, status: "approved" | "rejected") {
  const db = await getDb();
  if (!db) return;
  await db
    .update(courseAnnouncements)
    .set({ status, reviewedBy: reviewerId, reviewedAt: new Date() })
    .where(eq(courseAnnouncements.id, announcementId));
}

export async function getClassRepCourses(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const memberships = await db
    .select()
    .from(courseMemberships)
    .where(and(eq(courseMemberships.userId, userId), eq(courseMemberships.membershipRole, "class_rep")));
  if (memberships.length === 0) return [];
  const courseIds = memberships.map((m) => m.courseId);
  return db.select().from(courses).where(inArray(courses.id, courseIds));
}

export async function getClassRepStats(userId: number) {
  const db = await getDb();
  if (!db) return { activeIssues: 0, pendingReports: 0, verifiedToday: 0 };
  const repCourses = await getClassRepCourses(userId);
  if (repCourses.length === 0) return { activeIssues: 0, pendingReports: 0, verifiedToday: 0 };
  const courseIds = repCourses.map((c) => c.id);
  const pendingClaims = await db
    .select()
    .from(classClaims)
    .where(and(inArray(classClaims.courseId, courseIds), eq(classClaims.status, "pending")));
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const verifiedToday = await db
    .select()
    .from(classClaims)
    .where(and(inArray(classClaims.courseId, courseIds), eq(classClaims.status, "verified"), gte(classClaims.resolvedAt, todayStart)));
  const pendingAnnouncements = await db
    .select()
    .from(courseAnnouncements)
    .where(and(inArray(courseAnnouncements.courseId, courseIds), eq(courseAnnouncements.status, "pending")));
  return {
    activeIssues: pendingClaims.length,
    pendingReports: pendingAnnouncements.length,
    verifiedToday: verifiedToday.length,
  };
}

export async function getCourseHealth(courseId: number) {
  const db = await getDb();
  if (!db) return { openIssues: 0, status: "stable" as const };
  const openClaims = await db
    .select()
    .from(classClaims)
    .where(and(eq(classClaims.courseId, courseId), eq(classClaims.status, "pending")));
  const openIssues = openClaims.length;
  const status = openIssues === 0 ? "stable" : openIssues <= 2 ? "minor" : "critical";
  return { openIssues, status };
}

export async function upsertCourse(data: {
  courseCode: string;
  courseName: string;
  description?: string;
  thumbnailUrl?: string;
  room?: string;
  lecturer?: string;
  department?: string;
  classSize: number;
}) {
  const db = await getDb();
  if (!db) return null;
  await db.insert(courses).values({ ...data, isActive: true }).onConflictDoUpdate({
    target: courses.courseCode,
    set: {
      courseName: data.courseName,
      description: data.description,
      thumbnailUrl: data.thumbnailUrl,
      room: data.room,
      lecturer: data.lecturer,
      department: data.department,
      classSize: data.classSize,
      isActive: true,
    },
  });
  const result = await db.select().from(courses).where(eq(courses.courseCode, data.courseCode)).limit(1);
  return result.length > 0 ? result[0] : null;
}
