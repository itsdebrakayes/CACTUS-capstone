CREATE TABLE "checkins" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"destLat" numeric(10, 7) NOT NULL,
	"destLng" numeric(10, 7) NOT NULL,
	"destGeohash" varchar(12) NOT NULL,
	"etaAt" timestamp NOT NULL,
	"graceMinutes" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"emergencyContact" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"completedAt" timestamp,
	"failedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "class_claim_votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"claimId" integer NOT NULL,
	"voterId" integer NOT NULL,
	"vote" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_claim_voter" UNIQUE("claimId","voterId")
);
--> statement-breakpoint
CREATE TABLE "class_claims" (
	"id" serial PRIMARY KEY NOT NULL,
	"courseId" integer NOT NULL,
	"claimType" text NOT NULL,
	"message" text NOT NULL,
	"createdBy" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"resolvedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"expiresAt" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"courseId" integer NOT NULL,
	"authorId" integer NOT NULL,
	"announcementType" text NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text,
	"isOfficial" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"upvotes" integer DEFAULT 0 NOT NULL,
	"downvotes" integer DEFAULT 0 NOT NULL,
	"reviewedBy" integer,
	"reviewedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_memberships" (
	"id" serial PRIMARY KEY NOT NULL,
	"courseId" integer NOT NULL,
	"userId" integer NOT NULL,
	"membershipRole" text NOT NULL,
	"verifiedBy" integer,
	"verifiedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_course_user" UNIQUE("courseId","userId")
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" serial PRIMARY KEY NOT NULL,
	"courseCode" varchar(32) NOT NULL,
	"courseName" varchar(255) NOT NULL,
	"description" text,
	"thumbnailUrl" varchar(512),
	"room" varchar(64),
	"lecturer" varchar(255),
	"department" varchar(128),
	"classSize" integer NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "courses_courseCode_unique" UNIQUE("courseCode")
);
--> statement-breakpoint
CREATE TABLE "footpaths" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255),
	"geoJson" json NOT NULL,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications_outbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"type" varchar(64) NOT NULL,
	"payload" json,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pathEdges" (
	"id" serial PRIMARY KEY NOT NULL,
	"fromNodeId" integer NOT NULL,
	"toNodeId" integer NOT NULL,
	"distanceM" real NOT NULL,
	"walkTimeSec" integer NOT NULL,
	"lighting" real DEFAULT 0.5 NOT NULL,
	"weatherCoverage" real DEFAULT 0.5 NOT NULL,
	"isolation" real DEFAULT 0.5 NOT NULL,
	"isAccessible" boolean DEFAULT true NOT NULL,
	"surfaceQuality" real DEFAULT 0.8 NOT NULL,
	"scenicScore" real DEFAULT 0 NOT NULL,
	"hasSteps" boolean DEFAULT false NOT NULL,
	"slopeGrade" real DEFAULT 0 NOT NULL,
	"confirmedViolenceCount" integer DEFAULT 0 NOT NULL,
	"confirmedHazardCount" integer DEFAULT 0 NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pathNodes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255),
	"lat" numeric(10, 7) NOT NULL,
	"lng" numeric(10, 7) NOT NULL,
	"isLandmark" boolean DEFAULT false NOT NULL,
	"scenicScore" real DEFAULT 0 NOT NULL,
	"isAccessible" boolean DEFAULT true NOT NULL,
	"category" varchar(64),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "path_report_reliability" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"trueVotes" integer DEFAULT 0 NOT NULL,
	"falseVotes" integer DEFAULT 0 NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "path_report_reliability_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "path_report_votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"reportId" integer NOT NULL,
	"voterId" integer NOT NULL,
	"vote" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_report_voter" UNIQUE("reportId","voterId")
);
--> statement-breakpoint
CREATE TABLE "path_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"reportType" text NOT NULL,
	"severity" integer NOT NULL,
	"lat" numeric(10, 7) NOT NULL,
	"lng" numeric(10, 7) NOT NULL,
	"geohash" varchar(12) NOT NULL,
	"geohash6" varchar(6) NOT NULL,
	"createdBy" integer NOT NULL,
	"description" text,
	"ttlMinutes" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rep_strikes" (
	"id" serial PRIMARY KEY NOT NULL,
	"repId" integer NOT NULL,
	"courseId" integer NOT NULL,
	"strikeCount" integer DEFAULT 0 NOT NULL,
	"bypassDisabledUntil" timestamp,
	"bypassRevoked" boolean DEFAULT false NOT NULL,
	"trueStreak" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_rep_course" UNIQUE("repId","courseId")
);
--> statement-breakpoint
CREATE TABLE "routePlans" (
	"id" serial PRIMARY KEY NOT NULL,
	"fromNodeId" integer NOT NULL,
	"toNodeId" integer NOT NULL,
	"mode" text NOT NULL,
	"hourOfDay" integer NOT NULL,
	"result" json NOT NULL,
	"distanceM" real NOT NULL,
	"walkTimeSec" integer NOT NULL,
	"safetyScore" real NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_courses" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"courseId" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_saved_course" UNIQUE("userId","courseId")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"passwordHash" varchar(255),
	"emailVerified" boolean DEFAULT false NOT NULL,
	"verificationCode" varchar(6),
	"verificationExpiry" timestamp,
	"avatarUrl" text,
	"loginMethod" varchar(64),
	"role" text DEFAULT 'student' NOT NULL,
	"isVerified" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "walking_availability" (
	"userId" integer PRIMARY KEY NOT NULL,
	"isAvailable" boolean DEFAULT false NOT NULL,
	"lat" numeric(10, 7) NOT NULL,
	"lng" numeric(10, 7) NOT NULL,
	"geohash" varchar(12) NOT NULL,
	"geohash5" varchar(5) NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "walking_matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"requestId" integer NOT NULL,
	"walkerId" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"respondedAt" timestamp,
	"completedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "walking_ratings" (
	"id" serial PRIMARY KEY NOT NULL,
	"matchId" integer NOT NULL,
	"raterId" integer NOT NULL,
	"rateeId" integer NOT NULL,
	"stars" integer NOT NULL,
	"comment" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "walking_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"requesterId" integer NOT NULL,
	"originLat" numeric(10, 7) NOT NULL,
	"originLng" numeric(10, 7) NOT NULL,
	"originGeohash" varchar(12) NOT NULL,
	"originGeohash5" varchar(5) NOT NULL,
	"radiusM" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"expiresAt" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_checkin_user_id" ON "checkins" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "idx_checkin_status" ON "checkins" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_vote_claim_id" ON "class_claim_votes" USING btree ("claimId");--> statement-breakpoint
CREATE INDEX "idx_voter_id" ON "class_claim_votes" USING btree ("voterId");--> statement-breakpoint
CREATE INDEX "idx_claim_course_id" ON "class_claims" USING btree ("courseId");--> statement-breakpoint
CREATE INDEX "idx_claim_created_by" ON "class_claims" USING btree ("createdBy");--> statement-breakpoint
CREATE INDEX "idx_claim_status" ON "class_claims" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_ann_course_id" ON "course_announcements" USING btree ("courseId");--> statement-breakpoint
CREATE INDEX "idx_ann_author_id" ON "course_announcements" USING btree ("authorId");--> statement-breakpoint
CREATE INDEX "idx_ann_status" ON "course_announcements" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_course_id" ON "course_memberships" USING btree ("courseId");--> statement-breakpoint
CREATE INDEX "idx_user_id" ON "course_memberships" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "idx_footpath_created_by" ON "footpaths" USING btree ("createdBy");--> statement-breakpoint
CREATE INDEX "idx_notification_user_id" ON "notifications_outbox" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "idx_edge_from" ON "pathEdges" USING btree ("fromNodeId");--> statement-breakpoint
CREATE INDEX "idx_edge_to" ON "pathEdges" USING btree ("toNodeId");--> statement-breakpoint
CREATE INDEX "idx_edge_active" ON "pathEdges" USING btree ("isActive");--> statement-breakpoint
CREATE INDEX "idx_pathnode_latlng" ON "pathNodes" USING btree ("lat","lng");--> statement-breakpoint
CREATE INDEX "idx_reliability_user_id" ON "path_report_reliability" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "idx_report_vote_report_id" ON "path_report_votes" USING btree ("reportId");--> statement-breakpoint
CREATE INDEX "idx_report_voter_id" ON "path_report_votes" USING btree ("voterId");--> statement-breakpoint
CREATE INDEX "idx_geohash6" ON "path_reports" USING btree ("geohash6");--> statement-breakpoint
CREATE INDEX "idx_report_created_by" ON "path_reports" USING btree ("createdBy");--> statement-breakpoint
CREATE INDEX "idx_report_status" ON "path_reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_rep_id" ON "rep_strikes" USING btree ("repId");--> statement-breakpoint
CREATE INDEX "idx_strike_course_id" ON "rep_strikes" USING btree ("courseId");--> statement-breakpoint
CREATE INDEX "idx_routeplan_mode" ON "routePlans" USING btree ("mode");--> statement-breakpoint
CREATE INDEX "idx_routeplan_expires" ON "routePlans" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "idx_routeplan_from_to" ON "routePlans" USING btree ("fromNodeId","toNodeId");--> statement-breakpoint
CREATE INDEX "idx_geohash5" ON "walking_availability" USING btree ("geohash5");--> statement-breakpoint
CREATE INDEX "idx_is_available" ON "walking_availability" USING btree ("isAvailable");--> statement-breakpoint
CREATE INDEX "idx_match_request_id" ON "walking_matches" USING btree ("requestId");--> statement-breakpoint
CREATE INDEX "idx_walker_id" ON "walking_matches" USING btree ("walkerId");--> statement-breakpoint
CREATE INDEX "idx_match_status" ON "walking_matches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_rating_match_id" ON "walking_ratings" USING btree ("matchId");--> statement-breakpoint
CREATE INDEX "idx_ratee_id" ON "walking_ratings" USING btree ("rateeId");--> statement-breakpoint
CREATE INDEX "idx_requester_id" ON "walking_requests" USING btree ("requesterId");--> statement-breakpoint
CREATE INDEX "idx_request_status" ON "walking_requests" USING btree ("status");