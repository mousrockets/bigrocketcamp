CREATE TABLE `match_rosters` (
	`match_guid` text PRIMARY KEY NOT NULL,
	`expected_players` integer NOT NULL,
	`received` text NOT NULL
);
