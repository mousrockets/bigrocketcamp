CREATE TABLE `player_identity_aliases` (
	`player_id` text PRIMARY KEY NOT NULL,
	`slot` text NOT NULL,
	`confirmed_by` text NOT NULL,
	`confirmed_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO player_identity_aliases (player_id,slot,confirmed_by,confirmed_at)
SELECT player_id,slot,owner,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM player_identities;
