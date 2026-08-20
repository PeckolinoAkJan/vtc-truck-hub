CREATE TABLE `media_albums` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`visibility` text DEFAULT 'public' NOT NULL,
	`event_id` text,
	`cover_upload_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_media_albums_vtc` ON `media_albums` (`vtc_id`,`visibility`);--> statement-breakpoint
CREATE TABLE `media_items` (
	`id` text PRIMARY KEY NOT NULL,
	`album_id` text,
	`upload_id` text NOT NULL,
	`vtc_id` text,
	`owner_id` text NOT NULL,
	`caption` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`event_id` text,
	`trip_id` text,
	`vehicle_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_media_item_upload` ON `media_items` (`upload_id`);--> statement-breakpoint
CREATE INDEX `idx_media_items_vtc_status` ON `media_items` (`vtc_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `upload_metadata` (
	`upload_id` text PRIMARY KEY NOT NULL,
	`purpose` text NOT NULL,
	`status` text DEFAULT 'approved' NOT NULL,
	`sha256` text NOT NULL,
	`moderated_by` text,
	`moderated_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_upload_metadata_status` ON `upload_metadata` (`purpose`,`status`);--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`avatar_upload_id` text,
	`bio` text,
	`main_game` text,
	`social_links` text DEFAULT '{}' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
