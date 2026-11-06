-- A member pairs the Windows collector with a short code shown on their profile.
-- Only hashes are stored: a copy of the database can neither pair a collector nor send in its name.
CREATE TABLE `collector_pairing_codes` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL UNIQUE REFERENCES `members`(`id`) ON DELETE CASCADE,
	`expires` integer NOT NULL,
	`attempts` integer NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE `collector_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL UNIQUE,
	`member_id` text NOT NULL REFERENCES `members`(`id`) ON DELETE CASCADE,
	`created` integer NOT NULL,
	`last_seen` integer
);
--> statement-breakpoint
CREATE INDEX `collector_devices_member` ON `collector_devices` (`member_id`);
