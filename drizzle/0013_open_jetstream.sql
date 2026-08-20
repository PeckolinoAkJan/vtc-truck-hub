CREATE TABLE `article_acknowledgements` (
	`id` text PRIMARY KEY NOT NULL,
	`article_id` text NOT NULL,
	`user_id` text NOT NULL,
	`version` integer NOT NULL,
	`acknowledged_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_article_ack` ON `article_acknowledgements` (`article_id`,`user_id`,`version`);--> statement-breakpoint
CREATE TABLE `backup_records` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`location` text,
	`size` integer,
	`checksum` text,
	`started_at` text,
	`completed_at` text,
	`verified_at` text,
	`created_by` text
);
--> statement-breakpoint
CREATE INDEX `idx_backups_status_time` ON `backup_records` (`status`,`completed_at`);--> statement-breakpoint
CREATE TABLE `client_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`product` text NOT NULL,
	`version` text NOT NULL,
	`channel` text DEFAULT 'stable' NOT NULL,
	`minimum` integer DEFAULT false NOT NULL,
	`mandatory` integer DEFAULT false NOT NULL,
	`download_url` text,
	`checksum` text,
	`release_notes` text,
	`compatibility` text DEFAULT '{}' NOT NULL,
	`published_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_client_product_version` ON `client_versions` (`product`,`version`);--> statement-breakpoint
CREATE TABLE `downloads` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`description` text,
	`upload_id` text,
	`external_url` text,
	`version` text,
	`dependencies` text DEFAULT '[]' NOT NULL,
	`dlc_requirements` text DEFAULT '[]' NOT NULL,
	`game_versions` text DEFAULT '[]' NOT NULL,
	`checksum` text,
	`approved` integer DEFAULT false NOT NULL,
	`download_count` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_downloads_type_approved` ON `downloads` (`type`,`approved`);--> statement-breakpoint
CREATE TABLE `feature_flags` (
	`key` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`enabled` integer DEFAULT false NOT NULL,
	`environment` text DEFAULT 'production' NOT NULL,
	`updated_by` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `knowledge_articles` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`body` text NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`requires_acknowledgement` integer DEFAULT false NOT NULL,
	`published` integer DEFAULT false NOT NULL,
	`author_id` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_knowledge_slug_vtc` ON `knowledge_articles` (`vtc_id`,`slug`);--> statement-breakpoint
CREATE INDEX `idx_knowledge_category` ON `knowledge_articles` (`category`,`published`);--> statement-breakpoint
CREATE TABLE `moderation_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`moderator_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_moderation_entity_time` ON `moderation_actions` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `system_services` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'unknown' NOT NULL,
	`version` text,
	`message` text,
	`last_checked_at` text,
	`metadata` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_system_service_name` ON `system_services` (`name`);--> statement-breakpoint
CREATE TABLE `training_courses` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text,
	`title` text NOT NULL,
	`description` text,
	`category` text NOT NULL,
	`content` text DEFAULT '[]' NOT NULL,
	`questions` text DEFAULT '[]' NOT NULL,
	`passing_score` integer DEFAULT 80 NOT NULL,
	`certificate_name` text,
	`published` integer DEFAULT false NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_courses_vtc_published` ON `training_courses` (`vtc_id`,`published`);--> statement-breakpoint
CREATE TABLE `training_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`user_id` text NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`score` integer,
	`status` text DEFAULT 'started' NOT NULL,
	`trainer_id` text,
	`completed_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_training_progress` ON `training_progress` (`course_id`,`user_id`);