import { TRPCError } from "@trpc/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { sdk } from "./_core/sdk";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";
import * as algo from "./algorithms";
import * as pf from "./pathfinding";
import { eventEmitter } from "./realtime";

// ============================================================================
// WALKING BODY ROUTER
// ============================================================================

const walkingRouter = router({
  // Update user's GPS location and availability
  updateAvailability: protectedProcedure
    .input(
      z.object({
        lat: z.number(),
        lng: z.number(),
        isAvailable: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const geohash = algo.getGeohash(input.lat, input.lng, 7);
      const geohash5 = algo.getGeohashPrefix(input.lat, input.lng, 5);

      await db.upsertWalkingAvailability(
        ctx.user.id,
        input.isAvailable,
        input.lat.toString(),
        input.lng.toString(),
        geohash,
        geohash5
      );

      eventEmitter.emit("event", {
        type: "walking.availability.updated",
        timestamp: Date.now(),
        data: {
          userId: ctx.user.id,
          isAvailable: input.isAvailable,
          lat: input.lat,
          lng: input.lng,
        },
      });

      return { success: true };
    }),

  // Request nearby walkers
  requestWalkers: protectedProcedure
    .input(
      z.object({
        radiusM: z.number().min(100).max(5000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const availability = await db.getWalkingAvailability(ctx.user.id);
      if (!availability) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User location not set",
        });
      }

      const lat = parseFloat(availability.lat.toString());
      const lng = parseFloat(availability.lng.toString());

      // Get geohash5 prefixes for ring expansion (precision 6)
      const prefixes = algo.getRing5Prefixes(lat, lng);

      // Query candidates
      let candidates = await db.getAvailableWalkersByGeohash5(prefixes);

      // Fallback to precision 5 if no candidates
      if (candidates.length === 0) {
        const prefixes5 = algo.getRing5PrefixesFallback(lat, lng);
        candidates = await db.getAvailableWalkersByGeohash5(prefixes5);
      }

      // Filter by distance and exclude requester
      const filtered = candidates
        .filter((c) => c.userId !== ctx.user.id)
        .filter((c) => {
          const cLat = parseFloat(c.lat.toString());
          const cLng = parseFloat(c.lng.toString());
          const distance = algo.haversineDistance(lat, lng, cLat, cLng);
          return distance <= input.radiusM;
        })
        .sort((a, b) => {
          const aLat = parseFloat(a.lat.toString());
          const aLng = parseFloat(a.lng.toString());
          const bLat = parseFloat(b.lat.toString());
          const bLng = parseFloat(b.lng.toString());
          const distA = algo.haversineDistance(lat, lng, aLat, aLng);
          const distB = algo.haversineDistance(lat, lng, bLat, bLng);
          return distA - distB;
        })
        .slice(0, 10); // Top 10 candidates

      // Create walking request
      const expiresAt = algo.getWalkingRequestExpirationTime();
      const request = await db.createWalkingRequest(
        ctx.user.id,
        lat.toString(),
        lng.toString(),
        availability.geohash,
        availability.geohash5,
        input.radiusM,
        expiresAt
      );

      if (!request) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create request",
        });
      }

      // Create matches for each candidate
      const matches = [];
      for (const candidate of filtered) {
        const match = await db.createWalkingMatch(request.id, candidate.userId);
        if (match) {
          matches.push(match);
        }
      }

      eventEmitter.emit("event", {
        type: "walking.request.created",
        timestamp: Date.now(),
        data: {
          requestId: request.id,
          requesterId: ctx.user.id,
          matchCount: matches.length,
        },
      });

      return {
        requestId: request.id,
        matchCount: matches.length,
      };
    }),

  // Respond to match request
  respondToMatch: protectedProcedure
    .input(
      z.object({
        matchId: z.number(),
        action: z.enum(["accept", "decline"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const match = await db.getWalkingMatch(input.matchId);
      if (!match) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Match not found",
        });
      }

      if (match.walkerId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized",
        });
      }

      const newStatus = input.action === "accept" ? "accepted" : "declined";
      await db.updateWalkingMatchStatus(input.matchId, newStatus);

      eventEmitter.emit("event", {
        type: "walking.match.updated",
        timestamp: Date.now(),
        data: {
          matchId: input.matchId,
          status: newStatus,
          walkerId: ctx.user.id,
        },
      });

      return { success: true };
    }),

  // Rate walking partner
  ratePartner: protectedProcedure
    .input(
      z.object({
        matchId: z.number(),
        stars: z.number().min(1).max(5),
        comment: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const match = await db.getWalkingMatch(input.matchId);
      if (!match) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Match not found",
        });
      }

      if (match.status !== "completed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Match not completed",
        });
      }

      const rateeId = match.walkerId === ctx.user.id ? match.requestId : match.walkerId;

      await db.createWalkingRating(
        input.matchId,
        ctx.user.id,
        rateeId,
        input.stars,
        input.comment
      );

      // Recalculate trust score
      const ratings = await db.getWalkingRatingsForUser(rateeId);
      const avgStars = ratings.reduce((sum, r) => sum + r.stars, 0) / ratings.length;
      const trustScore = algo.calculateTrustScoreSimple(avgStars, ratings.length);

      eventEmitter.emit("event", {
        type: "trust.walking.updated",
        timestamp: Date.now(),
        data: {
          userId: rateeId,
          trustScore,
          ratingCount: ratings.length,
        },
      });

      return { success: true, trustScore };
    }),

  // Get user's trust score
  getTrustScore: protectedProcedure.query(async ({ ctx }) => {
    const ratings = await db.getWalkingRatingsForUser(ctx.user.id);
    if (ratings.length === 0) {
      return { score: 0.5, ratingCount: 0, averageStars: 0 };
    }

    const avgStars = ratings.reduce((sum, r) => sum + r.stars, 0) / ratings.length;
    const score = algo.calculateTrustScoreSimple(avgStars, ratings.length);

    return {
      score,
      ratingCount: ratings.length,
      averageStars: avgStars,
    };
  }),
});

