import { TRPCError } from "@trpc/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import {
  WALK_GROUP_DOWNVOTE_TRUST_DELTA,
  getWalkingRatingTrustDelta,
} from "@shared/trust";
import { getSessionCookieOptions } from "./_core/cookies";
import {
  createSupabaseDataClientForAccessToken,
  getBearerToken,
} from "./_core/supabaseAuth";
import {
  getSupabaseTrustProfilesByOpenIds,
  getSupabaseTrustSummaryForOpenId,
  getSupabaseTrustSummaryForUserId,
} from "./_core/supabaseTrust";
import { systemRouter } from "./_core/systemRouter";
import { sdk } from "./_core/sdk";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";
import * as algo from "./algorithms";
import * as pf from "./pathfinding";
import { eventEmitter } from "./realtime";
import {
  generateVerificationCode,
  codeExpiry,
  sendVerificationEmail,
} from "./emailVerification";

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
        .filter(c => c.userId !== ctx.user.id)
        .filter(c => {
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

      const request = await db.getWalkingRequest(match.requestId);
      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Match request not found",
        });
      }

      const isRequester = request.requesterId === ctx.user.id;
      const isWalker = match.walkerId === ctx.user.id;
      if (!isRequester && !isWalker) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You were not part of this walk",
        });
      }

      const rateeId = isWalker ? request.requesterId : match.walkerId;

      await db.createWalkingRating(
        input.matchId,
        ctx.user.id,
        rateeId,
        input.stars,
        input.comment
      );

      await db.applyTrustScoreChange(
        rateeId,
        getWalkingRatingTrustDelta(input.stars),
        "manual_adjustment"
      );
      const trustSummary = await db.getUserTrustSummary(rateeId);

      eventEmitter.emit("event", {
        type: "trust.score.updated",
        timestamp: Date.now(),
        data: {
          userId: rateeId,
          trustScore: trustSummary.score,
          ratingCount: trustSummary.ratingCount,
          source: "walking_rating",
        },
      });

      return { success: true, trustScore: trustSummary.scoreRatio };
    }),

  // Get user's trust score
  getTrustScore: protectedProcedure.query(async ({ ctx }) => {
    const summary = await db.getUserTrustSummary(ctx.user.id);

    return {
      score: summary.scoreRatio,
      scorePercent: summary.score,
      tierKey: summary.tierKey,
      tierLabel: summary.tierLabel,
      ratingCount: summary.ratingCount,
      averageStars: summary.averageStars,
    };
  }),
});

// ============================================================================
// TRUST SCORE ROUTER
// ============================================================================

