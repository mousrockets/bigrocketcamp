-- Written by hand (drizzle-kit only asks interactively about renames). The prototype's frozen results say so
-- in their name, apart from match_results, which the board reads. Their rows do not change.
ALTER TABLE `results` RENAME TO `prototype_results`;
--> statement-breakpoint
ALTER TABLE `match_rosters` RENAME TO `prototype_match_rosters`;
--> statement-breakpoint
DROP INDEX `results_match_key`;
--> statement-breakpoint
CREATE INDEX `prototype_results_match_key` ON `prototype_results` (lower(trim(`match_guid`)));
--> statement-breakpoint
DROP INDEX `match_rosters_match_key`;
--> statement-breakpoint
CREATE INDEX `prototype_match_rosters_match_key` ON `prototype_match_rosters` (lower(trim(`match_guid`)));
--> statement-breakpoint
-- The triggers of migration 0016 followed the tables; their names follow too.
DROP TRIGGER `results_insert`;
--> statement-breakpoint
DROP TRIGGER `results_update`;
--> statement-breakpoint
DROP TRIGGER `results_delete`;
--> statement-breakpoint
DROP TRIGGER `match_rosters_insert`;
--> statement-breakpoint
DROP TRIGGER `match_rosters_update`;
--> statement-breakpoint
DROP TRIGGER `match_rosters_delete`;
--> statement-breakpoint
CREATE TRIGGER `prototype_results_insert` AFTER INSERT ON `prototype_results` BEGIN
	INSERT INTO `match_builds` (`match_guid`, `revision`) VALUES (lower(trim(NEW.`match_guid`)), 1)
		ON CONFLICT (`match_guid`) DO UPDATE SET `revision` = `revision` + 1;
END;
--> statement-breakpoint
CREATE TRIGGER `prototype_results_update` AFTER UPDATE ON `prototype_results` BEGIN
	INSERT INTO `match_builds` (`match_guid`, `revision`) VALUES (lower(trim(NEW.`match_guid`)), 1)
		ON CONFLICT (`match_guid`) DO UPDATE SET `revision` = `revision` + 1;
	INSERT INTO `match_builds` (`match_guid`, `revision`) VALUES (lower(trim(OLD.`match_guid`)), 1)
		ON CONFLICT (`match_guid`) DO UPDATE SET `revision` = `revision` + 1;
END;
--> statement-breakpoint
CREATE TRIGGER `prototype_results_delete` AFTER DELETE ON `prototype_results` BEGIN
	INSERT INTO `match_builds` (`match_guid`, `revision`) VALUES (lower(trim(OLD.`match_guid`)), 1)
		ON CONFLICT (`match_guid`) DO UPDATE SET `revision` = `revision` + 1;
END;
--> statement-breakpoint
CREATE TRIGGER `prototype_match_rosters_insert` AFTER INSERT ON `prototype_match_rosters` BEGIN
	INSERT INTO `match_builds` (`match_guid`, `revision`) VALUES (lower(trim(NEW.`match_guid`)), 1)
		ON CONFLICT (`match_guid`) DO UPDATE SET `revision` = `revision` + 1;
END;
--> statement-breakpoint
CREATE TRIGGER `prototype_match_rosters_update` AFTER UPDATE ON `prototype_match_rosters` BEGIN
	INSERT INTO `match_builds` (`match_guid`, `revision`) VALUES (lower(trim(NEW.`match_guid`)), 1)
		ON CONFLICT (`match_guid`) DO UPDATE SET `revision` = `revision` + 1;
	INSERT INTO `match_builds` (`match_guid`, `revision`) VALUES (lower(trim(OLD.`match_guid`)), 1)
		ON CONFLICT (`match_guid`) DO UPDATE SET `revision` = `revision` + 1;
END;
--> statement-breakpoint
CREATE TRIGGER `prototype_match_rosters_delete` AFTER DELETE ON `prototype_match_rosters` BEGIN
	INSERT INTO `match_builds` (`match_guid`, `revision`) VALUES (lower(trim(OLD.`match_guid`)), 1)
		ON CONFLICT (`match_guid`) DO UPDATE SET `revision` = `revision` + 1;
END;
