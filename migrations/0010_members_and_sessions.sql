-- Members sign in with their e-mail address and a one-time code.
-- A member's id keeps the identifier the prototype used for them, so their data stays theirs.
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL UNIQUE,
	`created` text NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE `sign_in_codes` (
	`email` text PRIMARY KEY NOT NULL,
	`code_hash` text NOT NULL,
	`expires` integer NOT NULL,
	`attempts` integer NOT NULL DEFAULT 0,
	`sent` integer NOT NULL
);
-- Only a hash of the session token is stored: a copy of the database cannot open a session.
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL REFERENCES `members`(`id`) ON DELETE CASCADE,
	`expires` integer NOT NULL
);
CREATE INDEX `sessions_member` ON `sessions` (`member_id`);