// ============================================================================
// CLASS CLAIMS ROUTER
// ============================================================================

const classRouter = router({
  // Create class claim
  createClaim: protectedProcedure
    .input(
      z.object({
        courseId: z.number(),
        claimType: z.enum(["cancelled", "room_change", "time_change", "late", "other"]),
        message: z.string().min(1).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const course = await db.getCourse(input.courseId);
      if (!course) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Course not found",
        });
      }

      const membership = await db.getCourseMembership(input.courseId, ctx.user.id);
      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not enrolled in course",
        });
      }

      const expiresAt = algo.getClaimExpirationTime();
      const claim = await db.createClassClaim(
        input.courseId,
        input.claimType,
        input.message,
        ctx.user.id,
        expiresAt
      );

      if (!claim) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create claim",
        });
      }

      eventEmitter.emit("event", {
        type: "class.claim.created",
        timestamp: Date.now(),
        data: {
          claimId: claim.id,
          courseId: input.courseId,
          claimType: input.claimType,
          createdBy: ctx.user.id,
        },
      });

      return { claimId: claim.id };
    }),

  // Vote on claim
  voteClaim: protectedProcedure
    .input(
      z.object({
        claimId: z.number(),
        vote: z.enum(["confirm", "deny"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const claim = await db.getClassClaim(input.claimId);
      if (!claim) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Claim not found",
        });
      }

      const membership = await db.getCourseMembership(claim.courseId, ctx.user.id);
      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not enrolled in course",
        });
      }

      const voteValue = input.vote === "confirm" ? 1 : -1;
      await db.createClassClaimVote(input.claimId, ctx.user.id, voteValue);

      // Get updated vote counts
      const votes = await db.getClassClaimVotes(input.claimId);
      const confirmCount = votes.filter((v) => v.vote > 0).length;
      const denyCount = votes.filter((v) => v.vote < 0).length;

      // Check if claim should be resolved
      const course = await db.getCourse(claim.courseId);
      if (!course) throw new TRPCError({ code: "NOT_FOUND" });

      const isRepClaim = membership.membershipRole === "class_rep";
      const requiredConfirms = algo.getRequiredConfirmations(course.classSize, isRepClaim);
      const rejectThreshold = algo.getRejectThreshold(course.classSize);
      const newStatus = algo.determineClaimStatus(
        confirmCount,
        denyCount,
        requiredConfirms,
        rejectThreshold
      );

      if (newStatus !== "pending") {
        await db.updateClassClaimStatus(input.claimId, newStatus);

        // Handle rep strikes if claim is rejected and created by rep
        if (newStatus === "rejected" && claim.createdBy !== ctx.user.id) {
          const creatorMembership = await db.getCourseMembership(claim.courseId, claim.createdBy);
          if (creatorMembership?.membershipRole === "class_rep") {
            const repStrike = await db.getOrCreateRepStrike(claim.createdBy, claim.courseId);
            if (repStrike) {
              const newStrikeCount = repStrike.strikeCount + 1;
              const bypassDisabledDays = algo.getBypassDisabledDuration(newStrikeCount);
              const bypassDisabledUntil = new Date();
              bypassDisabledUntil.setDate(bypassDisabledUntil.getDate() + bypassDisabledDays);

              const bypassRevoked = newStrikeCount >= 4;

              await db.updateRepStrike(
                claim.createdBy,
                claim.courseId,
                newStrikeCount,
                bypassDisabledUntil,
                bypassRevoked,
                0
              );

              eventEmitter.emit("event", {
                type: "class.rep.strike",
                timestamp: Date.now(),
                data: {
                  repId: claim.createdBy,
                  courseId: claim.courseId,
                  strikeCount: newStrikeCount,
                },
              });
            }
          }
        }

        eventEmitter.emit("event", {
          type: "class.claim.resolved",
          timestamp: Date.now(),
          data: {
            claimId: input.claimId,
            status: newStatus,
            confirmCount,
            denyCount,
          },
        });
      }

      eventEmitter.emit("event", {
        type: "class.claim.voted",
        timestamp: Date.now(),
        data: {
          claimId: input.claimId,
          voterId: ctx.user.id,
          vote: input.vote,
          confirmCount,
          denyCount,
        },
      });

      return { success: true, status: newStatus };
    }),

  // Get claims for course
  getClaimsByCourse: protectedProcedure
    .input(z.object({ courseId: z.number() }))
    .query(async ({ ctx, input }) => {
      const membership = await db.getCourseMembership(input.courseId, ctx.user.id);
      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not enrolled in course",
        });
      }

      const claims = await db.getClassClaimsByCourse(input.courseId);
      const claimsWithVotes = await Promise.all(
        claims.map(async (claim) => {
          const votes = await db.getClassClaimVotes(claim.id);
          const confirmCount = votes.filter((v) => v.vote > 0).length;
          const denyCount = votes.filter((v) => v.vote < 0).length;
          return {
            ...claim,
            confirmCount,
            denyCount,
            userVote: votes.find((v) => v.voterId === ctx.user.id)?.vote,
          };
        })
      );

      return claimsWithVotes;
    }),
});

