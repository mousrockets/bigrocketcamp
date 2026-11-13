ALTER TABLE `solo_ranks` ADD `best_tier` integer;--> statement-breakpoint
ALTER TABLE `solo_ranks` ADD `best_division` integer;--> statement-breakpoint
-- The best rating's rank comes from a reading of the same rating: the current one, the season peak, or the newest
-- one in the account's history. A best set by hand matches none of them and keeps no rank.
UPDATE `solo_ranks` SET
	`best_tier` = CASE
		WHEN `mmr` = `best_mmr` THEN `tier`
		WHEN `peak_mmr` = `best_mmr` THEN `peak_tier`
		ELSE (
			SELECT `tier` FROM `solo_mmr_entries`
			WHERE `solo_mmr_entries`.`player` = `solo_ranks`.`player`
				AND `solo_mmr_entries`.`player_id` = `solo_ranks`.`player_id`
				AND `solo_mmr_entries`.`mmr` = `solo_ranks`.`best_mmr`
			ORDER BY `recorded_at` DESC LIMIT 1
		)
	END,
	`best_division` = CASE
		WHEN `mmr` = `best_mmr` THEN `division`
		WHEN `peak_mmr` = `best_mmr` THEN `peak_division`
		ELSE (
			SELECT `division` FROM `solo_mmr_entries`
			WHERE `solo_mmr_entries`.`player` = `solo_ranks`.`player`
				AND `solo_mmr_entries`.`player_id` = `solo_ranks`.`player_id`
				AND `solo_mmr_entries`.`mmr` = `solo_ranks`.`best_mmr`
			ORDER BY `recorded_at` DESC LIMIT 1
		)
	END
WHERE `best_mmr` IS NOT NULL;
