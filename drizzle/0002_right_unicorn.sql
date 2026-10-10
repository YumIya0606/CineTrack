CREATE TABLE `status_defs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`color` text DEFAULT 'slate' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`counts_toward_watch_time` integer DEFAULT false NOT NULL,
	`derivable` integer DEFAULT false NOT NULL,
	`is_system` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `status_defs_key_unique` ON `status_defs` (`key`);--> statement-breakpoint
ALTER TABLE `library` ADD `status_override` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `library` ADD `episodes_runtime` integer;--> statement-breakpoint
INSERT INTO `status_defs` (`key`, `label`, `color`, `position`, `counts_toward_watch_time`, `derivable`, `is_system`) VALUES
	('watching', 'Watching', 'azure', 0, false, true, true),
	('planned', 'Planned', 'violet', 1, false, true, true),
	('completed', 'Completed', 'emerald', 2, true, true, true),
	('rewatching', 'Rewatching', 'gold', 3, true, false, true),
	('dropped', 'Dropped', 'crimson', 4, false, false, true);