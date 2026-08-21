CREATE TABLE `live_map_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`public_visible` integer DEFAULT true NOT NULL,
	`public_delay_minutes` integer DEFAULT 10 NOT NULL,
	`show_exact_to_vtc` integer DEFAULT true NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `live_positions` (
	`user_id` text PRIMARY KEY NOT NULL,
	`vtc_id` text NOT NULL,
	`trip_id` text,
	`game` text NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`game_x` real,
	`game_y` real,
	`game_z` real,
	`coordinate_accuracy` text DEFAULT 'unknown' NOT NULL,
	`projection_profile` text,
	`heading` real DEFAULT 0 NOT NULL,
	`speed_kph` real DEFAULT 0 NOT NULL,
	`truck` text,
	`cargo` text,
	`source_city` text,
	`destination_city` text,
	`server` text,
	`active` integer DEFAULT true NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_live_positions_vtc_active_time` ON `live_positions` (`vtc_id`,`active`,`updated_at`);--> statement-breakpoint
CREATE TABLE `payroll_reservations` (
	`payroll_id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'unfunded' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_payroll_reservations_account_status` ON `payroll_reservations` (`account_id`,`status`);