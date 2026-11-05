CREATE TABLE `exercise_reactions` (
	`exercise_id` text NOT NULL,
	`author` text NOT NULL,
	`emoji` text NOT NULL,
	`created` text NOT NULL,
	PRIMARY KEY(`exercise_id`, `author`, `emoji`)
);
