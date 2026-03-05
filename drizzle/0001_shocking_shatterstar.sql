CREATE TABLE `checkins` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`destLat` decimal(10,7) NOT NULL,
	`destLng` decimal(10,7) NOT NULL,
	`destGeohash` varchar(12) NOT NULL,
	`etaAt` timestamp NOT NULL,
	`graceMinutes` int NOT NULL,
	`status` enum('active','completed','failed','cancelled') NOT NULL DEFAULT 'active',
	`emergencyContact` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`failedAt` timestamp,
	CONSTRAINT `checkins_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `class_claim_votes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`claimId` int NOT NULL,
	`voterId` int NOT NULL,
	`vote` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `class_claim_votes_id` PRIMARY KEY(`id`),
	CONSTRAINT `unique_claim_voter` UNIQUE(`claimId`,`voterId`)
);
--> statement-breakpoint
CREATE TABLE `class_claims` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseId` int NOT NULL,
	`claimType` enum('cancelled','room_change','time_change','late','other') NOT NULL,
	`message` text NOT NULL,
	`createdBy` int NOT NULL,
	`status` enum('pending','verified','rejected','expired') NOT NULL DEFAULT 'pending',
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `class_claims_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `course_memberships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseId` int NOT NULL,
	`userId` int NOT NULL,
	`membershipRole` enum('student','class_rep','lecturer') NOT NULL,
	`verifiedBy` int,
	`verifiedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `course_memberships_id` PRIMARY KEY(`id`),
	CONSTRAINT `unique_course_user` UNIQUE(`courseId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `courses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseCode` varchar(32) NOT NULL,
	`courseName` varchar(255) NOT NULL,
	`classSize` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `courses_id` PRIMARY KEY(`id`),
	CONSTRAINT `courses_courseCode_unique` UNIQUE(`courseCode`)
);
--> statement-breakpoint
CREATE TABLE `footpaths` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255),
	`geoJson` json NOT NULL,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `footpaths_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications_outbox` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` varchar(64) NOT NULL,
	`payload` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_outbox_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `path_report_reliability` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`trueVotes` int NOT NULL DEFAULT 0,
	`falseVotes` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `path_report_reliability_id` PRIMARY KEY(`id`),
	CONSTRAINT `path_report_reliability_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `path_report_votes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reportId` int NOT NULL,
	`voterId` int NOT NULL,
	`vote` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `path_report_votes_id` PRIMARY KEY(`id`),
	CONSTRAINT `unique_report_voter` UNIQUE(`reportId`,`voterId`)
);
--> statement-breakpoint
CREATE TABLE `path_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reportType` enum('light_out','broken_path','flooding','obstruction','suspicious') NOT NULL,
	`severity` int NOT NULL,
	`lat` decimal(10,7) NOT NULL,
	`lng` decimal(10,7) NOT NULL,
	`geohash` varchar(12) NOT NULL,
	`geohash6` varchar(6) NOT NULL,
	`createdBy` int NOT NULL,
	`ttlMinutes` int NOT NULL,
	`status` enum('active','verified','expired','resolved') NOT NULL DEFAULT 'active',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `path_reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rep_strikes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`repId` int NOT NULL,
	`courseId` int NOT NULL,
	`strikeCount` int NOT NULL DEFAULT 0,
	`bypassDisabledUntil` timestamp,
	`bypassRevoked` boolean NOT NULL DEFAULT false,
	`trueStreak` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rep_strikes_id` PRIMARY KEY(`id`),
	CONSTRAINT `unique_rep_course` UNIQUE(`repId`,`courseId`)
);
--> statement-breakpoint
CREATE TABLE `walking_availability` (
	`userId` int NOT NULL,
	`isAvailable` boolean NOT NULL DEFAULT false,
	`lat` decimal(10,7) NOT NULL,
	`lng` decimal(10,7) NOT NULL,
	`geohash` varchar(12) NOT NULL,
	`geohash5` varchar(5) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `walking_availability_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
CREATE TABLE `walking_matches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestId` int NOT NULL,
	`walkerId` int NOT NULL,
	`status` enum('pending','accepted','declined','completed','cancelled') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`respondedAt` timestamp,
	`completedAt` timestamp,
	CONSTRAINT `walking_matches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `walking_ratings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`matchId` int NOT NULL,
	`raterId` int NOT NULL,
	`rateeId` int NOT NULL,
	`stars` int NOT NULL,
	`comment` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `walking_ratings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `walking_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requesterId` int NOT NULL,
	`originLat` decimal(10,7) NOT NULL,
	`originLng` decimal(10,7) NOT NULL,
	`originGeohash` varchar(12) NOT NULL,
	`originGeohash5` varchar(5) NOT NULL,
	`radiusM` int NOT NULL,
	`status` enum('open','matched','cancelled','expired') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `walking_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('student','class_rep','year_rep','guild_admin','lecturer') NOT NULL DEFAULT 'student';--> statement-breakpoint
ALTER TABLE `users` ADD `isVerified` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_email_unique` UNIQUE(`email`);--> statement-breakpoint
CREATE INDEX `idx_checkin_user_id` ON `checkins` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_checkin_status` ON `checkins` (`status`);--> statement-breakpoint
CREATE INDEX `idx_vote_claim_id` ON `class_claim_votes` (`claimId`);--> statement-breakpoint
CREATE INDEX `idx_voter_id` ON `class_claim_votes` (`voterId`);--> statement-breakpoint
CREATE INDEX `idx_claim_course_id` ON `class_claims` (`courseId`);--> statement-breakpoint
CREATE INDEX `idx_claim_created_by` ON `class_claims` (`createdBy`);--> statement-breakpoint
CREATE INDEX `idx_claim_status` ON `class_claims` (`status`);--> statement-breakpoint
CREATE INDEX `idx_course_id` ON `course_memberships` (`courseId`);--> statement-breakpoint
CREATE INDEX `idx_user_id` ON `course_memberships` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_footpath_created_by` ON `footpaths` (`createdBy`);--> statement-breakpoint
CREATE INDEX `idx_notification_user_id` ON `notifications_outbox` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_reliability_user_id` ON `path_report_reliability` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_report_vote_report_id` ON `path_report_votes` (`reportId`);--> statement-breakpoint
CREATE INDEX `idx_report_voter_id` ON `path_report_votes` (`voterId`);--> statement-breakpoint
CREATE INDEX `idx_geohash6` ON `path_reports` (`geohash6`);--> statement-breakpoint
CREATE INDEX `idx_report_created_by` ON `path_reports` (`createdBy`);--> statement-breakpoint
CREATE INDEX `idx_report_status` ON `path_reports` (`status`);--> statement-breakpoint
CREATE INDEX `idx_rep_id` ON `rep_strikes` (`repId`);--> statement-breakpoint
CREATE INDEX `idx_strike_course_id` ON `rep_strikes` (`courseId`);--> statement-breakpoint
CREATE INDEX `idx_geohash5` ON `walking_availability` (`geohash5`);--> statement-breakpoint
CREATE INDEX `idx_is_available` ON `walking_availability` (`isAvailable`);--> statement-breakpoint
CREATE INDEX `idx_match_request_id` ON `walking_matches` (`requestId`);--> statement-breakpoint
CREATE INDEX `idx_walker_id` ON `walking_matches` (`walkerId`);--> statement-breakpoint
CREATE INDEX `idx_match_status` ON `walking_matches` (`status`);--> statement-breakpoint
CREATE INDEX `idx_rating_match_id` ON `walking_ratings` (`matchId`);--> statement-breakpoint
CREATE INDEX `idx_ratee_id` ON `walking_ratings` (`rateeId`);--> statement-breakpoint
CREATE INDEX `idx_requester_id` ON `walking_requests` (`requesterId`);--> statement-breakpoint
CREATE INDEX `idx_request_status` ON `walking_requests` (`status`);