// ============================================================================
// PATH REPORTS ROUTER
// ============================================================================

const reportsRouter = router({
  // Create caution report
  createReport: protectedProcedure
    .input(
      z.object({
        reportType: z.enum(["light_out", "broken_path", "flooding", "obstruction", "suspicious"]),
        severity: z.number().min(1).max(5),
        lat: z.number(),
        lng: z.number(),
        description: z.string().max(300).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const geohash = algo.getGeohash(input.lat, input.lng, 7);
      const geohash6 = algo.getGeohashPrefix(input.lat, input.lng, 6);

      // Initial TTL based on severity
      const ttlMinutes = input.severity >= 4 ? 60 : 30;

      const report = await db.createPathReport(
        input.reportType,
        input.severity,
        input.lat.toString(),
        input.lng.toString(),
        geohash,
        geohash6,
        ctx.user.id,
        ttlMinutes,
        input.description
      );

      if (!report) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create report",
        });
      }

      eventEmitter.emit("event", {
        type: "reports.created",
        timestamp: Date.now(),
        data: {
          reportId: report.id,
          reportType: input.reportType,
          severity: input.severity,
          lat: input.lat,
          lng: input.lng,
        },
      });

      return { reportId: report.id };
    }),

  // Vote on report
  voteReport: protectedProcedure
    .input(
      z.object({
        reportId: z.number(),
        vote: z.enum(["still_there", "not_there"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const report = await db.getPathReport(input.reportId);
      if (!report) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Report not found",
        });
      }

      const voteValue = input.vote === "still_there" ? 1 : -1;
      await db.createPathReportVote(input.reportId, ctx.user.id, voteValue);

      // Update reliability
      const reliability = await db.getOrCreatePathReportReliability(ctx.user.id);
      if (reliability) {
        const newTrueVotes = input.vote === "still_there" ? reliability.trueVotes + 1 : reliability.trueVotes;
        const newFalseVotes = input.vote === "not_there" ? reliability.falseVotes + 1 : reliability.falseVotes;
        await db.updatePathReportReliability(ctx.user.id, newTrueVotes, newFalseVotes);
      }

      // Update TTL based on vote and reporter reliability
      const votes = await db.getPathReportVotes(input.reportId);
      const ttlAdjustment = algo.getTTLAdjustment(report.severity, voteValue);
      const newTTL = Math.max(0, report.ttlMinutes + ttlAdjustment);
      await db.updatePathReportTTL(input.reportId, newTTL);

      eventEmitter.emit("event", {
        type: "reports.voted",
        timestamp: Date.now(),
        data: {
          reportId: input.reportId,
          voterId: ctx.user.id,
          vote: input.vote,
          newTTL,
        },
      });

      return { success: true, newTTL };
    }),

  // Get reports (with optional bbox filtering)
  getReports: protectedProcedure
    .input(
      z.object({
        bbox: z.object({ minLat: z.number(), minLng: z.number(), maxLat: z.number(), maxLng: z.number() }).optional(),
      })
    )
    .query(async ({ input }) => {
      // For simplicity, return all active reports
      // In production, implement proper bbox filtering
      const reports = await db.getActivePathReports();
      const reportsWithVotes = await Promise.all(
        reports.map(async (report) => {
          const votes = await db.getPathReportVotes(report.id);
          const stillThereCount = votes.filter((v) => v.vote > 0).length;
          const notThereCount = votes.filter((v) => v.vote < 0).length;
          return {
            ...report,
            stillThereCount,
            notThereCount,
          };
        })
      );
      return reportsWithVotes;
    }),
});

