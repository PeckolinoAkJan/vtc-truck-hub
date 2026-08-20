CREATE TABLE `contact_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text NOT NULL,
	`sender_id` text,
	`name` text NOT NULL,
	`email` text,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_contact_vtc_status` ON `contact_messages` (`vtc_id`,`status`);--> statement-breakpoint
CREATE TABLE `content_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_id` text,
	`vtc_id` text,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`reason` text NOT NULL,
	`detail` text,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_content_reports_status` ON `content_reports` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `vtc_follows` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_vtc_follow` ON `vtc_follows` (`vtc_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `vtc_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text NOT NULL,
	`user_id` text NOT NULL,
	`rating` integer NOT NULL,
	`body` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`moderated_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_vtc_review_user` ON `vtc_reviews` (`vtc_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_vtc_review_status` ON `vtc_reviews` (`vtc_id`,`status`);