const trustRouter = router({
  getMySummary: protectedProcedure.query(async ({ ctx }) => {
    const sqlDb = await db.getDb();
    if (!sqlDb) {
      const accessToken = getBearerToken(ctx.req.headers.authorization);
      if (!accessToken) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Missing Supabase access token.",
        });
      }

      return getSupabaseTrustSummaryForOpenId(accessToken, ctx.user.openId);
    }

    return db.getUserTrustSummary(ctx.user.id);
  }),

  getProfilesByOpenIds: protectedProcedure
    .input(
      z.object({
        openIds: z.array(z.string().min(1)).max(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const sqlDb = await db.getDb();
      if (!sqlDb) {
        const accessToken = getBearerToken(ctx.req.headers.authorization);
        if (!accessToken) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Missing Supabase access token.",
          });
        }

        return getSupabaseTrustProfilesByOpenIds(accessToken, input.openIds);
      }

      return db.getTrustProfilesByOpenIds(input.openIds);
    }),

  downvoteWalkGroupMember: protectedProcedure
    .input(
      z.object({
        walkGroupId: z.string().uuid(),
        targetUserId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const accessToken = getBearerToken(ctx.req.headers.authorization);
      if (!accessToken) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Missing Supabase access token.",
        });
      }

      const supabase = createSupabaseDataClientForAccessToken(accessToken);
      const { data, error } = await supabase.rpc("downvote_walk_group_member", {
        walk_group_id_input: input.walkGroupId,
        target_user_id_input: input.targetUserId,
      });

      if (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error.message,
        });
      }

      const targetOpenId = `supabase:${input.targetUserId}`;
      const sqlDb = await db.getDb();

      let summary:
        | Awaited<ReturnType<typeof db.getUserTrustSummary>>
        | Awaited<ReturnType<typeof getSupabaseTrustSummaryForUserId>>;
      let emittedUserId: number | string = targetOpenId;

      if (sqlDb) {
        const targetUser = await db.getUserByOpenId(targetOpenId);
        if (!targetUser) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Target user profile is not synced yet.",
          });
        }

        await db.applyTrustScoreChange(
          targetUser.id,
          WALK_GROUP_DOWNVOTE_TRUST_DELTA,
          "manual_adjustment"
        );
        summary = await db.getUserTrustSummary(targetUser.id);
        emittedUserId = targetUser.id;
      } else {
        summary = await getSupabaseTrustSummaryForUserId(
          accessToken,
          input.targetUserId
        );
        emittedUserId = input.targetUserId;
      }

      eventEmitter.emit("event", {
        type: "trust.score.updated",
        timestamp: Date.now(),
        data: {
          userId: emittedUserId,
          targetOpenId,
          trustScore: summary.score,
          source: "walk_group_downvote",
          walkGroupId: input.walkGroupId,
        },
      });

      return {
        downvoteCount: typeof data === "number" ? data : null,
        summary,
        targetOpenId,
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
        claimType: z.enum([
          "cancelled",
          "room_change",
          "time_change",
          "late",
          "other",
        ]),
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

      const membership = await db.getCourseMembership(
        input.courseId,
        ctx.user.id
      );
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

      const membership = await db.getCourseMembership(
        claim.courseId,
        ctx.user.id
      );
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
      const confirmCount = votes.filter(v => v.vote > 0).length;
      const denyCount = votes.filter(v => v.vote < 0).length;

      // Check if claim should be resolved
      const course = await db.getCourse(claim.courseId);
      if (!course) throw new TRPCError({ code: "NOT_FOUND" });

      const isRepClaim = membership.membershipRole === "class_rep";
      const requiredConfirms = algo.getRequiredConfirmations(
        course.classSize,
        isRepClaim
      );
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
          const creatorMembership = await db.getCourseMembership(
            claim.courseId,
            claim.createdBy
          );
          if (creatorMembership?.membershipRole === "class_rep") {
            const repStrike = await db.getOrCreateRepStrike(
              claim.createdBy,
              claim.courseId
            );
            if (repStrike) {
              const newStrikeCount = repStrike.strikeCount + 1;
              const bypassDisabledDays =
                algo.getBypassDisabledDuration(newStrikeCount);
              const bypassDisabledUntil = new Date();
              bypassDisabledUntil.setDate(
                bypassDisabledUntil.getDate() + bypassDisabledDays
              );

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
      const membership = await db.getCourseMembership(
        input.courseId,
        ctx.user.id
      );
      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not enrolled in course",
        });
      }

      const claims = await db.getClassClaimsByCourse(input.courseId);
      const claimsWithVotes = await Promise.all(
        claims.map(async claim => {
          const votes = await db.getClassClaimVotes(claim.id);
          const confirmCount = votes.filter(v => v.vote > 0).length;
          const denyCount = votes.filter(v => v.vote < 0).length;
          return {
            ...claim,
            confirmCount,
            denyCount,
            userVote: votes.find(v => v.voterId === ctx.user.id)?.vote,
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
        reportType: z.enum([
          "light_out",
          "broken_path",
          "flooding",
          "obstruction",
          "suspicious",
        ]),
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
      const reliability = await db.getOrCreatePathReportReliability(
        ctx.user.id
      );
      if (reliability) {
        const newTrueVotes =
          input.vote === "still_there"
            ? reliability.trueVotes + 1
            : reliability.trueVotes;
        const newFalseVotes =
          input.vote === "not_there"
            ? reliability.falseVotes + 1
            : reliability.falseVotes;
        await db.updatePathReportReliability(
          ctx.user.id,
          newTrueVotes,
          newFalseVotes
        );
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
        bbox: z
          .object({
            minLat: z.number(),
            minLng: z.number(),
            maxLat: z.number(),
            maxLng: z.number(),
          })
          .optional(),
      })
    )
    .query(async ({ input }) => {
      // For simplicity, return all active reports
      // In production, implement proper bbox filtering
      const reports = await db.getActivePathReports();
      const reportsWithVotes = await Promise.all(
        reports.map(async report => {
          const votes = await db.getPathReportVotes(report.id);
          const stillThereCount = votes.filter(v => v.vote > 0).length;
          const notThereCount = votes.filter(v => v.vote < 0).length;
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
      const footpath = await db.createFootpath(
        input.name || null,
        input.geoJson,
        ctx.user.id
      );
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
      const cached = await db.getCachedRoutePlan(
        input.fromNodeId,
        input.toNodeId,
        input.mode,
        hourOfDay
      );
      if (cached) return cached.result as pf.RouteResult;
      const [nodeRows, edgeRows, crowdReportRows] = await Promise.all([
        db.getAllPathNodes(),
        db.getAllPathEdges(),
        db.getActivePathReports(),
      ]);
      const nodes = new Map<number, pf.GraphNode>();
      for (const row of nodeRows) nodes.set(row.id, pf.toGraphNode(row));
      const edges = edgeRows.map(pf.toGraphEdge);
      const crowdReports = crowdReportRows.map(r => ({
        id: r.id,
        lat: parseFloat(r.lat as unknown as string),
        lng: parseFloat(r.lng as unknown as string),
        reportType: r.reportType as pf.CrowdReport["reportType"],
        status: r.status,
        geohash6: r.geohash6,
      }));
      const result = pf.dijkstra({
        fromNodeId: input.fromNodeId,
        toNodeId: input.toNodeId,
        mode: input.mode,
        hourOfDay,
        isRainy,
        nodes,
        edges,
        crowdReports,
      });
      if (!result)
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "No path found between the selected locations for this route profile.",
        });
      await db.cacheRoutePlan({
        fromNodeId: input.fromNodeId,
        toNodeId: input.toNodeId,
        mode: input.mode,
        hourOfDay,
        result,
        distanceM: result.distanceM,
        walkTimeSec: result.walkTimeSec,
        safetyScore: result.safetyScore,
      });
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
      const [nodeRows, edgeRows, crowdReportRows] = await Promise.all([
        db.getAllPathNodes(),
        db.getAllPathEdges(),
        db.getActivePathReports(),
      ]);
      const nodes = new Map<number, pf.GraphNode>();
      for (const row of nodeRows) nodes.set(row.id, pf.toGraphNode(row));
      const edges = edgeRows.map(pf.toGraphEdge);
      const crowdReports = crowdReportRows.map(r => ({
        id: r.id,
        lat: parseFloat(r.lat as unknown as string),
        lng: parseFloat(r.lng as unknown as string),
        reportType: r.reportType as pf.CrowdReport["reportType"],
        status: r.status,
        geohash6: r.geohash6,
      }));
      return pf.planAllRoutes(
        input.fromNodeId,
        input.toNodeId,
        hourOfDay,
        isRainy,
        nodes,
        edges,
        crowdReports
      );
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
        password: z.string().min(8),
      })
    )
    .mutation(async ({ input }) => {
      const existingEmail = await db.getUserByEmail(input.email);
      if (existingEmail) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Email already registered",
        });
      }
      const passwordHash = await bcrypt.hash(input.password, 12);
      const code = generateVerificationCode();
      const expiry = codeExpiry();
      const user = await db.createLocalUser({
        name: input.name,
        email: input.email,
        passwordHash,
        verificationCode: code,
        verificationExpiry: expiry,
      });
      if (!user) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create account",
        });
      }
      await db.enrollUserInAllActiveCourses(user.id, "student");
      await sendVerificationEmail(input.email, input.name, code).catch(err =>
        console.error("[signup] email send failed:", err)
      );
      return { success: true, userId: user.id, email: input.email };
    }),

  sendVerificationCode: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      const user = await db.getUserByEmail(input.email);
      if (!user)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account not found",
        });
      if (user.emailVerified) return { success: true, alreadyVerified: true };
      const code = generateVerificationCode();
      const expiry = codeExpiry();
      await db.setVerificationCode(user.id, code, expiry);
      await sendVerificationEmail(
        input.email,
        user.name ?? "Student",
        code
      ).catch(err =>
        console.error("[sendVerificationCode] email send failed:", err)
      );
      return { success: true, alreadyVerified: false };
    }),

  verifyEmail: publicProcedure
    .input(z.object({ email: z.string().email(), code: z.string().length(6) }))
    .mutation(async ({ ctx, input }) => {
      const user = await db.getUserByEmail(input.email);
      if (!user)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Account not found",
        });
      if (user.emailVerified) {
        const sessionToken = await sdk.createSessionToken(user.openId, {
          name: user.name ?? "",
          expiresInMs: ONE_YEAR_MS,
        });
        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...getSessionCookieOptions(ctx.req),
          maxAge: ONE_YEAR_MS,
        });
        return { success: true };
      }
      if (!user.verificationCode || user.verificationCode !== input.code) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid verification code",
        });
      }
      if (!user.verificationExpiry || new Date() > user.verificationExpiry) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Verification code has expired. Request a new one.",
        });
      }
      await db.verifyUserEmail(user.id);
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name ?? "",
        expiresInMs: ONE_YEAR_MS,
      });
      ctx.res.cookie(COOKIE_NAME, sessionToken, {
        ...getSessionCookieOptions(ctx.req),
        maxAge: ONE_YEAR_MS,
      });
      return { success: true };
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
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password",
        });
      }
      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password",
        });
      }
      // Update last signed in
      await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
      // Create session cookie
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name ?? "",
        expiresInMs: ONE_YEAR_MS,
      });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });
      return {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      };
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
      if (!course)
        throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
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
      const membership = await db.getUserMembershipForCourse(
        ctx.user.id,
        input.courseId
      );
      if (
        !membership ||
        (membership.membershipRole !== "class_rep" &&
          ctx.user.role !== "guild_admin")
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Class rep access required",
        });
      }
      return db.getPendingAnnouncementsByCourse(input.courseId);
    }),
  postAnnouncement: protectedProcedure
    .input(
      z.object({
        courseId: z.number(),
        announcementType: z.enum([
          "cancelled",
          "room_changed",
          "lecturer_late",
          "rescheduled",
          "materials_uploaded",
          "general",
        ]),
        title: z.string().min(3).max(200),
        body: z.string().max(1000).optional(),
        isOfficial: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.isOfficial) {
        const membership = await db.getUserMembershipForCourse(
          ctx.user.id,
          input.courseId
        );
        if (
          !membership ||
          (membership.membershipRole !== "class_rep" &&
            ctx.user.role !== "guild_admin")
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only class reps can post official announcements",
          });
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
        eventEmitter.emit("announcement", {
          courseId: input.courseId,
          announcement,
        });
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
      const membership = await db.getUserMembershipForCourse(
        ctx.user.id,
        input.courseId
      );
      if (
        !membership ||
        (membership.membershipRole !== "class_rep" &&
          ctx.user.role !== "guild_admin")
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Class rep access required",
        });
      }
      await db.reviewAnnouncement(
        input.announcementId,
        ctx.user.id,
        input.status
      );
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
      if (!course)
        throw new TRPCError({ code: "NOT_FOUND", message: "Course not found" });
      const membership = await db.getUserMembershipForCourse(
        ctx.user.id,
        input.courseId
      );
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
        announcementType: z.enum([
          "cancelled",
          "room_changed",
          "lecturer_late",
          "rescheduled",
          "materials_uploaded",
          "general",
        ]),
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
        await dbConn
          .update(courseAnnouncements)
          .set({ upvotes: sql`upvotes + 1` })
          .where(eq(courseAnnouncements.id, input.announcementId));
      } else {
        await dbConn
          .update(courseAnnouncements)
          .set({ downvotes: sql`downvotes + 1` })
          .where(eq(courseAnnouncements.id, input.announcementId));
      }
      return { success: true };
    }),
});