// ============================================================================
// CHECK-IN ROUTER
// ============================================================================

const checkinRouter = router({
  // Create check-in
  createCheckin: protectedProcedure
    .input(
      z.object({
        destLat: z.number(),
        destLng: z.number(),
        etaAt: z.date(),
        graceMinutes: z.number().min(1).max(120),
        emergencyContact: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const destGeohash = algo.getGeohash(input.destLat, input.destLng, 7);

      const checkin = await db.createCheckin(
        ctx.user.id,
        input.destLat.toString(),
        input.destLng.toString(),
        destGeohash,
        input.etaAt,
        input.graceMinutes,
        input.emergencyContact
      );

      if (!checkin) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create check-in",
        });
      }

      eventEmitter.emit("event", {
        type: "checkins.created",
        timestamp: Date.now(),
        data: {
          checkinId: checkin.id,
          userId: ctx.user.id,
          destLat: input.destLat,
          destLng: input.destLng,
          etaAt: input.etaAt,
        },
      });

      return { checkinId: checkin.id };
    }),

  // Complete check-in manually
  completeCheckin: protectedProcedure
    .input(z.object({ checkinId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const checkin = await db.getCheckin(input.checkinId);
      if (!checkin) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Check-in not found",
        });
      }

      if (checkin.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized",
        });
      }

      await db.updateCheckinStatus(input.checkinId, "completed", new Date());

      eventEmitter.emit("event", {
        type: "checkins.completed",
        timestamp: Date.now(),
        data: {
          checkinId: input.checkinId,
          userId: ctx.user.id,
        },
      });

      return { success: true };
    }),

  // Get active check-ins for user
  getActiveCheckins: protectedProcedure.query(async ({ ctx }) => {
    return db.getActiveCheckinsForUser(ctx.user.id);
  }),
});

