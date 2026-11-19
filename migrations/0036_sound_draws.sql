CREATE TABLE `sound_draws` (
	`exercise_id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`sound` text NOT NULL,
	`drawn` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sound_draws_member` ON `sound_draws` (`member_id`);