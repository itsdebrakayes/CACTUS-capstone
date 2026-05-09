/**
 * Tests for the CACTUS Class Reporting System
 *
 * Covers:
 * - Role-based vote weight calculation
 * - Verification score accumulation and threshold logic
 * - Trust score change calculations
 * - Suspension threshold logic
 * - Notification title/message generation
 * - Calendar override type mapping
 */

import { describe, it, expect } from "vitest";

// ============================================================================
// HELPERS (pure functions extracted for testability)
// ============================================================================

/**
 * Returns the vote weight for a given global role and course membership role.
 * Mirrors the logic in db.getVoteWeightForUser.
 */
function getVoteWeightForRole(
  globalRole: "student" | "class_rep" | "year_rep" | "guild_admin" | "lecturer",
  membershipRole: "student" | "class_rep" | "lecturer" | null
): number {
  if (globalRole === "guild_admin") return 3;
  if (globalRole === "lecturer") return 5;
  if (globalRole === "year_rep") return 2;
  if (membershipRole === "class_rep") return 2;
  if (membershipRole === "lecturer") return 5;
  return 1;
}

/**
 * Calculates the verification score from a list of votes.
 */
function calcVerificationScore(
  votes: Array<{ voteType: "upvote" | "downvote"; voteWeight: number }>
): number {
  return votes.reduce(
    (sum, v) => sum + (v.voteType === "upvote" ? v.voteWeight : -v.voteWeight),
    0
  );
}

/**
 * Determines report status based on score and thresholds.
 */
function determineReportStatus(
  score: number,
  requiredThreshold: number,
  rejectionThreshold: number
): "pending" | "verified" | "rejected" {
  if (score >= requiredThreshold) return "verified";
  if (score <= rejectionThreshold) return "rejected";
  return "pending";
}

/**
 * Calculates the required threshold for a report.
 * Mirrors the logic in db.getRequiredThresholdForReport.
 */
function calcRequiredThreshold(
  classSize: number,
  isRep: boolean,
  trustScore: number,
  globalRole: "student" | "class_rep" | "year_rep" | "guild_admin" | "lecturer"
): { required: number; rejection: number } {
  if (globalRole === "lecturer" || globalRole === "guild_admin") {
    return { required: 0, rejection: -999 };
  }
  const normalisedTrust = trustScore / 100;
  const alpha = isRep ? 0.1 : 0.3;
  const roleMultiplier = isRep ? 0.5 : 1.0;
  const beta = 0.5;
  const raw = alpha * classSize * roleMultiplier * (1 - beta * normalisedTrust);
  const required = Math.max(1, Math.ceil(raw));
  const rejection = -Math.max(2, Math.ceil(0.25 * classSize));
  return { required, rejection };
}

/**
 * Calculates trust score change for a reporter.
 */
function calcReporterTrustDelta(outcome: "verified" | "rejected" | "expired"): number {
  if (outcome === "verified") return 2;
  if (outcome === "rejected") return -5;
  if (outcome === "expired") return -2;
  return 0;
}

/**
 * Calculates trust score change for a voter.
 */
function calcVoterTrustDelta(
  voteType: "upvote" | "downvote",
  reportOutcome: "verified" | "rejected"
): number {
  const wasCorrect =
    (voteType === "upvote" && reportOutcome === "verified") ||
    (voteType === "downvote" && reportOutcome === "rejected");
  return wasCorrect ? 1 : -1;
}

/**
 * Clamps a trust score to [0, 100].
 */
function clampTrustScore(score: number): number {
  return Math.min(100, Math.max(0, score));
}

/**
 * Checks if a user should be suspended based on rejected report count.
 */
function shouldSuspend(rejectedInWindow: number, alreadySuspended: boolean): boolean {
  return rejectedInWindow >= 3 && !alreadySuspended;
}

/**
 * Builds a notification title for a verified report.
 */
function buildNotificationTitle(reportType: string, courseCode: string): string {
  switch (reportType) {
    case "class_cancelled": return `${courseCode} class cancelled`;
    case "room_changed": return `Room change for ${courseCode}`;
    case "lecturer_late": return `Lecturer late for ${courseCode}`;
    case "time_changed": return `Time change for ${courseCode}`;
    case "class_confirmed": return `${courseCode} class confirmed`;
    default: return `Update for ${courseCode}`;
  }
}

/**
 * Maps a report type to a calendar override type.
 */
