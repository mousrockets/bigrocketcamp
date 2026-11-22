ALTER TABLE `player_ranks` ADD `best_mmr` integer;--> statement-breakpoint
ALTER TABLE `player_ranks` ADD `best_tier` integer;--> statement-breakpoint
ALTER TABLE `player_ranks` ADD `best_division` integer;--> statement-breakpoint
-- The best rating starts from the highest one already read for the player's duo account, every season.
-- Raw SQL: SQLite's max() over several values gives NULL as soon as one is NULL, hence the -1 stand-in.
UPDATE `player_ranks` SET `best_mmr` = nullif(max(
	coalesce(`mmr`, -1),
	coalesce(`peak_mmr`, -1),
	coalesce((SELECT max(`mmr`) FROM `mmr_entries` WHERE `mmr_entries`.`player` = `player_ranks`.`player`), -1)
), -1);--> statement-breakpoint
-- Its rank comes from a reading of the same rating: the current one, the season peak, or the newest in the history.
UPDATE `player_ranks` SET
	`best_tier` = CASE
		WHEN `mmr` = `best_mmr` THEN `tier`
		WHEN `peak_mmr` = `best_mmr` THEN `peak_tier`
		ELSE (
			SELECT `tier` FROM `mmr_entries`
			WHERE `mmr_entries`.`player` = `player_ranks`.`player` AND `mmr_entries`.`mmr` = `player_ranks`.`best_mmr`
			ORDER BY `recorded_at` DESC, `rowid` DESC LIMIT 1
		)
	END,
	`best_division` = CASE
		WHEN `mmr` = `best_mmr` THEN `division`
		WHEN `peak_mmr` = `best_mmr` THEN `peak_division`
		ELSE (
			SELECT `division` FROM `mmr_entries`
			WHERE `mmr_entries`.`player` = `player_ranks`.`player` AND `mmr_entries`.`mmr` = `player_ranks`.`best_mmr`
			ORDER BY `recorded_at` DESC, `rowid` DESC LIMIT 1
		)
	END
WHERE `best_mmr` IS NOT NULL;
