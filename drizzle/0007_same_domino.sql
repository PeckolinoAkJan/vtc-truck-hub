CREATE TABLE `budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text NOT NULL,
	`name` text NOT NULL,
	`cost_center` text NOT NULL,
	`period` text NOT NULL,
	`limit_cents` integer NOT NULL,
	`spent_cents` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_budgets_vtc_center_period` ON `budgets` (`vtc_id`,`cost_center`,`period`);--> statement-breakpoint
CREATE TABLE `finance_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'operating' NOT NULL,
	`currency` text DEFAULT 'V€' NOT NULL,
	`balance_cents` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_finance_accounts_vtc` ON `finance_accounts` (`vtc_id`,`active`);--> statement-breakpoint
CREATE TABLE `finance_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`category` text NOT NULL,
	`cost_center` text,
	`description` text NOT NULL,
	`reference_type` text,
	`reference_id` text,
	`status` text DEFAULT 'posted' NOT NULL,
	`reversal_of` text,
	`created_by` text NOT NULL,
	`booked_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_finance_entries_account_time` ON `finance_entries` (`account_id`,`booked_at`);--> statement-breakpoint
CREATE TABLE `payroll_models` (
	`id` text PRIMARY KEY NOT NULL,
	`vtc_id` text NOT NULL,
	`name` text NOT NULL,
	`role_id` text,
	`department_id` text,
	`base_salary_cents` integer DEFAULT 0 NOT NULL,
	`cents_per_km` integer DEFAULT 45 NOT NULL,
	`cents_per_job` integer DEFAULT 2500 NOT NULL,
	`cents_per_hour` integer DEFAULT 0 NOT NULL,
	`weight_factor` real DEFAULT 0 NOT NULL,
	`bonus_rules` text DEFAULT '{}' NOT NULL,
	`deduction_rules` text DEFAULT '{}' NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_payroll_models_vtc` ON `payroll_models` (`vtc_id`,`active`);