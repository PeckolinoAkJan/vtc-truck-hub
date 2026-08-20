CREATE TABLE `trip_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`internal` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_trip_comments_time` ON `trip_comments` (`trip_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `trip_edits` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`field` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_trip_edits_time` ON `trip_edits` (`trip_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `trip_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`upload_id` text NOT NULL,
	`kind` text DEFAULT 'screenshot' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_trip_evidence_trip` ON `trip_evidence` (`trip_id`);