// ============================================================================
// TIMETABLE ROUTER
// ============================================================================

const timetableRouter = router({
  // Get course sessions for a specific course
  getCourseSessions: protectedProcedure
    .input(z.object({ courseId: z.number() }))
    .query(async ({ ctx, input }) => {
      const membership = await db.getCourseMembership(
        input.courseId,
        ctx.user.id
      );
      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not enrolled in course",
        });
      }
      return db.getCourseSessionsByCourse(input.courseId);
    }),

  // Get user's full timetable (all enrolled courses' sessions + overrides for today)
  getMyTimetable: protectedProcedure.query(async ({ ctx }) => {
    const sessions = await db.getCourseSessionsByUser(ctx.user.id);
    const today = new Date().toISOString().split("T")[0];
    // Attach overrides for today
    const sessionsWithOverrides = await Promise.all(
      sessions.map(async session => {
        const overrides = await db.getSessionOverridesByDate(session.id, today);
        const activeOverride =
          overrides.length > 0 ? overrides[overrides.length - 1] : null;
        return { ...session, override: activeOverride };
      })
    );
    return sessionsWithOverrides;
  }),

  // Create a course session (class rep / lecturer / admin only)
  createCourseSession: protectedProcedure
    .input(
      z.object({
        courseId: z.number(),
        sessionType: z
          .enum(["lecture", "tutorial", "lab", "seminar", "other"])
          .optional(),
        dayOfWeek: z.enum([
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
          "sunday",
        ]),
        startTime: z.string(),
        endTime: z.string(),
        roomCode: z.string().optional(),
        lecturerId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const membership = await db.getUserMembershipForCourse(
        ctx.user.id,
        input.courseId
      );
      if (
        !membership ||
        (membership.membershipRole !== "class_rep" &&
          membership.membershipRole !== "lecturer" &&
          ctx.user.role !== "guild_admin")
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Class rep or lecturer access required",
        });
      }
      const session = await db.createCourseSession(input);
      return session;
    }),
});

