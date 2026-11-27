CREATE TABLE `play_sessions` (
	`player` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`started_at` text NOT NULL,
	`stopped_at` text,
	`start_duo_mmr` integer,
	`start_solo_mmr` integer,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- A session started or stopped wakes the board, which shows it in Matchs.
CREATE TRIGGER `play_sessions_insert` AFTER INSERT ON `play_sessions` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `play_sessions_update` AFTER UPDATE ON `play_sessions` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `play_sessions_delete` AFTER DELETE ON `play_sessions` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
