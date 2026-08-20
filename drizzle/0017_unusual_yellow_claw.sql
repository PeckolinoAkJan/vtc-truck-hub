CREATE TABLE `user_profile_details` (
	`user_id` text PRIMARY KEY NOT NULL,
	`first_name` text,
	`last_name` text,
	`street` text,
	`postal_code` text,
	`city` text,
	`country` text,
	`phone` text,
	`public_display_name` integer DEFAULT true NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
