CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text,
	`user_id` text,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`secret_hash` text NOT NULL,
	`scopes` text DEFAULT '[]' NOT NULL,
	`rate_limit` integer DEFAULT 120 NOT NULL,
	`last_used_at` text,
	`expires_at` text,
	`revoked_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_api_key_prefix` ON `api_keys` (`prefix`);--> statement-breakpoint
CREATE INDEX `idx_api_keys_vtc` ON `api_keys` (`vtc_id`,`revoked_at`);--> statement-breakpoint
CREATE TABLE `api_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`api_key_id` text,
	`request_id` text NOT NULL,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`status` integer NOT NULL,
	`duration_ms` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_api_requests_key_time` ON `api_requests` (`api_key_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `notification_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`notification_id` text NOT NULL,
	`channel` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`delivered_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_notification_delivery_status` ON `notification_deliveries` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`event_type` text NOT NULL,
	`website` integer DEFAULT true NOT NULL,
	`email` integer DEFAULT false NOT NULL,
	`discord` integer DEFAULT false NOT NULL,
	`push` integer DEFAULT false NOT NULL,
	`desktop` integer DEFAULT true NOT NULL,
	`mobile` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_notification_pref` ON `notification_preferences` (`user_id`,`event_type`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`keys` text NOT NULL,
	`user_agent` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_push_endpoint` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE TABLE `security_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`type` text NOT NULL,
	`severity` text DEFAULT 'info' NOT NULL,
	`ip_hash` text,
	`device` text,
	`detail` text DEFAULT '{}' NOT NULL,
	`resolved_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_security_user_time` ON `security_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `truckersmp_links` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`vtc_id` text,
	`truckersmp_id` text NOT NULL,
	`type` text NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	`remote_data` text DEFAULT '{}' NOT NULL,
	`last_synced_at` text,
	`sync_error` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tmp_link` ON `truckersmp_links` (`type`,`truckersmp_id`);--> statement-breakpoint
CREATE INDEX `idx_tmp_vtc` ON `truckersmp_links` (`vtc_id`);--> statement-breakpoint
CREATE TABLE `truckersmp_sync_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`link_id` text NOT NULL,
	`status` text NOT NULL,
	`message` text,
	`changes` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tmp_sync_time` ON `truckersmp_sync_logs` (`link_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`webhook_id` text NOT NULL,
	`event` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`response_status` integer,
	`last_error` text,
	`next_attempt_at` text,
	`delivered_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_webhook_delivery_retry` ON `webhook_deliveries` (`status`,`next_attempt_at`);