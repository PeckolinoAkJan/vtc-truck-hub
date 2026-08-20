CREATE TABLE `calendar_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text NOT NULL,
	`user_id` text,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`starts_at` text NOT NULL,
	`ends_at` text,
	`timezone` text DEFAULT 'Europe/Berlin' NOT NULL,
	`recurrence` text,
	`visibility` text DEFAULT 'vtc' NOT NULL,
	`reminder_minutes` integer,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_calendar_vtc_start` ON `calendar_entries` (`vtc_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `driver_availability` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text NOT NULL,
	`user_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`available_from` text,
	`available_to` text,
	`note` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_driver_availability_day` ON `driver_availability` (`vtc_id`,`user_id`,`weekday`);--> statement-breakpoint
CREATE TABLE `event_details` (
	`event_id` text PRIMARY KEY NOT NULL,
	`title_upload_id` text,
	`meeting_at` text,
	`departure_at` text,
	`route` text,
	`distance_km` real,
	`dlc_requirements` text DEFAULT '[]' NOT NULL,
	`mod_requirements` text DEFAULT '[]' NOT NULL,
	`trailer_rules` text,
	`vehicle_rules` text,
	`event_rules` text,
	`discord_channel` text,
	`contact_name` text,
	`convoy_server` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`notes` text,
	`created_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `event_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`user_id` text NOT NULL,
	`rating` integer NOT NULL,
	`body` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_event_feedback_user` ON `event_feedback` (`event_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `event_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`user_id` text,
	`external_vtc_id` text,
	`status` text DEFAULT 'registered' NOT NULL,
	`role` text DEFAULT 'participant' NOT NULL,
	`slot` text,
	`checked_in_at` text,
	`attendance` text,
	`note` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_event_participant_user` ON `event_participants` (`event_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_event_participants_status` ON `event_participants` (`event_id`,`status`);--> statement-breakpoint
CREATE TABLE `event_reports` (
	`event_id` text PRIMARY KEY NOT NULL,
	`summary` text,
	`distance_km` real,
	`photos` text DEFAULT '[]' NOT NULL,
	`videos` text DEFAULT '[]' NOT NULL,
	`awards` text DEFAULT '[]' NOT NULL,
	`published` integer DEFAULT false NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `leave_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text NOT NULL,
	`user_id` text NOT NULL,
	`type` text DEFAULT 'vacation' NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`reason` text,
	`representative_id` text,
	`status` text DEFAULT 'requested' NOT NULL,
	`reviewed_by` text,
	`reviewed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_leave_vtc_status` ON `leave_requests` (`vtc_id`,`status`);