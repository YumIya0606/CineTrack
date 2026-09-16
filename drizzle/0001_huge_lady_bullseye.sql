CREATE TABLE `collection_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`collection_id` integer NOT NULL,
	`catalog_id` integer NOT NULL,
	`added_at` text NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`catalog_id`) REFERENCES `catalog`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_collection_item` ON `collection_items` (`collection_id`,`catalog_id`);--> statement-breakpoint
CREATE INDEX `idx_collection_items_collection` ON `collection_items` (`collection_id`);--> statement-breakpoint
CREATE TABLE `collections` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`catalog_id` integer,
	`tmdb_id` integer,
	`scheduled_for` text NOT NULL,
	`fired` integer DEFAULT false NOT NULL,
	`dismissed` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_notifications_fired` ON `notifications` (`fired`);--> statement-breakpoint
CREATE INDEX `idx_notifications_dismissed` ON `notifications` (`dismissed`);--> statement-breakpoint
CREATE INDEX `idx_notifications_tmdb` ON `notifications` (`tmdb_id`);--> statement-breakpoint
CREATE TABLE `viewing_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`library_id` integer NOT NULL,
	`watched_at` text NOT NULL,
	FOREIGN KEY (`library_id`) REFERENCES `library`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_viewing_log_library` ON `viewing_log` (`library_id`);--> statement-breakpoint
CREATE INDEX `idx_viewing_log_date` ON `viewing_log` (`watched_at`);