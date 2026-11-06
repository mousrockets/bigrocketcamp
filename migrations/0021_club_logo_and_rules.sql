CREATE TABLE `club_logo` (
	`id` integer PRIMARY KEY NOT NULL,
	`image` blob NOT NULL,
	`content_type` text NOT NULL,
	`version` text NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	CONSTRAINT "club_logo_single_row" CHECK("club_logo"."id" = 1),
	CONSTRAINT "club_logo_content_type" CHECK("club_logo"."content_type" IN ('image/webp', 'image/jpeg', 'image/png'))
);
--> statement-breakpoint
CREATE TABLE `last_place_rules` (
	`effective_from` text PRIMARY KEY NOT NULL,
	`enabled` integer NOT NULL,
	`ties` text DEFAULT 'none' NOT NULL,
	CONSTRAINT "last_place_rules_ties" CHECK("last_place_rules"."ties" IN ('none', 'all'))
);
--> statement-breakpoint
-- The +5 as it was written in the code until now: on from 2026-11-06, a shared last place costs nothing extra.
INSERT INTO `last_place_rules` (`effective_from`, `enabled`, `ties`) VALUES ('2026-11-06', 1, 'none');
--> statement-breakpoint
-- A rule already in force never changes: the matches it counted keep their pushups. The app writes changes
-- for the next day in Paris; SQLite only knows UTC, a day behind Paris at most, so this refuses the days before it.
CREATE TRIGGER `last_place_rules_keep_past_insert` BEFORE INSERT ON `last_place_rules` WHEN NEW.`effective_from` <= date('now') BEGIN SELECT RAISE(ABORT, 'last_place_rules: the past never changes'); END;
--> statement-breakpoint
CREATE TRIGGER `last_place_rules_keep_past_update` BEFORE UPDATE ON `last_place_rules` WHEN OLD.`effective_from` <= date('now') OR NEW.`effective_from` <= date('now') BEGIN SELECT RAISE(ABORT, 'last_place_rules: the past never changes'); END;
--> statement-breakpoint
CREATE TRIGGER `last_place_rules_keep_past_delete` BEFORE DELETE ON `last_place_rules` WHEN OLD.`effective_from` <= date('now') BEGIN SELECT RAISE(ABORT, 'last_place_rules: the past never changes'); END;
--> statement-breakpoint
-- The board counts the pushups with these rules: it follows them like its other small parts.
CREATE TRIGGER `last_place_rules_insert` AFTER INSERT ON `last_place_rules` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `last_place_rules_update` AFTER UPDATE ON `last_place_rules` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
--> statement-breakpoint
CREATE TRIGGER `last_place_rules_delete` AFTER DELETE ON `last_place_rules` BEGIN UPDATE `sync_state` SET `version` = `version` + 1 WHERE `id` = 1; END;
