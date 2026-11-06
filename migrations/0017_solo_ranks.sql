CREATE TABLE `solo_mmr_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`player` text NOT NULL,
	`player_id` text NOT NULL,
	`mmr` integer NOT NULL,
	`tier` integer,
	`division` integer,
	`recorded_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `solo_mmr_entries_player_recorded` ON `solo_mmr_entries` (`player`,`recorded_at`);--> statement-breakpoint
CREATE TABLE `solo_ranks` (
	`player` text PRIMARY KEY NOT NULL,
	`player_id` text,
	`mmr` integer,
	`tier` integer,
	`division` integer,
	`matches_played` integer,
	`fetched_at` text,
	`status` text NOT NULL,
	`season` integer,
	`peak_mmr` integer,
	`peak_tier` integer,
	`peak_division` integer,
	`peak_at` text
);
--> statement-breakpoint
ALTER TABLE `members` ADD `solo_player_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `members_solo_player_id` ON `members` (`solo_player_id`);--> statement-breakpoint
ALTER TABLE `player_ranks` ADD `season` integer;--> statement-breakpoint
ALTER TABLE `player_ranks` ADD `peak_mmr` integer;--> statement-breakpoint
ALTER TABLE `player_ranks` ADD `peak_tier` integer;--> statement-breakpoint
ALTER TABLE `player_ranks` ADD `peak_division` integer;--> statement-breakpoint
ALTER TABLE `player_ranks` ADD `peak_at` text;--> statement-breakpoint
-- The board follows the solo ranks like the duo ones.
CREATE TRIGGER `solo_ranks_insert` AFTER INSERT ON `solo_ranks` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `solo_ranks_update` AFTER UPDATE ON `solo_ranks` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `solo_ranks_delete` AFTER DELETE ON `solo_ranks` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `solo_mmr_entries_insert` AFTER INSERT ON `solo_mmr_entries` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `solo_mmr_entries_update` AFTER UPDATE ON `solo_mmr_entries` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `solo_mmr_entries_delete` AFTER DELETE ON `solo_mmr_entries` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
-- Each card's season peak starts from the readings already held: since migration 0015 they all come from the
-- rank source, which began reading during season 24. Ties go to the earliest reading.
UPDATE `player_ranks` SET `season` = 24, `peak_mmr` = `best`.`mmr`, `peak_tier` = `best`.`tier`, `peak_division` = `best`.`division`, `peak_at` = `best`.`recorded_at`
FROM (
	SELECT `entry`.`player`, `entry`.`mmr`, `entry`.`tier`, `entry`.`division`, `entry`.`recorded_at` FROM `mmr_entries` AS `entry`
	WHERE `entry`.`rowid` = (SELECT `rowid` FROM `mmr_entries` WHERE `player` = `entry`.`player` ORDER BY `mmr` DESC, `recorded_at`, `rowid` LIMIT 1)
) AS `best`
WHERE `best`.`player` = `player_ranks`.`player`;
