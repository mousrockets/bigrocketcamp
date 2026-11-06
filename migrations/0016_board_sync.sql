-- The board follows one counter: every change it shows moves it, so an open board that sees no change
-- reads one row, and a board that falls behind reads only the rows changed since its last visit.
CREATE TABLE `sync_state` (
	`id` integer PRIMARY KEY NOT NULL CHECK (`id` = 1),
	`version` integer NOT NULL,
	-- The roster and confirmed game IDs the stored match results were built with.
	`match_basis` text
);
--> statement-breakpoint
-- Match results as the board shows them, rebuilt from their sources each time a match receives one.
CREATE TABLE `match_results` (
	`match_guid` text NOT NULL,
	`player_id` text NOT NULL,
	`name` text NOT NULL,
	`day` text NOT NULL,
	`kind` text NOT NULL,
	`team` integer NOT NULL,
	`winner` integer NOT NULL,
	`score` integer NOT NULL,
	`goals` integer NOT NULL,
	`assists` integer NOT NULL,
	`saves` integer NOT NULL,
	`received` text NOT NULL,
	`review_required` integer NOT NULL,
	`verification` text NOT NULL,
	`source_types` text NOT NULL,
	`selected_source` text NOT NULL,
	`source_difference` text,
	-- Set on every row of a match whose full scoreboard a source confirmed.
	`expected_players` integer,
	`seq` integer NOT NULL DEFAULT 0,
	PRIMARY KEY (`match_guid`, `player_id`)
);
--> statement-breakpoint
CREATE INDEX `match_results_seq` ON `match_results` (`seq`);
--> statement-breakpoint
-- Each source received for a match moves its revision; its stored results reflect `built_revision`.
CREATE TABLE `match_builds` (
	`match_guid` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`built_revision` integer
);
--> statement-breakpoint
CREATE INDEX `match_builds_pending` ON `match_builds` (`match_guid`) WHERE `built_revision` IS NOT `revision`;
--> statement-breakpoint
-- What left the board since a given version, for the boards that saw it.
CREATE TABLE `sync_removals` (
	`seq` integer PRIMARY KEY NOT NULL,
	`collection` text NOT NULL,
	`key` text NOT NULL,
	`subkey` text
);
--> statement-breakpoint
ALTER TABLE `exercises` ADD `seq` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `exercise_reactions` ADD `seq` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
-- Existing rows get distinct versions, so that a board can read them page by page.
UPDATE `exercises` SET `seq` = `rowid`;
--> statement-breakpoint
UPDATE `exercise_reactions` SET `seq` = (SELECT COALESCE(MAX(`rowid`), 0) FROM `exercises`) + `rowid`;
--> statement-breakpoint
INSERT INTO `sync_state` (`id`, `version`, `match_basis`) VALUES (1,
	(SELECT COALESCE(MAX(`rowid`), 0) FROM `exercises`) + (SELECT COALESCE(MAX(`rowid`), 0) FROM `exercise_reactions`) + 1, NULL);
--> statement-breakpoint
CREATE INDEX `exercises_seq` ON `exercises` (`seq`);
--> statement-breakpoint
CREATE INDEX `exercises_author` ON `exercises` (`author`);
--> statement-breakpoint
CREATE INDEX `exercise_reactions_seq` ON `exercise_reactions` (`seq`);
--> statement-breakpoint
CREATE INDEX `result_observations_match` ON `result_observations` (`match_guid`);
--> statement-breakpoint
CREATE INDEX `source_reports_match` ON `source_reports` (`match_guid`);
--> statement-breakpoint
-- The prototype's results kept the match ID as received: the board groups them case-insensitively.
CREATE INDEX `results_match_key` ON `results` (lower(trim(`match_guid`)));
--> statement-breakpoint
CREATE INDEX `match_rosters_match_key` ON `match_rosters` (lower(trim(`match_guid`)));
--> statement-breakpoint
CREATE INDEX `mmr_entries_player_recorded` ON `mmr_entries` (`player`, `recorded_at`);
--> statement-breakpoint
-- Every match already received is built once, by the first board that opens.
INSERT INTO `match_builds` (`match_guid`, `revision`, `built_revision`)
SELECT DISTINCT `guid`, 1, NULL FROM (
	SELECT `match_guid` AS `guid` FROM `result_observations`
	UNION SELECT `match_guid` FROM `source_reports`
	UNION SELECT lower(trim(`match_guid`)) FROM `results`
	UNION SELECT lower(trim(`match_guid`)) FROM `match_rosters`
);
--> statement-breakpoint
CREATE TRIGGER `result_observations_insert` AFTER INSERT ON `result_observations` BEGIN
	INSERT INTO `match_builds` (`match_guid`, `revision`) VALUES (NEW.`match_guid`, 1)
		ON CONFLICT (`match_guid`) DO UPDATE SET `revision` = `revision` + 1;
