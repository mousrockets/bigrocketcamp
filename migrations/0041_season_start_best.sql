ALTER TABLE `player_ranks` ADD `season_start_season` integer;--> statement-breakpoint
ALTER TABLE `player_ranks` ADD `season_start_best_mmr` integer;--> statement-breakpoint
ALTER TABLE `player_ranks` ADD `season_start_best_tier` integer;--> statement-breakpoint
ALTER TABLE `player_ranks` ADD `season_start_best_division` integer;--> statement-breakpoint
ALTER TABLE `solo_ranks` ADD `season_start_season` integer;--> statement-breakpoint
ALTER TABLE `solo_ranks` ADD `season_start_best_mmr` integer;--> statement-breakpoint
ALTER TABLE `solo_ranks` ADD `season_start_best_tier` integer;--> statement-breakpoint
ALTER TABLE `solo_ranks` ADD `season_start_best_division` integer;--> statement-breakpoint
-- Season 24 was under way: every account is marked as read in it, so that no later reading takes a best raised this
-- season for the one before it. The best before it is the best as it stands when the season's peak did not reach it;
-- a best the season reached may have been raised by it, and the one before stays unknown.
UPDATE `player_ranks` SET
	`season_start_season` = 24,
	`season_start_best_mmr` = CASE WHEN `best_mmr` > coalesce(`peak_mmr`, -1) OR `season` IS NOT 24 THEN `best_mmr` END,
	`season_start_best_tier` = CASE WHEN `best_mmr` > coalesce(`peak_mmr`, -1) OR `season` IS NOT 24 THEN `best_tier` END,
	`season_start_best_division` = CASE WHEN `best_mmr` > coalesce(`peak_mmr`, -1) OR `season` IS NOT 24 THEN `best_division` END;
--> statement-breakpoint
UPDATE `solo_ranks` SET
	`season_start_season` = 24,
	`season_start_best_mmr` = CASE WHEN `best_mmr` > coalesce(`peak_mmr`, -1) OR `season` IS NOT 24 THEN `best_mmr` END,
	`season_start_best_tier` = CASE WHEN `best_mmr` > coalesce(`peak_mmr`, -1) OR `season` IS NOT 24 THEN `best_tier` END,
	`season_start_best_division` = CASE WHEN `best_mmr` > coalesce(`peak_mmr`, -1) OR `season` IS NOT 24 THEN `best_division` END;
