-- ============================================================================
-- Migration: CACTUS Reporting System
-- Adds trust score fields to users, course sessions, class reports,
-- voting, trust score events, push subscriptions, notifications, and
-- class report comments (class chat).
-- ============================================================================

-- 1. Add trust score and suspension fields to users table
ALTER TABLE `users`
  ADD COLUMN `trustScore` int NOT NULL DEFAULT 50,
  ADD COLUMN `suspensionStatus` enum('none','active') NOT NULL DEFAULT 'none',
  ADD COLUMN `suspendedUntil` timestamp NULL;

-- 2. Course sessions (recurring weekly schedule slots)
CREATE TABLE `course_sessions` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `courseId` int NOT NULL,
  `sessionType` enum('lecture','tutorial','lab','seminar','other') NOT NULL DEFAULT 'lecture',
  `dayOfWeek` enum('monday','tuesday','wednesday','thursday','friday','saturday','sunday') NOT NULL,
  `startTime` varchar(8) NOT NULL,
  `endTime` varchar(8) NOT NULL,
  `locationId` int,
  `roomCode` varchar(64),
  `lecturerId` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_session_course_id` (`courseId`),
  INDEX `idx_session_day` (`dayOfWeek`)
);

-- 3. Course session overrides (calendar updates from verified reports)
CREATE TABLE `course_session_overrides` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `courseSessionId` int NOT NULL,
  `classReportId` int NOT NULL,
  `overrideDate` varchar(10) NOT NULL,
  `overrideType` enum('cancelled','room_changed','time_changed','lecturer_late','class_confirmed') NOT NULL,
  `originalRoom` varchar(64),
  `newRoom` varchar(64),
  `originalStartTime` varchar(8),
  `newStartTime` varchar(8),
  `originalEndTime` varchar(8),
  `newEndTime` varchar(8),
  `isCancelled` boolean NOT NULL DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_override_session_id` (`courseSessionId`),
  INDEX `idx_override_report_id` (`classReportId`),
  INDEX `idx_override_date` (`overrideDate`)
);

-- 4. Class reports (richer student course reports with verification)
CREATE TABLE `class_reports` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `courseId` int NOT NULL,
  `courseSessionId` int,
  `reporterUserId` int NOT NULL,
  `reportType` enum('class_cancelled','lecturer_late','room_changed','time_changed','class_confirmed','other') NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text,
  `originalRoom` varchar(64),
  `newRoom` varchar(64),
  `originalStartTime` varchar(8),
  `newStartTime` varchar(8),
  `originalEndTime` varchar(8),
  `newEndTime` varchar(8),
  `reportDate` varchar(10) NOT NULL,
  `status` enum('pending','verified','rejected','expired','superseded') NOT NULL DEFAULT 'pending',
  `verificationScore` int NOT NULL DEFAULT 0,
  `requiredThreshold` int NOT NULL DEFAULT 3,
  `rejectionThreshold` int NOT NULL DEFAULT -3,
  `expiresAt` timestamp NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_class_report_course_id` (`courseId`),
  INDEX `idx_class_report_reporter` (`reporterUserId`),
  INDEX `idx_class_report_status` (`status`),
  INDEX `idx_class_report_expires` (`expiresAt`)
);

-- 5. Class report votes (weighted by role)
CREATE TABLE `class_report_votes` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `reportId` int NOT NULL,
  `userId` int NOT NULL,
  `voteType` enum('upvote','downvote') NOT NULL,
  `voteWeight` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `unique_report_user_vote` (`reportId`, `userId`),
  INDEX `idx_crv_report_id` (`reportId`),
  INDEX `idx_crv_user_id` (`userId`)
);

-- 6. Trust score events (audit log)
CREATE TABLE `trust_score_events` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `relatedReportId` int,
  `eventType` enum('verified_report','rejected_report','correct_vote','incorrect_vote','expired_report','manual_adjustment') NOT NULL,
  `scoreChange` int NOT NULL,
  `previousScore` int NOT NULL,
  `newScore` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_tse_user_id` (`userId`),
  INDEX `idx_tse_report_id` (`relatedReportId`)
);

-- 7. Class report comments (class chat / discussion)
CREATE TABLE `class_report_comments` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `reportId` int NOT NULL,
  `userId` int NOT NULL,
  `message` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_crc_report_id` (`reportId`),
  INDEX `idx_crc_user_id` (`userId`)
);

-- 8. Push subscriptions (PWA Web Push)
CREATE TABLE `push_subscriptions` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `endpoint` text NOT NULL,
  `p256dhKey` text NOT NULL,
  `authKey` text NOT NULL,
  `userAgent` varchar(512),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_push_user_id` (`userId`)
);

-- 9. User notifications (in-app, created on report verification)
CREATE TABLE `user_notifications` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `courseId` int,
  `classReportId` int,
  `title` varchar(255) NOT NULL,
  `message` text NOT NULL,
  `notificationType` varchar(64) NOT NULL,
  `readStatus` boolean NOT NULL DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_un_user_id` (`userId`),
  INDEX `idx_un_course_id` (`courseId`),
  INDEX `idx_un_read_status` (`readStatus`)
);
