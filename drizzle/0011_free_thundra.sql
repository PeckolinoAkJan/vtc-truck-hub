CREATE TABLE `board_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text,
	`author_id` text NOT NULL,
	`type` text DEFAULT 'post' NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`expires_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_board_vtc_status` ON `board_posts` (`vtc_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `content_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_comments_entity` ON `content_comments` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `content_reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reaction` text DEFAULT 'like' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_reaction_user` ON `content_reactions` (`entity_type`,`entity_id`,`user_id`,`reaction`);--> statement-breakpoint
CREATE TABLE `conversation_members` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`last_read_at` text,
	`muted` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_conversation_member` ON `conversation_members` (`conversation_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text,
	`type` text DEFAULT 'direct' NOT NULL,
	`title` text,
	`department_id` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_conversations_vtc` ON `conversations` (`vtc_id`,`type`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`attachment_upload_id` text,
	`edited_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_messages_conversation` ON `messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `news_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text NOT NULL,
	`author_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`category` text DEFAULT 'Allgemein' NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`cover_upload_id` text,
	`publish_at` text,
	`published_at` text,
	`archived_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_news_vtc_publish` ON `news_posts` (`vtc_id`,`status`,`publish_at`);--> statement-breakpoint
CREATE TABLE `partnerships` (
	`id` text PRIMARY KEY NOT NULL,
	`from_vtc_id` text NOT NULL,
	`to_vtc_id` text NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`contact_name` text,
	`agreement` text,
	`internal_notes` text,
	`starts_at` text,
	`ends_at` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_partnership_pair` ON `partnerships` (`from_vtc_id`,`to_vtc_id`);--> statement-breakpoint
CREATE INDEX `idx_partnership_status` ON `partnerships` (`to_vtc_id`,`status`);--> statement-breakpoint
CREATE TABLE `poll_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`poll_id` text NOT NULL,
	`user_id` text NOT NULL,
	`option_index` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_poll_vote` ON `poll_votes` (`poll_id`,`user_id`,`option_index`);--> statement-breakpoint
CREATE TABLE `polls` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`question` text NOT NULL,
	`options` text NOT NULL,
	`multiple` integer DEFAULT false NOT NULL,
	`closes_at` text,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_polls_entity` ON `polls` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `team_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`assigned_to` text,
	`department_id` text,
	`priority` text DEFAULT 'normal' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`due_at` text,
	`checklist` text DEFAULT '[]' NOT NULL,
	`recurrence` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tasks_vtc_status` ON `team_tasks` (`vtc_id`,`status`,`due_at`);