CREATE TABLE `forfeit_rules` (
	`effective_from` text PRIMARY KEY NOT NULL,
	`enabled` integer NOT NULL
);
--> statement-breakpoint
-- No row: the −5 keeps applying as it always did, from the first forfeit a collector told.
-- A rule already in force never changes: the matches it counted keep their pushups. The app writes changes
-- for the next day in Paris; SQLite only knows UTC, a day behind Paris at most, so this refuses the days before it.
CREATE TRIGGER `forfeit_rules_keep_past_insert` BEFORE INSERT ON `forfeit_rules` WHEN NEW.`effective_from` <= date('now') BEGIN SELECT RAISE(ABORT, 'forfeit_rules: the past never changes'); END;
--> statement-breakpoint
CREATE TRIGGER `forfeit_rules_keep_past_update` BEFORE UPDATE ON `forfeit_rules` WHEN OLD.`effective_from` <= date('now') OR NEW.`effective_from` <= date('now') BEGIN SELECT RAISE(ABORT, 'forfeit_rules: the past never changes'); END;
--> statement-breakpoint
CREATE TRIGGER `forfeit_rules_keep_past_delete` BEFORE DELETE ON `forfeit_rules` WHEN OLD.`effective_from` <= date('now') BEGIN SELECT RAISE(ABORT, 'forfeit_rules: the past never changes'); END;
--> statement-breakpoint
-- The board counts the pushups with these rules: it follows them like its other small parts.
CREATE TRIGGER `forfeit_rules_insert` AFTER INSERT ON `forfeit_rules` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `forfeit_rules_update` AFTER UPDATE ON `forfeit_rules` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `forfeit_rules_delete` AFTER DELETE ON `forfeit_rules` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
