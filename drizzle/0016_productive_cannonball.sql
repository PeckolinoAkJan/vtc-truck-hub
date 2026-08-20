CREATE TABLE `discord_delivery_log` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`guild_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`discord_message_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_discord_delivery_trip_guild` ON `discord_delivery_log` (`trip_id`,`guild_id`);--> statement-breakpoint
CREATE INDEX `idx_discord_delivery_status` ON `discord_delivery_log` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `discord_guild_branding` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`display_name` text,
	`welcome_image_url` text,
	`rules_channel_id` text,
	`rules_title` text DEFAULT 'Regelwerk' NOT NULL,
	`rules_description` text,
	`rules_image_url` text,
	`rules_confirm_role_id` text,
	`rules_button_label` text DEFAULT 'Regeln bestätigen' NOT NULL,
	`rules_message_id` text,
	`delivery_channel_id` text,
	`announcement_image_url` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `discord_rule_acceptances` (
	`id` text PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`discord_user_id` text NOT NULL,
	`role_id` text NOT NULL,
	`accepted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_discord_rule_acceptance` ON `discord_rule_acceptances` (`guild_id`,`discord_user_id`,`role_id`);