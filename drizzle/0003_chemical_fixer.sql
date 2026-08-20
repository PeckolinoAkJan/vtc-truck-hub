CREATE TABLE `applicant_blacklist` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text NOT NULL,
	`user_id` text,
	`identity` text,
	`reason` text NOT NULL,
	`expires_at` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_blacklist_vtc_user` ON `applicant_blacklist` (`vtc_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `application_forms` (
	`vtc_id` text PRIMARY KEY NOT NULL,
	`fields` text DEFAULT '[]' NOT NULL,
	`deadline` text,
	`cooldown_days` integer DEFAULT 30 NOT NULL,
	`probation_days` integer DEFAULT 28 NOT NULL,
	`auto_role_id` text,
	`open` integer DEFAULT true NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `application_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`kind` text DEFAULT 'internal' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_application_notes_time` ON `application_notes` (`application_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `application_workflow` (
	`application_id` text PRIMARY KEY NOT NULL,
	`assigned_to` text,
	`score` integer,
	`interview_at` text,
	`test_drive_at` text,
	`reapply_after` text,
	`decision_reason` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
