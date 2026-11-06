-- The club's name and its players become settings of the app, edited by its administrators.
CREATE TABLE `club_settings` (
	`id` integer PRIMARY KEY NOT NULL CHECK (`id` = 1),
	`name` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `members` ADD `role` text NOT NULL DEFAULT 'member' CHECK (`role` IN ('admin', 'member'));
--> statement-breakpoint
-- The duo pseudo is the member's player slot: every game record is keyed by it.
ALTER TABLE `members` ADD `duo_pseudo` text;
--> statement-breakpoint
ALTER TABLE `members` ADD `solo_pseudo` text;
--> statement-breakpoint
ALTER TABLE `members` ADD `platform` text CHECK (`platform` IN ('pc', 'playstation', 'xbox', 'switch'));
--> statement-breakpoint
-- Players are listed in the order they joined the club.
ALTER TABLE `members` ADD `roster_position` integer;
--> statement-breakpoint
CREATE UNIQUE INDEX `members_duo_pseudo` ON `members` (`duo_pseudo`);
--> statement-breakpoint
-- The instance the app was born in: its three members already own their player slot, and its build
-- settings named the club, ordered the roster and listed the console player. Elsewhere, nothing matches.
UPDATE `members` SET `duo_pseudo` = (
	SELECT `slot` FROM `player_identities`
	WHERE `owner` = `members`.`id` AND `slot` IN ('chat-pris-tea', 'nokouki', 'kevin-74000')
	ORDER BY `slot` LIMIT 1
);
--> statement-breakpoint
UPDATE `members` SET
	`roster_position` = CASE `duo_pseudo` WHEN 'chat-pris-tea' THEN 1 WHEN 'nokouki' THEN 2 ELSE 3 END,
	`platform` = CASE `duo_pseudo` WHEN 'kevin-74000' THEN 'playstation' ELSE 'pc' END,
	`role` = CASE `duo_pseudo` WHEN 'nokouki' THEN 'admin' ELSE 'member' END
WHERE `duo_pseudo` IS NOT NULL;
--> statement-breakpoint
INSERT INTO `club_settings` (`id`, `name`)
SELECT 1, CASE WHEN EXISTS (SELECT 1 FROM `members` WHERE `duo_pseudo` IS NOT NULL)
	THEN 'Les Trois Mousrockets' ELSE 'Big Rocket Camp' END;
