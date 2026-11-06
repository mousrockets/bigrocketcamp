CREATE TABLE `player_identities` (
	`slot` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`player_id` text NOT NULL,
	`last_sync` text,
	`last_attempt` text,
	`coverage` text DEFAULT 'recent_only' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `player_identities_player_id_unique` ON `player_identities` (`player_id`);
--> statement-breakpoint
INSERT INTO player_identities (slot,owner,player_id,last_sync,last_attempt,coverage)
SELECT slot,owner,'Epic|' || lower(account_id) || '|0',last_sync,last_attempt,coverage
FROM epic_accounts WHERE slot IN ('chat-pris-tea','nokouki','kevin-74000');
--> statement-breakpoint
DELETE FROM epic_grants;
--> statement-breakpoint
DELETE FROM epic_accounts;
--> statement-breakpoint
UPDATE player_ranks SET status='frozen';
