CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text NOT NULL,
	`user_id` text,
	`driver_name` text NOT NULL,
	`age` integer,
	`country` text,
	`game` text,
	`answers` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_applications_vtc_status` ON `applications` (`vtc_id`,`status`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vtc_id` text,
	`actor_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`detail` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_vtc_time` ON `audit_logs` (`vtc_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text NOT NULL,
	`name` text NOT NULL,
	`game` text NOT NULL,
	`description` text,
	`source_city` text NOT NULL,
	`destination_city` text NOT NULL,
	`starts_at` text NOT NULL,
	`timezone` text NOT NULL,
	`server` text,
	`capacity` integer,
	`public` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_events_start` ON `events` (`starts_at`);--> statement-breakpoint
CREATE TABLE `linked_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_id` text NOT NULL,
	`username` text,
	`profile_url` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_linked_provider_id` ON `linked_accounts` (`provider`,`provider_id`);--> statement-breakpoint
CREATE INDEX `idx_linked_user` ON `linked_accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role_id` text,
	`driver_number` text,
	`status` text DEFAULT 'active' NOT NULL,
	`department` text,
	`joined_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_membership_vtc_user` ON `memberships` (`vtc_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_membership_status` ON `memberships` (`vtc_id`,`status`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`read_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_notifications_user_read` ON `notifications` (`user_id`,`read_at`);--> statement-breakpoint
CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`rank` integer DEFAULT 0 NOT NULL,
	`permissions` text DEFAULT '[]' NOT NULL,
	`protected` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_roles_vtc_rank` ON `roles` (`vtc_id`,`rank`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`ip_hash` text,
	`user_agent` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_expiry` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `telemetry` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` text,
	`vtc_id` text NOT NULL,
	`user_id` text NOT NULL,
	`game` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`heading` real DEFAULT 0 NOT NULL,
	`speed_kph` real DEFAULT 0 NOT NULL,
	`rpm` real,
	`fuel_liters` real,
	`truck` text,
	`cargo` text,
	`source_city` text,
	`destination_city` text,
	`server` text,
	`recorded_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_telemetry_vtc_time` ON `telemetry` (`vtc_id`,`recorded_at`);--> statement-breakpoint
CREATE INDEX `idx_telemetry_user_time` ON `telemetry` (`user_id`,`recorded_at`);--> statement-breakpoint
CREATE TABLE `trips` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text NOT NULL,
	`user_id` text NOT NULL,
	`game` text NOT NULL,
	`mode` text,
	`source_city` text,
	`destination_city` text,
	`cargo` text,
	`distance_km` real DEFAULT 0 NOT NULL,
	`fuel_liters` real DEFAULT 0 NOT NULL,
	`damage` real DEFAULT 0 NOT NULL,
	`income` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'started' NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`telemetry_source` text DEFAULT 'desktop-client' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_trips_vtc_started` ON `trips` (`vtc_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_trips_user_status` ON `trips` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`vtc_id` text,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_uploads_key` ON `uploads` (`object_key`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`display_name` text NOT NULL,
	`password_hash` text,
	`locale` text DEFAULT 'de' NOT NULL,
	`timezone` text DEFAULT 'Europe/Berlin' NOT NULL,
	`two_factor_enabled` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_email` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text NOT NULL,
	`number` text NOT NULL,
	`type` text NOT NULL,
	`brand` text NOT NULL,
	`model` text NOT NULL,
	`license_plate` text,
	`mileage` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`assigned_user_id` text
);
--> statement-breakpoint
CREATE INDEX `idx_vehicles_vtc_status` ON `vehicles` (`vtc_id`,`status`);--> statement-breakpoint
CREATE TABLE `vtcs` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`tag` text NOT NULL,
	`description` text NOT NULL,
	`country` text NOT NULL,
	`city` text,
	`games` text NOT NULL,
	`languages` text NOT NULL,
	`timezone` text NOT NULL,
	`truckersmp_id` text,
	`discord_url` text,
	`website_url` text,
	`applications_open` integer DEFAULT true NOT NULL,
	`minimum_age` integer DEFAULT 16 NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	`driver_count` integer DEFAULT 0 NOT NULL,
	`total_km` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_vtcs_slug` ON `vtcs` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_vtcs_country_games` ON `vtcs` (`country`,`games`);--> statement-breakpoint
CREATE TABLE `webhooks` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text NOT NULL,
	`url` text NOT NULL,
	`events` text NOT NULL,
	`secret_hash` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_webhooks_vtc_active` ON `webhooks` (`vtc_id`,`active`);