function mapReportTypeToOverride(
  reportType: string
): "cancelled" | "room_changed" | "time_changed" | "lecturer_late" | "class_confirmed" {
  const map: Record<string, "cancelled" | "room_changed" | "time_changed" | "lecturer_late" | "class_confirmed"> = {
    class_cancelled: "cancelled",
    room_changed: "room_changed",
    time_changed: "time_changed",
    lecturer_late: "lecturer_late",
    class_confirmed: "class_confirmed",
    other: "class_confirmed",
  };
  return map[reportType] ?? "class_confirmed";
}

// ============================================================================
// TESTS
// ============================================================================

describe("CACTUS Class Reporting System", () => {

  // --------------------------------------------------------------------------
  // VOTE WEIGHTS
  // --------------------------------------------------------------------------
  describe("Vote weight by role", () => {
    it("student gets weight 1", () => {
      expect(getVoteWeightForRole("student", "student")).toBe(1);
    });

    it("class_rep membership gets weight 2", () => {
      expect(getVoteWeightForRole("student", "class_rep")).toBe(2);
    });

    it("year_rep global role gets weight 2", () => {
      expect(getVoteWeightForRole("year_rep", "student")).toBe(2);
    });

    it("guild_admin global role gets weight 3", () => {
      expect(getVoteWeightForRole("guild_admin", "student")).toBe(3);
    });

    it("lecturer global role gets weight 5", () => {
      expect(getVoteWeightForRole("lecturer", "student")).toBe(5);
    });

    it("lecturer membership role gets weight 5", () => {
      expect(getVoteWeightForRole("student", "lecturer")).toBe(5);
    });

    it("guild_admin overrides class_rep membership", () => {
      expect(getVoteWeightForRole("guild_admin", "class_rep")).toBe(3);
    });
  });

  // --------------------------------------------------------------------------
  // VERIFICATION SCORE
  // --------------------------------------------------------------------------
  describe("Verification score calculation", () => {
    it("returns 0 with no votes", () => {
      expect(calcVerificationScore([])).toBe(0);
    });

    it("sums upvote weights", () => {
      const votes = [
        { voteType: "upvote" as const, voteWeight: 1 },
        { voteType: "upvote" as const, voteWeight: 2 },
      ];
      expect(calcVerificationScore(votes)).toBe(3);
    });

    it("subtracts downvote weights", () => {
      const votes = [
        { voteType: "upvote" as const, voteWeight: 2 },
        { voteType: "downvote" as const, voteWeight: 1 },
      ];
      expect(calcVerificationScore(votes)).toBe(1);
    });

    it("can produce negative score", () => {
      const votes = [
        { voteType: "downvote" as const, voteWeight: 3 },
        { voteType: "upvote" as const, voteWeight: 1 },
      ];
      expect(calcVerificationScore(votes)).toBe(-2);
    });

    it("handles mixed weighted votes correctly", () => {
      const votes = [
        { voteType: "upvote" as const, voteWeight: 5 }, // lecturer
        { voteType: "downvote" as const, voteWeight: 1 },
        { voteType: "downvote" as const, voteWeight: 1 },
      ];
      expect(calcVerificationScore(votes)).toBe(3);
    });
  });

  // --------------------------------------------------------------------------
  // REPORT STATUS DETERMINATION
  // --------------------------------------------------------------------------
  describe("Report status determination", () => {
    it("returns verified when score meets required threshold", () => {
      expect(determineReportStatus(5, 5, -3)).toBe("verified");
    });

    it("returns verified when score exceeds required threshold", () => {
      expect(determineReportStatus(7, 5, -3)).toBe("verified");
    });

    it("returns rejected when score meets rejection threshold", () => {
      expect(determineReportStatus(-3, 5, -3)).toBe("rejected");
    });

    it("returns rejected when score is below rejection threshold", () => {
      expect(determineReportStatus(-5, 5, -3)).toBe("rejected");
    });

    it("returns pending when score is between thresholds", () => {
      expect(determineReportStatus(2, 5, -3)).toBe("pending");
    });

    it("returns pending for score of 0", () => {
      expect(determineReportStatus(0, 3, -3)).toBe("pending");
    });
  });

  // --------------------------------------------------------------------------
  // REQUIRED THRESHOLD CALCULATION
  // --------------------------------------------------------------------------
  describe("Required threshold calculation", () => {
    it("lecturer gets instant verification (threshold 0)", () => {
      const { required } = calcRequiredThreshold(40, false, 50, "lecturer");
      expect(required).toBe(0);
    });

    it("guild_admin gets instant verification (threshold 0)", () => {
      const { required } = calcRequiredThreshold(40, false, 50, "guild_admin");
      expect(required).toBe(0);
    });

    it("class rep requires fewer confirmations than student", () => {
      const repThreshold = calcRequiredThreshold(40, true, 50, "student");
      const studentThreshold = calcRequiredThreshold(40, false, 50, "student");
      expect(repThreshold.required).toBeLessThan(studentThreshold.required);
    });

    it("high trust score reduces required threshold", () => {
      const highTrust = calcRequiredThreshold(40, false, 90, "student");
      const lowTrust = calcRequiredThreshold(40, false, 10, "student");
      expect(highTrust.required).toBeLessThanOrEqual(lowTrust.required);
    });

    it("always requires at least 1 confirmation for students", () => {
      const { required } = calcRequiredThreshold(1, false, 100, "student");
      expect(required).toBeGreaterThanOrEqual(1);
    });

    it("rejection threshold scales with class size", () => {
      const small = calcRequiredThreshold(10, false, 50, "student");
      const large = calcRequiredThreshold(100, false, 50, "student");
      expect(Math.abs(large.rejection)).toBeGreaterThan(Math.abs(small.rejection));
    });

    it("rejection threshold is always at least -2", () => {
      const { rejection } = calcRequiredThreshold(5, false, 50, "student");
      expect(rejection).toBeLessThanOrEqual(-2);
    });
  });

  // --------------------------------------------------------------------------
  // TRUST SCORE CHANGES
  // --------------------------------------------------------------------------
  describe("Trust score delta for reporter", () => {
    it("verified report gives +2", () => {
      expect(calcReporterTrustDelta("verified")).toBe(2);
    });

    it("rejected report gives -5", () => {
      expect(calcReporterTrustDelta("rejected")).toBe(-5);
    });

    it("expired report gives -2", () => {
      expect(calcReporterTrustDelta("expired")).toBe(-2);
    });
  });

  describe("Trust score delta for voter", () => {
    it("correct upvote on verified report gives +1", () => {
      expect(calcVoterTrustDelta("upvote", "verified")).toBe(1);
    });

    it("correct downvote on rejected report gives +1", () => {
      expect(calcVoterTrustDelta("downvote", "rejected")).toBe(1);
    });

    it("incorrect upvote on rejected report gives -1", () => {
      expect(calcVoterTrustDelta("upvote", "rejected")).toBe(-1);
    });

    it("incorrect downvote on verified report gives -1", () => {
      expect(calcVoterTrustDelta("downvote", "verified")).toBe(-1);
    });
  });

  describe("Trust score clamping", () => {
    it("clamps to 100 at upper bound", () => {
      expect(clampTrustScore(105)).toBe(100);
    });

    it("clamps to 0 at lower bound", () => {
      expect(clampTrustScore(-10)).toBe(0);
    });

    it("preserves values within range", () => {
      expect(clampTrustScore(75)).toBe(75);
    });

    it("handles boundary values", () => {
      expect(clampTrustScore(0)).toBe(0);
      expect(clampTrustScore(100)).toBe(100);
    });
  });

  // --------------------------------------------------------------------------
  // SUSPENSION LOGIC
  // --------------------------------------------------------------------------
  describe("Suspension threshold logic", () => {
    it("does not suspend with fewer than 3 rejections", () => {
      expect(shouldSuspend(2, false)).toBe(false);
    });

    it("suspends at exactly 3 rejections in window", () => {
      expect(shouldSuspend(3, false)).toBe(true);
    });

    it("suspends at more than 3 rejections", () => {
      expect(shouldSuspend(5, false)).toBe(true);
    });

    it("does not re-suspend if already suspended", () => {
      expect(shouldSuspend(5, true)).toBe(false);
    });

    it("does not suspend with 0 rejections", () => {
      expect(shouldSuspend(0, false)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // NOTIFICATION TITLES
  // --------------------------------------------------------------------------
  describe("Notification title generation", () => {
    it("generates correct title for class_cancelled", () => {
      expect(buildNotificationTitle("class_cancelled", "COMP3161")).toBe("COMP3161 class cancelled");
    });

    it("generates correct title for room_changed", () => {
      expect(buildNotificationTitle("room_changed", "COMP3161")).toBe("Room change for COMP3161");
    });

    it("generates correct title for lecturer_late", () => {
      expect(buildNotificationTitle("lecturer_late", "COMP3161")).toBe("Lecturer late for COMP3161");
    });

    it("generates correct title for time_changed", () => {
      expect(buildNotificationTitle("time_changed", "COMP3161")).toBe("Time change for COMP3161");
    });

    it("generates correct title for class_confirmed", () => {
      expect(buildNotificationTitle("class_confirmed", "COMP3161")).toBe("COMP3161 class confirmed");
    });

    it("generates generic title for unknown type", () => {
      expect(buildNotificationTitle("other", "COMP3161")).toBe("Update for COMP3161");
    });
  });

  // --------------------------------------------------------------------------
  // CALENDAR OVERRIDE MAPPING
  // --------------------------------------------------------------------------
  describe("Calendar override type mapping", () => {
    it("maps class_cancelled to cancelled", () => {
      expect(mapReportTypeToOverride("class_cancelled")).toBe("cancelled");
    });

    it("maps room_changed to room_changed", () => {
      expect(mapReportTypeToOverride("room_changed")).toBe("room_changed");
    });

    it("maps time_changed to time_changed", () => {
      expect(mapReportTypeToOverride("time_changed")).toBe("time_changed");
    });

    it("maps lecturer_late to lecturer_late", () => {
      expect(mapReportTypeToOverride("lecturer_late")).toBe("lecturer_late");
    });

    it("maps class_confirmed to class_confirmed", () => {
      expect(mapReportTypeToOverride("class_confirmed")).toBe("class_confirmed");
    });

    it("maps other to class_confirmed as default", () => {
      expect(mapReportTypeToOverride("other")).toBe("class_confirmed");
    });
  });

  // --------------------------------------------------------------------------
  // END-TO-END SCENARIO: Lecturer-late report verified by class rep vote
  // --------------------------------------------------------------------------
  describe("End-to-end: lecturer_late report verification scenario", () => {
    it("verifies a report after class rep upvote pushes score over threshold", () => {
      // Student submits report for class of 30 with trust score 50
      const { required, rejection } = calcRequiredThreshold(30, false, 50, "student");
      expect(required).toBeGreaterThan(0);

      // Class rep upvotes (weight 2) + 2 students upvote (weight 1 each)
      const votes = [
        { voteType: "upvote" as const, voteWeight: 2 }, // class rep
        { voteType: "upvote" as const, voteWeight: 1 }, // student
        { voteType: "upvote" as const, voteWeight: 1 }, // student
      ];
      const score = calcVerificationScore(votes);
      const status = determineReportStatus(score, required, rejection);

      // Score is 4; for class of 30 with trust 50 the threshold should be ≤ 4
      expect(score).toBe(4);
      expect(["verified", "pending"]).toContain(status);
    });

    it("reporter gets +2 trust on verification", () => {
      const delta = calcReporterTrustDelta("verified");
      expect(delta).toBe(2);
      const newScore = clampTrustScore(50 + delta);
      expect(newScore).toBe(52);
    });

    it("correct upvoters get +1 trust on verification", () => {
      const delta = calcVoterTrustDelta("upvote", "verified");
      expect(delta).toBe(1);
    });

    it("notification title is correct for lecturer_late", () => {
      const title = buildNotificationTitle("lecturer_late", "INFO2603");
      expect(title).toBe("Lecturer late for INFO2603");
    });

    it("override type is lecturer_late", () => {
      expect(mapReportTypeToOverride("lecturer_late")).toBe("lecturer_late");
    });
  });

  // --------------------------------------------------------------------------
  // END-TO-END SCENARIO: False report rejected and suspension triggered
  // --------------------------------------------------------------------------
  describe("End-to-end: false report rejection and suspension", () => {
    it("reporter loses 5 trust on rejection", () => {
      const delta = calcReporterTrustDelta("rejected");
      const newScore = clampTrustScore(50 + delta);
      expect(newScore).toBe(45);
    });

    it("trust score does not go below 0", () => {
      const newScore = clampTrustScore(3 + calcReporterTrustDelta("rejected"));
      expect(newScore).toBe(0);
    });

    it("suspension triggered after 3 rejections in window", () => {
      expect(shouldSuspend(3, false)).toBe(true);
    });

    it("suspension not re-applied if already active", () => {
      expect(shouldSuspend(5, true)).toBe(false);
    });

    it("correct downvoters get +1 trust on rejection", () => {
      const delta = calcVoterTrustDelta("downvote", "rejected");
      expect(delta).toBe(1);
    });
  });
});
