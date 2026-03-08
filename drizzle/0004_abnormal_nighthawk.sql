CREATE TABLE `pathEdges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fromNodeId` int NOT NULL,
	`toNodeId` int NOT NULL,
	`distanceM` float NOT NULL,
	`walkTimeSec` int NOT NULL,
	`lighting` float NOT NULL DEFAULT 0.5,
	`weatherCoverage` float NOT NULL DEFAULT 0.5,
	`isolation` float NOT NULL DEFAULT 0.5,
	`isAccessible` boolean NOT NULL DEFAULT true,
	`surfaceQuality` float NOT NULL DEFAULT 0.8,
	`scenicScore` float NOT NULL DEFAULT 0,
	`hasSteps` boolean NOT NULL DEFAULT false,
	`slopeGrade` float NOT NULL DEFAULT 0,
	`confirmedViolenceCount` int NOT NULL DEFAULT 0,
	`confirmedHazardCount` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pathEdges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pathNodes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255),
	`lat` decimal(10,7) NOT NULL,
	`lng` decimal(10,7) NOT NULL,
	`isLandmark` boolean NOT NULL DEFAULT false,
	`scenicScore` float NOT NULL DEFAULT 0,
	`isAccessible` boolean NOT NULL DEFAULT true,
	`category` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pathNodes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `routePlans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fromNodeId` int NOT NULL,
	`toNodeId` int NOT NULL,
	`mode` enum('shortest','scenic','accessible','safe_night') NOT NULL,
	`hourOfDay` int NOT NULL,
	`result` json NOT NULL,
	`distanceM` float NOT NULL,
	`walkTimeSec` int NOT NULL,
	`safetyScore` float NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `routePlans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_edge_from` ON `pathEdges` (`fromNodeId`);--> statement-breakpoint
CREATE INDEX `idx_edge_to` ON `pathEdges` (`toNodeId`);--> statement-breakpoint
CREATE INDEX `idx_edge_active` ON `pathEdges` (`isActive`);--> statement-breakpoint
CREATE INDEX `idx_pathnode_latlng` ON `pathNodes` (`lat`,`lng`);--> statement-breakpoint
CREATE INDEX `idx_routeplan_mode` ON `routePlans` (`mode`);--> statement-breakpoint
CREATE INDEX `idx_routeplan_expires` ON `routePlans` (`expiresAt`);--> statement-breakpoint
CREATE INDEX `idx_routeplan_from_to` ON `routePlans` (`fromNodeId`,`toNodeId`);