// ============================================================================
// FOOTPATH ROUTER
// ============================================================================

const footpathRouter = router({
  // Create footpath
  createFootpath: protectedProcedure
    .input(
      z.object({
        name: z.string().optional(),
        geoJson: z.any(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const footpath = await db.createFootpath(input.name || null, input.geoJson, ctx.user.id);
      return { footpathId: footpath?.id };
    }),

  // Get all footpaths
  getFootpaths: publicProcedure.query(async () => {
    return db.getAllFootpaths();
  }),

  // Get all graph nodes (for map display and destination picker)
  getGraphNodes: publicProcedure.query(async () => {
    const rows = await db.getAllPathNodes();
    return rows.map(pf.toGraphNode);
  }),

  // Snap a lat/lng to the nearest graph node
  snapToNode: publicProcedure
    .input(z.object({ lat: z.number(), lng: z.number() }))
    .query(async ({ input }) => {
      const rows = await db.getAllPathNodes();
      const nodes = new Map<number, pf.GraphNode>();
      for (const row of rows) nodes.set(row.id, pf.toGraphNode(row));
      return pf.nearestNode(input.lat, input.lng, nodes);
    }),

  // Plan a route between two nodes
  planRoute: protectedProcedure
    .input(
      z.object({
        fromNodeId: z.number().int().positive(),
        toNodeId: z.number().int().positive(),
        mode: z.enum(["shortest", "scenic", "accessible", "safe_night"]),
        hourOfDay: z.number().int().min(0).max(23).optional(),
        isRainy: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const hourOfDay = input.hourOfDay ?? new Date().getHours();
      const isRainy = input.isRainy ?? false;
      const cached = await db.getCachedRoutePlan(input.fromNodeId, input.toNodeId, input.mode, hourOfDay);
      if (cached) return cached.result as pf.RouteResult;
      const [nodeRows, edgeRows] = await Promise.all([db.getAllPathNodes(), db.getAllPathEdges()]);
      const nodes = new Map<number, pf.GraphNode>();
      for (const row of nodeRows) nodes.set(row.id, pf.toGraphNode(row));
      const edges = edgeRows.map(pf.toGraphEdge);
      const result = pf.dijkstra({ fromNodeId: input.fromNodeId, toNodeId: input.toNodeId, mode: input.mode, hourOfDay, isRainy, nodes, edges });
      if (!result) throw new TRPCError({ code: "NOT_FOUND", message: "No path found between the selected locations for this route profile." });
      await db.cacheRoutePlan({ fromNodeId: input.fromNodeId, toNodeId: input.toNodeId, mode: input.mode, hourOfDay, result, distanceM: result.distanceM, walkTimeSec: result.walkTimeSec, safetyScore: result.safetyScore });
      return result;
    }),

  // Plan all four route profiles at once
  planAllRoutes: protectedProcedure
    .input(
      z.object({
        fromNodeId: z.number().int().positive(),
        toNodeId: z.number().int().positive(),
        hourOfDay: z.number().int().min(0).max(23).optional(),
        isRainy: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const hourOfDay = input.hourOfDay ?? new Date().getHours();
      const isRainy = input.isRainy ?? false;
      const [nodeRows, edgeRows] = await Promise.all([db.getAllPathNodes(), db.getAllPathEdges()]);
      const nodes = new Map<number, pf.GraphNode>();
      for (const row of nodeRows) nodes.set(row.id, pf.toGraphNode(row));
      const edges = edgeRows.map(pf.toGraphEdge);
      return pf.planAllRoutes(input.fromNodeId, input.toNodeId, hourOfDay, isRainy, nodes, edges);
    }),
});

// ============================================================================
// MAIN ROUTER
// ============================================================================

// ============================================================================
// CUSTOM AUTH ROUTER (local email/password)
// ============================================================================

const localAuthRouter = router({
  signup: publicProcedure
    .input(
      z.object({
        name: z.string().min(2).max(100),
        email: z.string().email(),
        studentId: z.string().min(3).max(32),
        password: z.string().min(8),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check for existing email
      const existingEmail = await db.getUserByEmail(input.email);
      if (existingEmail) {
        throw new TRPCError({ code: "CONFLICT", message: "Email already registered" });
      }
      // Check for existing student ID
      const existingStudentId = await db.getUserByStudentId(input.studentId);
      if (existingStudentId) {
        throw new TRPCError({ code: "CONFLICT", message: "Student ID already registered" });
      }
      const passwordHash = await bcrypt.hash(input.password, 12);
      const user = await db.createLocalUser({
        name: input.name,
        email: input.email,
        studentId: input.studentId,
        passwordHash,
      });
      if (!user) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create account" });
      }
      // Create session cookie using the same JWT mechanism
      const openId = `local:${input.email}`;
      const sessionToken = await sdk.createSessionToken(openId, { name: input.name, expiresInMs: ONE_YEAR_MS });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      return { success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
    }),

  login: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await db.getUserByEmail(input.email);
      if (!user || !user.passwordHash) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }
      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }
      // Update last signed in
      await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
      // Create session cookie
      const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name ?? "", expiresInMs: ONE_YEAR_MS });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      return { success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
    }),
});