END;
--> statement-breakpoint
CREATE TRIGGER `result_observations_update` AFTER UPDATE ON `result_observations` BEGIN
	INSERT INTO `match_builds` (`match_guid`, `revision`) VALUES (NEW.`match_guid`, 1)
		ON CONFLICT (`match_guid`) DO UPDATE SET `revision` = `revision` + 1;
END;
--> statement-breakpoint
CREATE TRIGGER `result_observations_delete` AFTER DELETE ON `result_observations` BEGIN
	INSERT INTO `match_builds` (`match_guid`, `revision`) VALUES (OLD.`match_guid`, 1)
		ON CONFLICT (`match_guid`) DO UPDATE SET `revision` = `revision` + 1;
END;
--> statement-breakpoint
CREATE TRIGGER `source_reports_insert` AFTER INSERT ON `source_reports` BEGIN
	INSERT INTO `match_builds` (`match_guid`, `revision`) VALUES (NEW.`match_guid`, 1)
		ON CONFLICT (`match_guid`) DO UPDATE SET `revision` = `revision` + 1;
END;
--> statement-breakpoint
CREATE TRIGGER `source_reports_update` AFTER UPDATE ON `source_reports` BEGIN
	INSERT INTO `match_builds` (`match_guid`, `revision`) VALUES (NEW.`match_guid`, 1)
		ON CONFLICT (`match_guid`) DO UPDATE SET `revision` = `revision` + 1;
END;
--> statement-breakpoint
CREATE TRIGGER `source_reports_delete` AFTER DELETE ON `source_reports` BEGIN
	INSERT INTO `match_builds` (`match_guid`, `revision`) VALUES (OLD.`match_guid`, 1)
		ON CONFLICT (`match_guid`) DO UPDATE SET `revision` = `revision` + 1;
END;
--> statement-breakpoint
CREATE TRIGGER `results_insert` AFTER INSERT ON `results` BEGIN
	INSERT INTO `match_builds` (`match_guid`, `revision`) VALUES (lower(trim(NEW.`match_guid`)), 1)
		ON CONFLICT (`match_guid`) DO UPDATE SET `revision` = `revision` + 1;
END;
--> statement-breakpoint
CREATE TRIGGER `results_update` AFTER UPDATE ON `results` BEGIN
	INSERT INTO `match_builds` (`match_guid`, `revision`) VALUES (lower(trim(NEW.`match_guid`)), 1)
		ON CONFLICT (`match_guid`) DO UPDATE SET `revision` = `revision` + 1;
	INSERT INTO `match_builds` (`match_guid`, `revision`) VALUES (lower(trim(OLD.`match_guid`)), 1)
		ON CONFLICT (`match_guid`) DO UPDATE SET `revision` = `revision` + 1;
END;
--> statement-breakpoint
CREATE TRIGGER `results_delete` AFTER DELETE ON `results` BEGIN
	INSERT INTO `match_builds` (`match_guid`, `revision`) VALUES (lower(trim(OLD.`match_guid`)), 1)
		ON CONFLICT (`match_guid`) DO UPDATE SET `revision` = `revision` + 1;
END;
--> statement-breakpoint
CREATE TRIGGER `match_rosters_insert` AFTER INSERT ON `match_rosters` BEGIN
	INSERT INTO `match_builds` (`match_guid`, `revision`) VALUES (lower(trim(NEW.`match_guid`)), 1)
		ON CONFLICT (`match_guid`) DO UPDATE SET `revision` = `revision` + 1;
END;
--> statement-breakpoint
CREATE TRIGGER `match_rosters_update` AFTER UPDATE ON `match_rosters` BEGIN
	INSERT INTO `match_builds` (`match_guid`, `revision`) VALUES (lower(trim(NEW.`match_guid`)), 1)
		ON CONFLICT (`match_guid`) DO UPDATE SET `revision` = `revision` + 1;
END;
--> statement-breakpoint
CREATE TRIGGER `match_rosters_delete` AFTER DELETE ON `match_rosters` BEGIN
	INSERT INTO `match_builds` (`match_guid`, `revision`) VALUES (lower(trim(OLD.`match_guid`)), 1)
		ON CONFLICT (`match_guid`) DO UPDATE SET `revision` = `revision` + 1;
END;
--> statement-breakpoint
-- Rows a board receives one by one carry the version of their last change.
CREATE TRIGGER `match_results_insert` AFTER INSERT ON `match_results` BEGIN
	UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1;
	UPDATE `match_results` SET `seq` = (SELECT `version` FROM `sync_state` WHERE `id` = 1) WHERE `rowid` = NEW.`rowid`;
END;
--> statement-breakpoint
CREATE TRIGGER `match_results_update` AFTER UPDATE OF `name`, `day`, `kind`, `team`, `winner`, `score`, `goals`, `assists`, `saves`, `received`, `review_required`, `verification`, `source_types`, `selected_source`, `source_difference`, `expected_players` ON `match_results` BEGIN
	UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1;
	UPDATE `match_results` SET `seq` = (SELECT `version` FROM `sync_state` WHERE `id` = 1) WHERE `rowid` = NEW.`rowid`;
