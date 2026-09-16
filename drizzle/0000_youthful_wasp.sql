CREATE TABLE `catalog` (
	`id` integer PRIMARY KEY NOT NULL,
	`tmdb_id` integer,
	`imdb_id` text,
	`title` text NOT NULL,
	`original_title` text,
	`kind` text NOT NULL,
	`year` integer,
	`end_year` integer,
	`genres` text DEFAULT '' NOT NULL,
	`runtime_minutes` integer,
	`vote_average` real,
	`vote_count` integer,
	`overview` text,
	`poster_path` text,
	`backdrop_path` text,
	`popularity` real
);
--> statement-breakpoint
CREATE INDEX `idx_catalog_title` ON `catalog` (`title`);--> statement-breakpoint
CREATE INDEX `idx_catalog_kind` ON `catalog` (`kind`);--> statement-breakpoint
CREATE INDEX `idx_catalog_year` ON `catalog` (`year`);--> statement-breakpoint
CREATE INDEX `idx_catalog_tmdb` ON `catalog` (`tmdb_id`);--> statement-breakpoint
CREATE INDEX `idx_catalog_imdb` ON `catalog` (`imdb_id`);--> statement-breakpoint
CREATE TABLE `episode_log` (
	`library_id` integer NOT NULL,
	`season` integer NOT NULL,
	`episode` integer NOT NULL,
	`watched_at` text NOT NULL,
	PRIMARY KEY(`library_id`, `season`, `episode`),
	FOREIGN KEY (`library_id`) REFERENCES `library`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_episode_library` ON `episode_log` (`library_id`);--> statement-breakpoint
CREATE TABLE `library` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`catalog_id` integer NOT NULL,
	`status` text NOT NULL,
	`rating` integer,
	`notes` text,
	`added_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`watched_at` text,
	`episodes_watched` integer DEFAULT 0 NOT NULL,
	`episodes_total` integer,
	`seasons_total` integer,
	`play_count` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`catalog_id`) REFERENCES `catalog`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_library_status` ON `library` (`status`);--> statement-breakpoint
CREATE INDEX `idx_library_catalog` ON `library` (`catalog_id`);--> statement-breakpoint
CREATE INDEX `idx_library_updated` ON `library` (`updated_at`);--> statement-breakpoint
CREATE TABLE `people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`catalog_id` integer NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`character` text,
	`tmdb_person_id` integer,
	FOREIGN KEY (`catalog_id`) REFERENCES `catalog`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_people_name` ON `people` (`name`);--> statement-breakpoint
CREATE INDEX `idx_people_catalog` ON `people` (`catalog_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
