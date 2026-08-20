CREATE TABLE `bot_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_bot_rules_guild_position` ON `bot_rules` (`guild_id`,`position`);--> statement-breakpoint
CREATE TABLE `discord_guilds` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`vtc_id` text,
	`welcome_channel_id` text,
	`welcome_message` text DEFAULT 'Willkommen {user} bei {vtc}!' NOT NULL,
	`announcement_channel_id` text,
	`ticket_category_id` text,
	`support_role_id` text,
	`auto_role_ids` text DEFAULT '[]' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`updated_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `discord_role_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`platform_role_id` text NOT NULL,
	`discord_role_id` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_discord_role_mapping` ON `discord_role_mappings` (`guild_id`,`platform_role_id`);--> statement-breakpoint
CREATE TABLE `economy_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text,
	`name` text NOT NULL,
	`cents_per_km` integer DEFAULT 45 NOT NULL,
	`job_bonus_cents` integer DEFAULT 2500 NOT NULL,
	`damage_penalty_per_percent_cents` integer DEFAULT 200 NOT NULL,
	`point_prices` text DEFAULT '[{"to":5,"cents":50000},{"to":10,"cents":75000},{"to":20,"cents":100000},{"to":9999,"cents":150000}]' NOT NULL,
	`speed_rules` text DEFAULT '[{"from":95,"points":1},{"from":100,"points":2},{"from":110,"points":3},{"from":120,"points":5},{"from":130,"points":8}]' NOT NULL,
	`monthly_redemption_limit` integer DEFAULT 10 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`updated_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_economy_vtc_active` ON `economy_settings` (`vtc_id`,`active`);--> statement-breakpoint
CREATE TABLE `payroll_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`payroll_id` text NOT NULL,
	`trip_id` text,
	`type` text NOT NULL,
	`description` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`detail` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payroll_line_trip_type` ON `payroll_lines` (`payroll_id`,`trip_id`,`type`);--> statement-breakpoint
CREATE TABLE `payrolls` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text NOT NULL,
	`user_id` text NOT NULL,
	`period` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`gross_cents` integer DEFAULT 0 NOT NULL,
	`deductions_cents` integer DEFAULT 0 NOT NULL,
	`net_cents` integer DEFAULT 0 NOT NULL,
	`submitted_at` text,
	`approved_by` text,
	`approved_at` text,
	`paid_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payroll_period_user` ON `payrolls` (`vtc_id`,`user_id`,`period`);--> statement-breakpoint
CREATE INDEX `idx_payroll_status` ON `payrolls` (`vtc_id`,`status`);--> statement-breakpoint
CREATE TABLE `platform_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `point_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`vtc_id` text NOT NULL,
	`trip_id` text,
	`incident_id` text,
	`delta` integer NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'provisional' NOT NULL,
	`source_key` text NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_point_source` ON `point_ledger` (`source_key`);--> statement-breakpoint
CREATE INDEX `idx_point_user_status` ON `point_ledger` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `speed_incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`user_id` text NOT NULL,
	`vtc_id` text NOT NULL,
	`started_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`ended_at` text,
	`peak_speed_kph` real NOT NULL,
	`last_bucket` integer DEFAULT -1 NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'provisional' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_speed_trip_open` ON `speed_incidents` (`trip_id`,`ended_at`);--> statement-breakpoint
CREATE INDEX `idx_speed_user_status` ON `speed_incidents` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`number` integer NOT NULL,
	`vtc_id` text,
	`user_id` text,
	`discord_user_id` text,
	`discord_channel_id` text,
	`category` text NOT NULL,
	`subject` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`assigned_to` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`closed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ticket_number` ON `support_tickets` (`number`);--> statement-breakpoint
CREATE INDEX `idx_tickets_status` ON `support_tickets` (`status`,`priority`);--> statement-breakpoint
CREATE TABLE `ticket_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`author_id` text,
	`author_type` text NOT NULL,
	`body` text NOT NULL,
	`internal` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ticket_messages_ticket_time` ON `ticket_messages` (`ticket_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `trip_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`vtc_id` text NOT NULL,
	`user_id` text NOT NULL,
	`game` text NOT NULL,
	`job_key` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`source_city` text,
	`source_company` text,
	`destination_city` text,
	`destination_company` text,
	`cargo` text,
	`cargo_mass` real,
	`planned_distance_km` real,
	`game_income_cents` integer DEFAULT 0 NOT NULL,
	`start_odometer_km` real,
	`last_odometer_km` real,
	`accepted_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`interrupted_at` text,
	`delivered_at` text,
	`cancelled_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_trip_jobs_identity` ON `trip_jobs` (`vtc_id`,`user_id`,`game`,`job_key`);--> statement-breakpoint
CREATE INDEX `idx_trip_jobs_user_status` ON `trip_jobs` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `trip_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`status` text DEFAULT 'pending_driver' NOT NULL,
	`driver_confirmed_at` text,
	`reviewed_by` text,
	`reviewed_at` text,
	`reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_trip_reviews_trip` ON `trip_reviews` (`trip_id`);--> statement-breakpoint
CREATE INDEX `idx_trip_reviews_status` ON `trip_reviews` (`status`);--> statement-breakpoint
CREATE TABLE `wallet_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`wallet_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'posted' NOT NULL,
	`reference_type` text,
	`reference_id` text,
	`description` text NOT NULL,
	`created_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_wallet_reference` ON `wallet_transactions` (`wallet_id`,`reference_type`,`reference_id`);--> statement-breakpoint
CREATE INDEX `idx_wallet_tx_time` ON `wallet_transactions` (`wallet_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `wallets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`currency` text DEFAULT 'V€' NOT NULL,
	`balance_cents` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_wallet_owner` ON `wallets` (`owner_type`,`owner_id`);