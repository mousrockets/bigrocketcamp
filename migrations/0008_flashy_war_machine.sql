CREATE TABLE `drink_debts` (
	`id` text PRIMARY KEY NOT NULL,
	`month` text NOT NULL,
	`payer` text NOT NULL,
	`recipient` text NOT NULL,
	`paid_at` text,
	`paid_by` text
);
--> statement-breakpoint
CREATE TABLE `mmr_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`player` text NOT NULL,
	`mmr` integer NOT NULL,
	`tier` integer,
	`division` integer,
	`author` text NOT NULL,
	`recorded_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `monthly_mmr_policy` (
	`id` integer PRIMARY KEY NOT NULL,
	`starts_month` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `monthly_mmr_results` (
	`month` text PRIMARY KEY NOT NULL,
	`cutoff_at` text NOT NULL,
	`closed_at` text NOT NULL,
	`status` text NOT NULL,
	`snapshot` text NOT NULL
);
--> statement-breakpoint
-- First competition month. No debt is created for earlier months or old Epic MMR.
INSERT INTO monthly_mmr_policy (id,starts_month) VALUES (1,'2026-11');
