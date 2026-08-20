CREATE TABLE `departments` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`lead_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_departments_vtc_name` ON `departments` (`vtc_id`,`name`);--> statement-breakpoint
CREATE TABLE `personnel_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`note` text,
	`actor_id` text NOT NULL,
	`effective_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_personnel_actions_user_time` ON `personnel_actions` (`vtc_id`,`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `personnel_records` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text NOT NULL,
	`user_id` text NOT NULL,
	`steam_id` text,
	`discord_id` text,
	`truckersmp_id` text,
	`probation_start` text,
	`probation_end` text,
	`branch` text,
	`main_game` text,
	`preferred_truck` text,
	`driving_style` text,
	`language` text,
	`timezone` text,
	`status` text DEFAULT 'active' NOT NULL,
	`last_activity` text,
	`sensitive_notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_personnel_vtc_user` ON `personnel_records` (`vtc_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_personnel_status` ON `personnel_records` (`vtc_id`,`status`);--> statement-breakpoint
CREATE TABLE `role_delegations` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text NOT NULL,
	`from_user_id` text NOT NULL,
	`to_user_id` text NOT NULL,
	`permissions` text DEFAULT '[]' NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_delegations_active` ON `role_delegations` (`vtc_id`,`to_user_id`,`active`);--> statement-breakpoint
CREATE TABLE `vtc_profiles` (
	`vtc_id` text PRIMARY KEY NOT NULL,
	`founded_at` text,
	`history` text,
	`motto` text,
	`main_language` text,
	`contact_name` text,
	`public_status` text DEFAULT 'public' NOT NULL,
	`requirements` text DEFAULT '[]' NOT NULL,
	`rules` text DEFAULT '[]' NOT NULL,
	`probation_info` text,
	`social_links` text DEFAULT '{}' NOT NULL,
	`partner_seeking` integer DEFAULT false NOT NULL,
	`beginner_friendly` integer DEFAULT false NOT NULL,
	`driving_modes` text DEFAULT '[]' NOT NULL,
	`visibility` text DEFAULT '{}' NOT NULL,
	`logo_upload_id` text,
	`header_upload_id` text,
	`primary_color` text DEFAULT '#22d3c5' NOT NULL,
	`secondary_color` text DEFAULT '#0d202d' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
