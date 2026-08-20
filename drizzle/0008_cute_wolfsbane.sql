CREATE TABLE `achievements` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`icon` text,
	`xp_reward` integer DEFAULT 0 NOT NULL,
	`criteria` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_achievements_code` ON `achievements` (`code`);--> statement-breakpoint
CREATE TABLE `career_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text NOT NULL,
	`user_id` text NOT NULL,
	`xp` integer DEFAULT 0 NOT NULL,
	`level` integer DEFAULT 1 NOT NULL,
	`safety_score` real DEFAULT 100 NOT NULL,
	`efficiency_score` real DEFAULT 100 NOT NULL,
	`reliability_score` real DEFAULT 100 NOT NULL,
	`streak_days` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_career_vtc_user` ON `career_profiles` (`vtc_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_career_vtc_xp` ON `career_profiles` (`vtc_id`,`xp`);--> statement-breakpoint
CREATE TABLE `challenge_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`challenge_id` text NOT NULL,
	`user_id` text NOT NULL,
	`value` real DEFAULT 0 NOT NULL,
	`completed_at` text,
	`rewarded_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_challenge_user` ON `challenge_progress` (`challenge_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text,
	`name` text NOT NULL,
	`description` text,
	`metric` text NOT NULL,
	`target` real NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`xp_reward` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_challenges_active` ON `challenges` (`vtc_id`,`active`,`ends_at`);--> statement-breakpoint
CREATE TABLE `user_achievements` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`vtc_id` text NOT NULL,
	`achievement_id` text NOT NULL,
	`awarded_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`awarded_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_achievement` ON `user_achievements` (`user_id`,`vtc_id`,`achievement_id`);