// ============================================================================
// CLASS REPORTS ROUTER
// ============================================================================

const classReportsRouter = router({
  // Submit a class report
  submitReport: protectedProcedure
    .input(
      z.object({
        courseId: z.number(),
        courseSessionId: z.number().optional(),
        reportType: z.enum([
          "class_cancelled",
          "lecturer_late",
          "room_changed",
          "time_changed",
          "class_confirmed",
          "other",
        ]),
        title: z.string().min(3).max(255),
        description: z.string().max(1000).optional(),
        originalRoom: z.string().max(64).optional(),
        newRoom: z.string().max(64).optional(),
        originalStartTime: z.string().optional(),
        newStartTime: z.string().optional(),
        originalEndTime: z.string().optional(),
        newEndTime: z.string().optional(),
        reportDate: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Check course membership
      const isMember = await db.isUserRegisteredForCourse(
        ctx.user.id,
        input.courseId
      );
      if (!isMember) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not enrolled in course",
        });
      }

      // Check suspension
      const isSuspended = await db.isUserSuspendedFromReporting(ctx.user.id);
      if (isSuspended) {
        const status = await db.getUserSuspensionStatus(ctx.user.id);
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `You are temporarily suspended from submitting class reports. Suspension ends at ${status.suspendedUntil?.toISOString() ?? "unknown"}.`,
        });
      }

      // Calculate thresholds
      const { required, rejection } = await db.getRequiredThresholdForReport(
        input.courseId,
        ctx.user.id
      );
      const reportDate =
        input.reportDate ?? new Date().toISOString().split("T")[0];
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const report = await db.createClassReport({
        courseId: input.courseId,
        courseSessionId: input.courseSessionId,
        reporterUserId: ctx.user.id,
        reportType: input.reportType,
        title: input.title,
        description: input.description,
        originalRoom: input.originalRoom,
        newRoom: input.newRoom,
        originalStartTime: input.originalStartTime,
        newStartTime: input.newStartTime,
        originalEndTime: input.originalEndTime,
        newEndTime: input.newEndTime,
        reportDate,
        requiredThreshold: required,
        rejectionThreshold: rejection,
        expiresAt,
      });

      if (!report) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create report",
        });
      }

      // If lecturer/admin, auto-verify immediately
      if (required === 0) {
        await db.updateClassReportStatus(report.id, "verified");
        await handleReportVerified(report.id, input.courseId, ctx.user.id);
      }

      eventEmitter.emit("event", {
        type: "class_report.created",
        timestamp: Date.now(),
        data: {
          reportId: report.id,
          courseId: input.courseId,
          reportType: input.reportType,
        },
      });

      return {
        reportId: report.id,
        status: required === 0 ? "verified" : "pending",
      };
    }),

  // Get reports for a course
  getReportsByCourse: protectedProcedure
    .input(
      z.object({ courseId: z.number(), includeAll: z.boolean().optional() })
    )
    .query(async ({ ctx, input }) => {
      const isMember = await db.isUserRegisteredForCourse(
        ctx.user.id,
        input.courseId
      );
      if (!isMember) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not enrolled in course",
        });
      }
      const reports = await db.getClassReportsByCourse(
        input.courseId,
        input.includeAll ?? false
      );
      return Promise.all(
        reports.map(async r => {
          const votes = await db.getClassReportVotes(r.id);
          const userVote = await db.getUserVoteOnReport(r.id, ctx.user.id);
          return {
            ...r,
            voteCount: votes.length,
            userVote: userVote?.voteType ?? null,
          };
        })
      );
    }),

  // Get a single report
  getReport: protectedProcedure
    .input(z.object({ reportId: z.number() }))
    .query(async ({ ctx, input }) => {
      const report = await db.getClassReport(input.reportId);
      if (!report)
        throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
      const isMember = await db.isUserRegisteredForCourse(
        ctx.user.id,
        report.courseId
      );
      if (!isMember)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not enrolled in course",
        });
      const votes = await db.getClassReportVotes(input.reportId);
      const userVote = await db.getUserVoteOnReport(
        input.reportId,
        ctx.user.id
      );
      return { ...report, votes, userVote: userVote?.voteType ?? null };
    }),

  // Vote on a class report
  voteOnReport: protectedProcedure
    .input(
      z.object({
        reportId: z.number(),
        voteType: z.enum(["upvote", "downvote"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const report = await db.getClassReport(input.reportId);
      if (!report)
        throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
      if (report.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Report is no longer pending",
        });
      }

      const isMember = await db.isUserRegisteredForCourse(
        ctx.user.id,
        report.courseId
      );
      if (!isMember)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not enrolled in course",
        });

      // Get vote weight based on role
      const voteWeight = await db.getVoteWeightForUser(
        ctx.user.id,
        report.courseId
      );
      await db.createOrUpdateClassReportVote(
        input.reportId,
        ctx.user.id,
        input.voteType,
        voteWeight
      );

      // Recalculate verification score
      const allVotes = await db.getClassReportVotes(input.reportId);
      const verificationScore = allVotes.reduce((sum, v) => {
        return sum + (v.voteType === "upvote" ? v.voteWeight : -v.voteWeight);
      }, 0);
      await db.updateClassReportScore(input.reportId, verificationScore);

      // Check if report should be verified or rejected
      let newStatus: "pending" | "verified" | "rejected" = "pending";
      if (verificationScore >= report.requiredThreshold) newStatus = "verified";
      else if (verificationScore <= report.rejectionThreshold)
        newStatus = "rejected";

      if (newStatus !== "pending") {
        await db.updateClassReportStatus(input.reportId, newStatus);

        if (newStatus === "verified") {
          await handleReportVerified(
            input.reportId,
            report.courseId,
            report.reporterUserId
          );
        } else if (newStatus === "rejected") {
          await handleReportRejected(
            input.reportId,
            report.courseId,
            report.reporterUserId,
            allVotes
          );
        }

        eventEmitter.emit("event", {
          type: "class_report.resolved",
          timestamp: Date.now(),
          data: {
            reportId: input.reportId,
            status: newStatus,
            verificationScore,
          },
        });
      }

      return { success: true, verificationScore, status: newStatus };
    }),

  // Get user's trust score and history
  getMyTrustScore: protectedProcedure.query(async ({ ctx }) => {
    const score = await db.getUserTrustScore(ctx.user.id);
    const history = await db.getTrustScoreHistory(ctx.user.id);
    return { trustScore: score, history };
  }),

  // Get user's suspension status
  getMySuspensionStatus: protectedProcedure.query(async ({ ctx }) => {
    const status = await db.getUserSuspensionStatus(ctx.user.id);
    const isSuspended = await db.isUserSuspendedFromReporting(ctx.user.id);
    return { ...status, isSuspended };
  }),
});