END;
--> statement-breakpoint
CREATE TRIGGER `match_results_delete` AFTER DELETE ON `match_results` BEGIN
	UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1;
	INSERT INTO `sync_removals` (`seq`, `collection`, `key`, `subkey`)
		VALUES ((SELECT `version` FROM `sync_state` WHERE `id` = 1), 'results', OLD.`match_guid`, OLD.`player_id`);
END;
--> statement-breakpoint
CREATE TRIGGER `exercises_insert` AFTER INSERT ON `exercises` BEGIN
	UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1;
	UPDATE `exercises` SET `seq` = (SELECT `version` FROM `sync_state` WHERE `id` = 1) WHERE `rowid` = NEW.`rowid`;
END;
--> statement-breakpoint
CREATE TRIGGER `exercises_update` AFTER UPDATE OF `player`, `count`, `day`, `created`, `author`, `type` ON `exercises` BEGIN
	UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1;
	UPDATE `exercises` SET `seq` = (SELECT `version` FROM `sync_state` WHERE `id` = 1) WHERE `rowid` = NEW.`rowid`;
END;
--> statement-breakpoint
CREATE TRIGGER `exercises_delete` AFTER DELETE ON `exercises` BEGIN
	UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1;
	INSERT INTO `sync_removals` (`seq`, `collection`, `key`, `subkey`)
		VALUES ((SELECT `version` FROM `sync_state` WHERE `id` = 1), 'exercises', OLD.`id`, NULL);
END;
--> statement-breakpoint
CREATE TRIGGER `exercise_reactions_insert` AFTER INSERT ON `exercise_reactions` BEGIN
	UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1;
	UPDATE `exercise_reactions` SET `seq` = (SELECT `version` FROM `sync_state` WHERE `id` = 1) WHERE `rowid` = NEW.`rowid`;
END;
--> statement-breakpoint
CREATE TRIGGER `exercise_reactions_update` AFTER UPDATE OF `exercise_id`, `author`, `emoji`, `created` ON `exercise_reactions` BEGIN
	UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1;
	UPDATE `exercise_reactions` SET `seq` = (SELECT `version` FROM `sync_state` WHERE `id` = 1) WHERE `rowid` = NEW.`rowid`;
	INSERT INTO `sync_removals` (`seq`, `collection`, `key`, `subkey`)
		VALUES ((SELECT `version` FROM `sync_state` WHERE `id` = 1), 'reactions', OLD.`exercise_id`, NULL);
END;
--> statement-breakpoint
CREATE TRIGGER `exercise_reactions_delete` AFTER DELETE ON `exercise_reactions` BEGIN
	UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1;
	INSERT INTO `sync_removals` (`seq`, `collection`, `key`, `subkey`)
		VALUES ((SELECT `version` FROM `sync_state` WHERE `id` = 1), 'reactions', OLD.`exercise_id`, NULL);
END;
--> statement-breakpoint
-- The rest of the board is small and sent whole after any change: these tables only move the counter.
CREATE TRIGGER `collectors_insert` AFTER INSERT ON `collectors` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `collectors_update` AFTER UPDATE ON `collectors` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `collectors_delete` AFTER DELETE ON `collectors` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `player_ranks_insert` AFTER INSERT ON `player_ranks` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `player_ranks_update` AFTER UPDATE ON `player_ranks` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `player_ranks_delete` AFTER DELETE ON `player_ranks` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `mmr_entries_insert` AFTER INSERT ON `mmr_entries` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `mmr_entries_update` AFTER UPDATE ON `mmr_entries` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `mmr_entries_delete` AFTER DELETE ON `mmr_entries` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `monthly_mmr_results_insert` AFTER INSERT ON `monthly_mmr_results` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `monthly_mmr_results_update` AFTER UPDATE ON `monthly_mmr_results` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `monthly_mmr_results_delete` AFTER DELETE ON `monthly_mmr_results` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `monthly_mmr_policy_insert` AFTER INSERT ON `monthly_mmr_policy` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `monthly_mmr_policy_update` AFTER UPDATE ON `monthly_mmr_policy` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `monthly_mmr_policy_delete` AFTER DELETE ON `monthly_mmr_policy` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `drink_debts_insert` AFTER INSERT ON `drink_debts` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `drink_debts_update` AFTER UPDATE ON `drink_debts` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `drink_debts_delete` AFTER DELETE ON `drink_debts` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `members_insert` AFTER INSERT ON `members` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `members_update` AFTER UPDATE ON `members` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `members_delete` AFTER DELETE ON `members` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `player_identities_insert` AFTER INSERT ON `player_identities` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `player_identities_update` AFTER UPDATE ON `player_identities` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `player_identities_delete` AFTER DELETE ON `player_identities` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `player_identity_aliases_insert` AFTER INSERT ON `player_identity_aliases` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `player_identity_aliases_update` AFTER UPDATE ON `player_identity_aliases` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `player_identity_aliases_delete` AFTER DELETE ON `player_identity_aliases` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