// ============================================================================
// COURSES & CLASS REP ROUTER
// ============================================================================
const coursesRouter = router({
  getMyCourses: protectedProcedure.query(async ({ ctx }) => {
    return db.getCoursesByUser(ctx.user.id);
  }),
  getAllCourses: protectedProcedure.query(async () => {
    return db.getAllCourses();
  }),
  getCourse: protectedProcedure
    .input(z.object({ courseId: z.number() }))
    .query(async ({ input }) => {
      const course = await db.getCourseById(input.courseId);
      if (!course) throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      return course;
    }),
  getSavedCourses: protectedProcedure.query(async ({ ctx }) => {
    return db.getSavedCoursesByUser(ctx.user.id);
  }),
  saveCourse: protectedProcedure
    .input(z.object({ courseId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.saveCourse(ctx.user.id, input.courseId);
      return { success: true };
    }),
  unsaveCourse: protectedProcedure
    .input(z.object({ courseId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.unsaveCourse(ctx.user.id, input.courseId);
      return { success: true };
    }),
  enroll: protectedProcedure
    .input(z.object({ courseId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.enrollUserInCourse(ctx.user.id, input.courseId, "student");
      return { success: true };
    }),
  getAnnouncements: protectedProcedure
    .input(z.object({ courseId: z.number() }))
    .query(async ({ input }) => {
      return db.getAnnouncementsByCourse(input.courseId);
    }),
  getPendingAnnouncements: protectedProcedure
    .input(z.object({ courseId: z.number() }))
    .query(async ({ ctx, input }) => {
      const membership = await db.getUserMembershipForCourse(ctx.user.id, input.courseId);
      if (!membership || (membership.membershipRole !== "class_rep" && ctx.user.role !== "guild_admin")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Class rep access required" });
      }
      return db.getPendingAnnouncementsByCourse(input.courseId);
    }),
  postAnnouncement: protectedProcedure
    .input(
      z.object({
        courseId: z.number(),
        announcementType: z.enum(["cancelled", "room_changed", "lecturer_late", "rescheduled", "materials_uploaded", "general"]),
        title: z.string().min(3).max(200),
        body: z.string().max(1000).optional(),
        isOfficial: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.isOfficial) {
        const membership = await db.getUserMembershipForCourse(ctx.user.id, input.courseId);
        if (!membership || (membership.membershipRole !== "class_rep" && ctx.user.role !== "guild_admin")) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only class reps can post official announcements" });
        }
      }
      const announcement = await db.createCourseAnnouncement({
        courseId: input.courseId,
        authorId: ctx.user.id,
        announcementType: input.announcementType,
        title: input.title,
        body: input.body,
        isOfficial: input.isOfficial,
      });
      if (announcement) {
        eventEmitter.emit("announcement", { courseId: input.courseId, announcement });
      }
      return announcement;
    }),
  reviewAnnouncement: protectedProcedure
    .input(
      z.object({
        announcementId: z.number(),
        courseId: z.number(),
        status: z.enum(["approved", "rejected"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await db.getUserMembershipForCourse(ctx.user.id, input.courseId);
      if (!membership || (membership.membershipRole !== "class_rep" && ctx.user.role !== "guild_admin")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Class rep access required" });
      }
      await db.reviewAnnouncement(input.announcementId, ctx.user.id, input.status);
      return { success: true };
    }),
  getClassRepStats: protectedProcedure.query(async ({ ctx }) => {
    return db.getClassRepStats(ctx.user.id);
  }),
  getClassRepCourses: protectedProcedure.query(async ({ ctx }) => {
    return db.getClassRepCourses(ctx.user.id);
  }),
  getCourseHealth: protectedProcedure
    .input(z.object({ courseId: z.number() }))
    .query(async ({ input }) => {
      return db.getCourseHealth(input.courseId);
    }),
  // Alias for getCourse used by CourseDetailsPage
  getCourseById: protectedProcedure
    .input(z.object({ courseId: z.number() }))
    .query(async ({ ctx, input }) => {
      const course = await db.getCourseById(input.courseId);
      if (!course) throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      const membership = await db.getUserMembershipForCourse(ctx.user.id, input.courseId);
      return { ...course, membershipRole: membership?.membershipRole ?? null };
    }),
  // Alias for getAnnouncements used by CourseDetailsPage
  getCourseAnnouncements: protectedProcedure
    .input(z.object({ courseId: z.number() }))
    .query(async ({ input }) => {
      return db.getAnnouncementsByCourse(input.courseId);
    }),
  // Submit a quick report (student-facing, non-official)
  submitCourseReport: protectedProcedure
    .input(
      z.object({
        courseId: z.number(),
        announcementType: z.enum(["cancelled", "room_changed", "lecturer_late", "rescheduled", "materials_uploaded", "general"]),
        title: z.string().min(3).max(200),
        body: z.string().max(1000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const announcement = await db.createCourseAnnouncement({
        courseId: input.courseId,
        authorId: ctx.user.id,
        announcementType: input.announcementType,
        title: input.title,
        body: input.body,
        isOfficial: false,
      });
      return announcement;
    }),
  // Vote on an announcement (upvote/downvote)
  voteAnnouncement: protectedProcedure
    .input(
      z.object({
        announcementId: z.number(),
        direction: z.enum(["up", "down"]),
      })
    )
    .mutation(async ({ input }) => {
      const { courseAnnouncements } = await import("../drizzle/schema");
      const dbConn = await (await import("./db")).getDb();
      if (!dbConn) return { success: false };
      const { eq, sql } = await import("drizzle-orm");
      if (input.direction === "up") {
        await dbConn.update(courseAnnouncements)
          .set({ upvotes: sql`upvotes + 1` })
          .where(eq(courseAnnouncements.id, input.announcementId));
      } else {
        await dbConn.update(courseAnnouncements)
          .set({ downvotes: sql`downvotes + 1` })
          .where(eq(courseAnnouncements.id, input.announcementId));
      }
      return { success: true };
    }),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
    signup: localAuthRouter.signup,
    login: localAuthRouter.login,
  }),
  walking: walkingRouter,
  classes: classRouter,
  reports: reportsRouter,
  checkins: checkinRouter,
  footpaths: footpathRouter,
  courses: coursesRouter,
});

export type AppRouter = typeof appRouter;
