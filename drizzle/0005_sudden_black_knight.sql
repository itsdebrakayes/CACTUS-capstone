CREATE TABLE `course_announcements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseId` int NOT NULL,
	`authorId` int NOT NULL,
	`announcementType` enum('cancelled','room_changed','lecturer_late','rescheduled','materials_uploaded','general') NOT NULL,
	`title` varchar(255) NOT NULL,
	`body` text,
	`isOfficial` boolean NOT NULL DEFAULT false,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `course_announcements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `saved_courses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`courseId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `saved_courses_id` PRIMARY KEY(`id`),
	CONSTRAINT `unique_saved_course` UNIQUE(`userId`,`courseId`)
);
--> statement-breakpoint
ALTER TABLE `courses` ADD `description` text;--> statement-breakpoint
ALTER TABLE `courses` ADD `thumbnailUrl` varchar(512);--> statement-breakpoint
ALTER TABLE `courses` ADD `room` varchar(64);--> statement-breakpoint
ALTER TABLE `courses` ADD `lecturer` varchar(255);--> statement-breakpoint
ALTER TABLE `courses` ADD `department` varchar(128);--> statement-breakpoint
ALTER TABLE `courses` ADD `isActive` boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_ann_course_id` ON `course_announcements` (`courseId`);--> statement-breakpoint
CREATE INDEX `idx_ann_author_id` ON `course_announcements` (`authorId`);--> statement-breakpoint
CREATE INDEX `idx_ann_status` ON `course_announcements` (`status`);