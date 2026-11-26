CREATE TABLE `zen_rank` (
	`player` text PRIMARY KEY NOT NULL,
	`player_id` text,
	`mmr` integer,
	`tier` integer,
	`fetched_at` text,
	`asked_at` text
);
