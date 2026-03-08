ALTER TABLE `users` DROP INDEX `users_studentId_unique`;--> statement-breakpoint
ALTER TABLE `users` ADD `emailVerified` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `verificationCode` varchar(6);--> statement-breakpoint
ALTER TABLE `users` ADD `verificationExpiry` timestamp;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `studentId`;