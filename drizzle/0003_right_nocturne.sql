ALTER TABLE `users` ADD `studentId` varchar(32);--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `avatarUrl` text;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_studentId_unique` UNIQUE(`studentId`);