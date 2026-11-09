-- A solo account the rank source already found becomes a game ID its member confirmed, as a new one does when found:
-- its matches count as theirs. Every solo account found from a pseudo is an Epic one, whose ID is kept in lower case.
-- Raw SQL: a data migration.
INSERT INTO `player_identity_aliases` (`player_id`, `slot`, `confirmed_by`, `confirmed_at`)
SELECT 'Epic|' || lower(substr(`solo_player_id`, 6)), `duo_pseudo`, `id`, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM `members`
WHERE `solo_player_id` LIKE 'Epic|%' AND `duo_pseudo` IS NOT NULL
ON CONFLICT(`player_id`) DO NOTHING;
