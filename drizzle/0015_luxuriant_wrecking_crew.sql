CREATE TABLE `account_security` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email_verified_at` text,
	`two_factor_secret` text,
	`recovery_codes` text DEFAULT '[]' NOT NULL,
	`failed_logins` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`deletion_requested_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `account_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_account_token_hash` ON `account_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_account_tokens_user` ON `account_tokens` (`user_id`,`type`);--> statement-breakpoint
CREATE TABLE `email_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`recipient` text NOT NULL,
	`template` text NOT NULL,
	`subject` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`sent_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_email_outbox_status` ON `email_outbox` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `user_consents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`version` text NOT NULL,
	`accepted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`withdrawn_at` text,
	`ip_hash` text
);
--> statement-breakpoint
CREATE INDEX `idx_user_consents_user` ON `user_consents` (`user_id`,`type`);