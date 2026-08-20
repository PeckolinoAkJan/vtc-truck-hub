CREATE TABLE `dispatch_history` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`detail` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_dispatch_history_order` ON `dispatch_history` (`order_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `dispatch_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text NOT NULL,
	`title` text NOT NULL,
	`game` text NOT NULL,
	`mode` text DEFAULT 'any' NOT NULL,
	`source_city` text NOT NULL,
	`source_company` text,
	`destination_city` text NOT NULL,
	`destination_company` text,
	`cargo` text NOT NULL,
	`min_weight` real,
	`max_weight` real,
	`allowed_trucks` text DEFAULT '[]' NOT NULL,
	`allowed_trailers` text DEFAULT '[]' NOT NULL,
	`starts_at` text,
	`due_at` text,
	`priority` text DEFAULT 'normal' NOT NULL,
	`bonus_cents` integer DEFAULT 0 NOT NULL,
	`penalty_cents` integer DEFAULT 0 NOT NULL,
	`minimum_km` real,
	`maximum_damage` real,
	`maximum_speed` real,
	`screenshot_required` integer DEFAULT false NOT NULL,
	`notes` text,
	`recurring_rule` text,
	`series_id` text,
	`contract_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`assigned_user_id` text,
	`reserved_by` text,
	`reserved_at` text,
	`trip_id` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_dispatch_vtc_status` ON `dispatch_orders` (`vtc_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_dispatch_driver_status` ON `dispatch_orders` (`assigned_user_id`,`status`);