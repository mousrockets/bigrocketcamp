CREATE TABLE `high_score_rules` (
	`effective_from` text PRIMARY KEY NOT NULL,
	`enabled` integer NOT NULL
);
--> statement-breakpoint
-- The −10 above 1000 points as the club decided it: on from 2026-11-07, the evening it was voted, off before.
INSERT INTO `high_score_rules` (`effective_from`, `enabled`) VALUES ('2026-11-07', 1);
--> statement-breakpoint
-- A rule already in force never changes: the matches it counted keep their pushups. The app writes changes
-- for the next day in Paris; SQLite only knows UTC, a day behind Paris at most, so this refuses the days before it.
CREATE TRIGGER `high_score_rules_keep_past_insert` BEFORE INSERT ON `high_score_rules` WHEN NEW.`effective_from` <= date('now') BEGIN SELECT RAISE(ABORT, 'high_score_rules: the past never changes'); END;
--> statement-breakpoint
CREATE TRIGGER `high_score_rules_keep_past_update` BEFORE UPDATE ON `high_score_rules` WHEN OLD.`effective_from` <= date('now') OR NEW.`effective_from` <= date('now') BEGIN SELECT RAISE(ABORT, 'high_score_rules: the past never changes'); END;
--> statement-breakpoint
CREATE TRIGGER `high_score_rules_keep_past_delete` BEFORE DELETE ON `high_score_rules` WHEN OLD.`effective_from` <= date('now') BEGIN SELECT RAISE(ABORT, 'high_score_rules: the past never changes'); END;
--> statement-breakpoint
-- The board counts the pushups with these rules: it follows them like its other small parts.
CREATE TRIGGER `high_score_rules_insert` AFTER INSERT ON `high_score_rules` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `high_score_rules_update` AFTER UPDATE ON `high_score_rules` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `high_score_rules_delete` AFTER DELETE ON `high_score_rules` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
