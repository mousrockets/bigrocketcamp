CREATE TABLE `match_departures` (
	`id` text PRIMARY KEY NOT NULL,
	`match_guid` text NOT NULL,
	`player_id` text NOT NULL,
	`source_id` text NOT NULL,
	`source_type` text NOT NULL,
	`payload` text NOT NULL,
	`received` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `match_departures_match` ON `match_departures` (`match_guid`);--> statement-breakpoint
ALTER TABLE `match_results` ADD `left_early` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `source_reports` ADD `opponents_gone` integer;--> statement-breakpoint
-- A departure is a source of its match like a scoreboard: receiving one asks for the match to be rebuilt.
CREATE TRIGGER `match_departures_insert` AFTER INSERT ON `match_departures` BEGIN
	INSERT INTO `match_builds` (`match_guid`, `revision`) VALUES (NEW.`match_guid`, 1)
		ON CONFLICT (`match_guid`) DO UPDATE SET `revision` = `revision` + 1;
END;
--> statement-breakpoint
CREATE TRIGGER `match_departures_update` AFTER UPDATE ON `match_departures` BEGIN
	INSERT INTO `match_builds` (`match_guid`, `revision`) VALUES (NEW.`match_guid`, 1)
		ON CONFLICT (`match_guid`) DO UPDATE SET `revision` = `revision` + 1;
END;
--> statement-breakpoint
CREATE TRIGGER `match_departures_delete` AFTER DELETE ON `match_departures` BEGIN
	INSERT INTO `match_builds` (`match_guid`, `revision`) VALUES (OLD.`match_guid`, 1)
		ON CONFLICT (`match_guid`) DO UPDATE SET `revision` = `revision` + 1;
END;
--> statement-breakpoint
-- The board follows a departure like the row's other columns: a rebuild that learns it moves the row's version.
DROP TRIGGER `match_results_update`;--> statement-breakpoint
CREATE TRIGGER `match_results_update` AFTER UPDATE OF `name`, `day`, `kind`, `team`, `winner`, `score`, `goals`, `assists`, `saves`, `received`, `review_required`, `verification`, `source_types`, `selected_source`, `source_difference`, `expected_players`, `forfeit`, `overtime`, `left_early` ON `match_results` BEGIN
	UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1;
	UPDATE `match_results` SET `seq` = (SELECT `version` FROM `sync_state` WHERE `id` = 1) WHERE `rowid` = NEW.`rowid`;
END;
