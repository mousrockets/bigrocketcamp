ALTER TABLE `match_results` ADD `forfeit` integer;--> statement-breakpoint
ALTER TABLE `match_results` ADD `overtime` integer;--> statement-breakpoint
ALTER TABLE `source_reports` ADD `time_seconds` integer;--> statement-breakpoint
ALTER TABLE `source_reports` ADD `overtime` integer;--> statement-breakpoint
-- The board follows how a match ended like its other columns: a rebuild that learns it moves the row's version.
DROP TRIGGER `match_results_update`;--> statement-breakpoint
CREATE TRIGGER `match_results_update` AFTER UPDATE OF `name`, `day`, `kind`, `team`, `winner`, `score`, `goals`, `assists`, `saves`, `received`, `review_required`, `verification`, `source_types`, `selected_source`, `source_difference`, `expected_players`, `forfeit`, `overtime` ON `match_results` BEGIN
	UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1;
	UPDATE `match_results` SET `seq` = (SELECT `version` FROM `sync_state` WHERE `id` = 1) WHERE `rowid` = NEW.`rowid`;
END;