// ============================================================================
// CLASS CHAT ROUTER
// ============================================================================

const classChatRouter = router({
  // Get class chat (active reports + comments) for a course
  getCourseChat: protectedProcedure
    .input(z.object({ courseId: z.number() }))
    .query(async ({ ctx, input }) => {
      const isMember = await db.isUserRegisteredForCourse(
        ctx.user.id,
        input.courseId
      );
      if (!isMember)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not enrolled in course",
        });

      const reports = await db.getClassReportsByCourse(input.courseId, true);
      const reportsWithDetails = await Promise.all(
        reports.map(async r => {
          const votes = await db.getClassReportVotes(r.id);
          const comments = await db.getClassReportComments(r.id);
          const userVote = await db.getUserVoteOnReport(r.id, ctx.user.id);
          const verificationScore = votes.reduce(
            (sum, v) =>
              sum + (v.voteType === "upvote" ? v.voteWeight : -v.voteWeight),
            0
          );
          return {
            ...r,
            verificationScore,
            votes,
            comments,
            userVote: userVote?.voteType ?? null,
          };
        })
      );
      return reportsWithDetails;
    }),

  // Add a comment to a report
  addComment: protectedProcedure
    .input(
      z.object({
        reportId: z.number(),
        message: z.string().min(1).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const report = await db.getClassReport(input.reportId);
      if (!report)
        throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
      const isMember = await db.isUserRegisteredForCourse(
        ctx.user.id,
        report.courseId
      );
      if (!isMember)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not enrolled in course",
        });
      const comment = await db.createClassReportComment(
        input.reportId,
        ctx.user.id,
        input.message
      );
      return comment;
    }),

  // Get comments for a report
  getComments: protectedProcedure
    .input(z.object({ reportId: z.number() }))
    .query(async ({ ctx, input }) => {
      const report = await db.getClassReport(input.reportId);
      if (!report)
        throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
      const isMember = await db.isUserRegisteredForCourse(
        ctx.user.id,
        report.courseId
      );
      if (!isMember)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not enrolled in course",
        });
      return db.getClassReportComments(input.reportId);
    }),

  // Delete own comment
  deleteComment: protectedProcedure
    .input(z.object({ commentId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.deleteClassReportComment(input.commentId, ctx.user.id);
      return { success: true };
    }),
});

