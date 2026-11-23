CREATE TABLE `tournament_wins` (
	`match_guid` text PRIMARY KEY NOT NULL,
	`declared` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
-- The board counts the pushups with the tournaments won: it follows them like its other small parts.
CREATE TRIGGER `tournament_wins_insert` AFTER INSERT ON `tournament_wins` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `tournament_wins_update` AFTER UPDATE ON `tournament_wins` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `tournament_wins_delete` AFTER DELETE ON `tournament_wins` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
