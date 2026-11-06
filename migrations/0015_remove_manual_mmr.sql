-- Ratings come only from the rank source: the manual declarations of the prototype leave with their data.
-- Closed months are frozen in monthly_mmr_results and drink_debts, which this migration does not touch.
DELETE FROM `mmr_entries` WHERE `source` <> 'observer';
--> statement-breakpoint
DELETE FROM `player_ranks` WHERE `status` <> 'ready';
--> statement-breakpoint
-- A card that showed a manual declaration shows the player's latest reading from the rank source, if any.
INSERT INTO `player_ranks` (`player`, `player_id`, `playlist`, `mmr`, `tier`, `division`, `placement_matches`, `fetched_at`, `last_attempt`, `status`)
SELECT `entry`.`player`, `identity`.`player_id`, 11, `entry`.`mmr`, `entry`.`tier`, `entry`.`division`, NULL, `entry`.`recorded_at`, `entry`.`recorded_at`, 'ready'
FROM `mmr_entries` AS `entry` JOIN `player_identities` AS `identity` ON `identity`.`slot` = `entry`.`player`
WHERE `entry`.`rowid` = (SELECT `rowid` FROM `mmr_entries` WHERE `player` = `entry`.`player` ORDER BY `recorded_at` DESC, `rowid` DESC LIMIT 1)
ON CONFLICT(`player`) DO NOTHING;
