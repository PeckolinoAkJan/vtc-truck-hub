CREATE TABLE `maintenance_records` (
	`id` text PRIMARY KEY NOT NULL,
	`vehicle_id` text NOT NULL,
	`type` text NOT NULL,
	`description` text NOT NULL,
	`cost_cents` integer DEFAULT 0 NOT NULL,
	`mileage` real,
	`scheduled_at` text,
	`completed_at` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`workshop` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_maintenance_vehicle_time` ON `maintenance_records` (`vehicle_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `vehicle_details` (
	`vehicle_id` text PRIMARY KEY NOT NULL,
	`series` text,
	`year` integer,
	`paint` text,
	`engine` text,
	`transmission` text,
	`chassis` text,
	`axle_config` text,
	`tank_capacity` real,
	`purchase_price_cents` integer,
	`purchase_date` text,
	`leasing` integer DEFAULT false NOT NULL,
	`location` text,
	`garage` text,
	`branch` text,
	`maintenance_interval_km` real DEFAULT 30000 NOT NULL,
	`next_maintenance_km` real,
	`reliability` real DEFAULT 100 NOT NULL,
	`image_upload_id` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vehicle_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`vehicle_id` text NOT NULL,
	`user_id` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text,
	`status` text DEFAULT 'requested' NOT NULL,
	`note` text,
	`reviewed_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_vehicle_reservations_status` ON `vehicle_reservations` (`vehicle_id`,`status`);--> statement-breakpoint
CREATE TABLE `vehicle_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`vehicle_id` text NOT NULL,
	`from_branch` text,
	`to_branch` text NOT NULL,
	`note` text,
	`actor_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_vehicle_transfers_time` ON `vehicle_transfers` (`vehicle_id`,`created_at`);