// ============================================================================
// PUSH NOTIFICATIONS ROUTER
// ============================================================================

const pushRouter = router({
  // Subscribe to push notifications
  subscribe: protectedProcedure
    .input(
      z.object({
        endpoint: z.string().url(),
        p256dhKey: z.string(),
        authKey: z.string(),
        userAgent: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await db.upsertPushSubscription({
        userId: ctx.user.id,
        endpoint: input.endpoint,
        p256dhKey: input.p256dhKey,
        authKey: input.authKey,
        userAgent: input.userAgent,
      });
      return { success: true };
    }),

  // Unsubscribe from push notifications
  unsubscribe: protectedProcedure
    .input(z.object({ endpoint: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db.deletePushSubscription(ctx.user.id, input.endpoint);
      return { success: true };
    }),

  // Get user's notifications
  getNotifications: protectedProcedure.query(async ({ ctx }) => {
    return db.getUserNotifications(ctx.user.id);
  }),

  // Mark notification as read
  markRead: protectedProcedure
    .input(z.object({ notificationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.markNotificationRead(input.notificationId, ctx.user.id);
      return { success: true };
    }),
});

// ============================================================================
// HELPER FUNCTIONS FOR REPORT LIFECYCLE
// ============================================================================

/**
 * Called when a class report is verified.
 * - Creates calendar override
 * - Updates trust scores
 * - Creates notifications for all course members
 */
async function handleReportVerified(
  reportId: number,
  courseId: number,
  reporterUserId: number
) {
  try {
    const report = await db.getClassReport(reportId);
    if (!report) return;

    // 1. Create calendar override if session is linked
    if (report.courseSessionId) {
      const overrideTypeMap: Record<
        string,
        | "cancelled"
        | "room_changed"
        | "time_changed"
        | "lecturer_late"
        | "class_confirmed"
      > = {
        class_cancelled: "cancelled",
        room_changed: "room_changed",
        time_changed: "time_changed",
        lecturer_late: "lecturer_late",
        class_confirmed: "class_confirmed",
        other: "class_confirmed",
      };
      const overrideType =
        overrideTypeMap[report.reportType] ?? "class_confirmed";
      await db.createSessionOverride({
        courseSessionId: report.courseSessionId,
        classReportId: reportId,
        overrideDate: report.reportDate,
        overrideType,
        originalRoom: report.originalRoom ?? undefined,
        newRoom: report.newRoom ?? undefined,
        originalStartTime: report.originalStartTime ?? undefined,
        newStartTime: report.newStartTime ?? undefined,
        originalEndTime: report.originalEndTime ?? undefined,
        newEndTime: report.newEndTime ?? undefined,
        isCancelled: report.reportType === "class_cancelled",
      });
    }

    // 2. Update reporter trust score (+2)
    await db.applyTrustScoreChange(
      reporterUserId,
      2,
      "verified_report",
      reportId
    );

    // 3. Reward correct upvoters (+1), penalise downvoters (-1)
    const votes = await db.getClassReportVotes(reportId);
    for (const vote of votes) {
      if (vote.userId === reporterUserId) continue;
      if (vote.voteType === "upvote") {
        await db.applyTrustScoreChange(
          vote.userId,
          1,
          "correct_vote",
          reportId
        );
      } else {
        await db.applyTrustScoreChange(
          vote.userId,
          -1,
          "incorrect_vote",
          reportId
        );
      }
    }

    // 4. Build notification content
    const course = await db.getCourse(courseId);
    const courseCode = course?.courseCode ?? "Course";
    const notifTitle = buildNotificationTitle(report.reportType, courseCode);
    const notifMessage = buildNotificationMessage(report);

    // 5. Create in-app notifications for all course members
    await db.createCourseNotificationsForVerifiedReport(
      courseId,
      reportId,
      notifTitle,
      notifMessage,
      report.reportType
    );

    eventEmitter.emit("event", {
      type: "class_report.verified",
      timestamp: Date.now(),
      data: { reportId, courseId, reportType: report.reportType },
    });
  } catch (err) {
    console.error("[handleReportVerified] Error:", err);
  }
}

/**
 * Called when a class report is rejected.
 * - Penalises reporter trust score (-5)
 * - Rewards correct downvoters (+1)
 * - Checks if suspension threshold is reached
 */
async function handleReportRejected(
  reportId: number,
  courseId: number,
  reporterUserId: number,
  votes: Array<{ userId: number; voteType: string }>
) {
  try {
    // 1. Penalise reporter (-5)
    await db.applyTrustScoreChange(
      reporterUserId,
      -5,
      "rejected_report",
      reportId
    );

    // 2. Reward correct downvoters (+1), penalise upvoters (-1)
    for (const vote of votes) {
      if (vote.userId === reporterUserId) continue;
      if (vote.voteType === "downvote") {
        await db.applyTrustScoreChange(
          vote.userId,
          1,
          "correct_vote",
          reportId
        );
      } else {
        await db.applyTrustScoreChange(
          vote.userId,
          -1,
          "incorrect_vote",
          reportId
        );
      }
    }

    // 3. Check suspension threshold (3 rejected reports in 7 days)
    const rejectedCount = await db.countRejectedReportsInWindow(
      reporterUserId,
      7
    );
    if (rejectedCount >= 3) {
      const isSuspended = await db.isUserSuspendedFromReporting(reporterUserId);
      if (!isSuspended) {
        // First offense: 24 hours
        const suspendedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await db.applyReportingSuspension(reporterUserId, suspendedUntil);
        eventEmitter.emit("event", {
          type: "user.suspended",
          timestamp: Date.now(),
          data: {
            userId: reporterUserId,
            suspendedUntil,
            reason: "repeated_false_reports",
          },
        });
      }
    }
  } catch (err) {
    console.error("[handleReportRejected] Error:", err);
  }
}

function buildNotificationTitle(
  reportType: string,
  courseCode: string
): string {
  switch (reportType) {
    case "class_cancelled":
      return `${courseCode} class cancelled`;
    case "room_changed":
      return `Room change for ${courseCode}`;
    case "lecturer_late":
      return `Lecturer late for ${courseCode}`;
    case "time_changed":
      return `Time change for ${courseCode}`;
    case "class_confirmed":
      return `${courseCode} class confirmed`;
    default:
      return `Update for ${courseCode}`;
  }
}

function buildNotificationMessage(report: {
  reportType: string;
  courseId: number;
  newRoom?: string | null;
  newStartTime?: string | null;
  title: string;
}): string {
  switch (report.reportType) {
    case "class_cancelled":
      return `Your class has been reported and verified as cancelled.`;
    case "room_changed":
      return report.newRoom
        ? `Class has moved to room ${report.newRoom}.`
        : report.title;
    case "lecturer_late":
      return report.newStartTime
        ? `Lecturer is late. Class may begin at ${report.newStartTime}.`
        : report.title;
    case "time_changed":
      return report.newStartTime
        ? `Class time changed to ${report.newStartTime}.`
        : report.title;
    case "class_confirmed":
      return `Your class is confirmed to be running.`;
    default:
      return report.title;
  }
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
    signup: localAuthRouter.signup,
    login: localAuthRouter.login,
    sendVerificationCode: localAuthRouter.sendVerificationCode,
    verifyEmail: localAuthRouter.verifyEmail,
  }),
  walking: walkingRouter,
  trust: trustRouter,
  classes: classRouter,
  reports: reportsRouter,
  checkins: checkinRouter,
  footpaths: footpathRouter,
  courses: coursesRouter,
  timetable: timetableRouter,
  classReports: classReportsRouter,
  classChat: classChatRouter,
  push: pushRouter,
});

export type AppRouter = typeof appRouter;
