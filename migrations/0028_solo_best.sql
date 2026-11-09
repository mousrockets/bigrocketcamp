ALTER TABLE `solo_ranks` ADD `best_mmr` integer;--> statement-breakpoint
-- The best rating starts from the highest one already read for the account the row holds, every season.
-- Raw SQL: SQLite's max() over several values gives NULL as soon as one is NULL, hence the -1 stand-in.
UPDATE `solo_ranks` SET `best_mmr` = nullif(max(
	coalesce(`mmr`, -1),
	coalesce(`peak_mmr`, -1),
	coalesce((
		SELECT max(`solo_mmr_entries`.`mmr`) FROM `solo_mmr_entries`
		WHERE `solo_mmr_entries`.`player` = `solo_ranks`.`player`
			AND `solo_mmr_entries`.`player_id` = `solo_ranks`.`player_id`
	), -1)
), -1);
