-- Ratings now come only from the rank source: the RLStats readings of the prototype leave with their data.
DELETE FROM `mmr_entries` WHERE `source` = 'rlstats';
--> statement-breakpoint
DELETE FROM `player_ranks` WHERE `status` = 'public';
--> statement-breakpoint
-- A card that showed an RLStats reading shows the player's latest remaining one, if any: the rank source
-- only refreshes an existing card while the rating does not change.
INSERT INTO `player_ranks` (`player`, `player_id`, `playlist`, `mmr`, `tier`, `division`, `placement_matches`, `fetched_at`, `last_attempt`, `status`)
SELECT `entry`.`player`, `identity`.`player_id`, 11, `entry`.`mmr`, `entry`.`tier`, `entry`.`division`, NULL, `entry`.`recorded_at`, `entry`.`recorded_at`,
	CASE `entry`.`source` WHEN 'observer' THEN 'ready' ELSE 'manual' END
FROM `mmr_entries` AS `entry` JOIN `player_identities` AS `identity` ON `identity`.`slot` = `entry`.`player`
WHERE `entry`.`rowid` = (SELECT `rowid` FROM `mmr_entries` WHERE `player` = `entry`.`player` ORDER BY `recorded_at` DESC, `rowid` DESC LIMIT 1)
ON CONFLICT(`player`) DO NOTHING;
--> statement-breakpoint
-- Closed months keep their ranking, result and drinks; only the provenance of each reading (RLStats profile link) goes.
UPDATE `monthly_mmr_results` SET `snapshot` = json_set(`snapshot`, '$.rows', json((
	SELECT json_group_array(json(`row`)) FROM (
		SELECT json_remove(`value`, '$.source', '$.sourceUrl') AS `row` FROM json_each(`monthly_mmr_results`.`snapshot`, '$.rows') ORDER BY `key`
	)
)))
WHERE json_valid(`snapshot`) AND json_type(`snapshot`, '$.rows') = 'array';
--> statement-breakpoint
-- Only the retired RLStats import and Epic connection used these tables.
DROP TABLE IF EXISTS `public_mmr_sync`;
--> statement-breakpoint
DROP TABLE IF EXISTS `epic_accounts`;
--> statement-breakpoint
DROP TABLE IF EXISTS `epic_grants`;
