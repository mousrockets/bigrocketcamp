CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`hour` integer DEFAULT 19 NOT NULL,
	`last_sent_day` text,
	`last_debt` real,
	`created` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "push_subscriptions_hour_range" CHECK("push_subscriptions"."hour" BETWEEN 0 AND 23)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_member` ON `push_subscriptions` (`member_id`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_hour` ON `push_subscriptions` (`hour`);