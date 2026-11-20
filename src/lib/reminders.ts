import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, ne, notExists, or, sql } from 'drizzle-orm';
import { confirmedRosters } from './board';
import { readClubPlayers, rosterOf } from './club';
import { readChallengeRules } from './club-rules';
import type { ReminderDevice, ReminderInput } from './contract';
import { parisDay, parisHour } from './days';
import type { Database } from './db';
import { clubStats, debtOf } from './domain';
import { orm } from './orm';
import { reminderDeviceIdOf } from './reminder-device';
import { exercises, matchResults, members, pushSubscriptions, sessions } from './schema';

// The daily reminder's subscriptions, and the debts it announces. The sending itself is the Worker's
// (src/worker/reminders.ts): it holds the keys.

/** A subscription due a reminder, with what sending it needs. */
export interface DueReminder {
  id: string;
  memberId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  lastDebt: number | null;
  /** The member's player slot, whose debt the reminder announces. */
  player: string;
}

const dueColumns = {
  id: pushSubscriptions.id,
  memberId: pushSubscriptions.memberId,
  endpoint: pushSubscriptions.endpoint,
  p256dh: pushSubscriptions.p256dh,
  auth: pushSubscriptions.auth,
  lastDebt: pushSubscriptions.lastDebt,
  player: members.duoPseudo,
};

/** The member's devices that receive the reminder, and at what hour. */
export async function readReminderDevices(db: Database, memberId: string): Promise<ReminderDevice[]> {
  return orm(db)
    .select({ id: pushSubscriptions.id, hour: pushSubscriptions.hour })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.memberId, memberId))
    .orderBy(asc(pushSubscriptions.created));
}

/**
 * Subscribes a device, or changes its hour. An hour already gone today starts tomorrow: the hourly task never
 * sends one late on the day it is chosen. A device another member used starts over.
 */
export async function saveReminder(
  db: Database,
  memberId: string,
  { subscription, hour }: ReminderInput,
  now: number = Date.now(),
): Promise<ReminderDevice> {
  const id = await reminderDeviceIdOf(subscription.endpoint);
  const startsTomorrow = parisHour(now) > hour ? parisDay(now) : null;
  const sameMember = sql`${pushSubscriptions.memberId} = ${memberId}`;
  await orm(db)
    .insert(pushSubscriptions)
    .values({
      id,
      memberId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      hour,
      lastSentDay: startsTomorrow,
    })
    // Raw CASE: Drizzle has no conditional expression.
    .onConflictDoUpdate({
      target: pushSubscriptions.id,
      set: {
        memberId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        hour,
        lastSentDay: sql`CASE WHEN ${sameMember} THEN COALESCE(${pushSubscriptions.lastSentDay}, ${startsTomorrow}) ELSE ${startsTomorrow} END`,
        lastDebt: sql`CASE WHEN ${sameMember} THEN ${pushSubscriptions.lastDebt} ELSE NULL END`,
      },
    });
  return { id, hour };
}

/** Turns the reminder off on one of the member's devices; false when it was not theirs or already off. */
export async function stopReminder(db: Database, memberId: string, id: string): Promise<boolean> {
  const removed = await orm(db)
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.id, id), eq(pushSubscriptions.memberId, memberId)))
    .returning({ id: pushSubscriptions.id });
  return removed.length > 0;
}

/** « Ne plus me rappeler » from the notification: only the device that knows the subscription's secret stops it. */
export async function optOutOfReminders(db: Database, { endpoint, auth }: { endpoint: string; auth: string }) {
  const removed = await orm(db)
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.auth, auth)))
    .returning({ id: pushSubscriptions.id });
  return removed.length > 0;
}

/** One of the member's devices, to send it a reminder now. */
export async function readMemberDevice(db: Database, memberId: string, id: string): Promise<DueReminder | null> {
  const [device] = await orm(db)
    .select(dueColumns)
    .from(pushSubscriptions)
    .innerJoin(members, eq(members.id, pushSubscriptions.memberId))
    .where(and(eq(pushSubscriptions.id, id), eq(pushSubscriptions.memberId, memberId)));
  return device ? { ...device, player: device.player ?? '' } : null;
}

/**
 * The devices whose hour has come today and that got nothing yet, at most `limit`, the earliest hours first: those
 * past the limit go with the next hour's run. Only players have a debt to hear about.
 */
export async function dueReminders(db: Database, now: number, limit: number): Promise<DueReminder[]> {
  const today = parisDay(now);
  const due = await orm(db)
    .select(dueColumns)
    .from(pushSubscriptions)
    .innerJoin(members, eq(members.id, pushSubscriptions.memberId))
    .where(
      and(
        lte(pushSubscriptions.hour, parisHour(now)),
        or(isNull(pushSubscriptions.lastSentDay), ne(pushSubscriptions.lastSentDay, today)),
        isNotNull(members.duoPseudo),
      ),
    )
    .orderBy(asc(pushSubscriptions.hour), asc(pushSubscriptions.id))
    .limit(limit);
  return due.map((device) => ({ ...device, player: device.player ?? '' }));
}

/** Each player's debt, `debt.left`, counted exactly as L'équipe counts it (src/lib/domain.ts). */
export async function readDebts(db: Database, now: number = Date.now()): Promise<Map<string, number>> {
  const query = orm(db);
  const [players, rows, done, rules] = await Promise.all([
    readClubPlayers(db),
    // Only the columns the rules read: the history is read whole, once per hour that has reminders due.
    query
      .select({
        match_guid: matchResults.matchGuid,
        player_id: matchResults.playerId,
        name: matchResults.name,
        day: matchResults.day,
        kind: matchResults.kind,
        team: matchResults.team,
        winner: matchResults.winner,
        score: matchResults.score,
        review_required: matchResults.reviewRequired,
        forfeit: matchResults.forfeit,
        left_early: matchResults.leftEarly,
        expected_players: matchResults.expectedPlayers,
      })
      .from(matchResults),
    query.select({ player: exercises.player, count: exercises.count, type: exercises.type }).from(exercises),
    readChallengeRules(db),
  ]);
  const results = rows.map((row) => ({ ...row, review_required: Boolean(row.review_required), left: row.left_early }));
  const stats = clubStats(
    { results, exercises: done, matchRosters: confirmedRosters(rows), rules },
    rosterOf(players),
    parisDay(now),
  );
  return new Map(stats.map((player) => [player.name, debtOf(player).left]));
}

/** The reminders sent: none more today, and the debt they announced for tomorrow's comparison. */
export async function recordSent(db: Database, sent: readonly { id: string; day: string; debt: number }[]) {
  const query = orm(db);
  const [first, ...rest] = sent.map(({ id, day, debt }) =>
    query.update(pushSubscriptions).set({ lastSentDay: day, lastDebt: debt }).where(eq(pushSubscriptions.id, id)),
  );
  if (first) await query.batch([first, ...rest]);
}

/** Subscriptions the push service no longer knows, or could not be encrypted for. */
export async function forgetReminders(db: Database, ids: readonly string[]) {
  if (ids.length)
    await orm(db)
      .delete(pushSubscriptions)
      .where(inArray(pushSubscriptions.id, [...ids]));
}

/**
 * A member who has not opened the app for a long time stops receiving reminders: their subscriptions go. A session
 * in use is extended each day (src/worker/auth.ts), so its expiry tells when the member last came.
 */
export async function forgetIdleReminders(db: Database, sessionsActiveIfExpiringAfter: number) {
  const query = orm(db);
  await query.delete(pushSubscriptions).where(
    notExists(
      query
        .select({ one: sql`1` })
        .from(sessions)
        .where(
          and(eq(sessions.memberId, pushSubscriptions.memberId), gt(sessions.expires, sessionsActiveIfExpiringAfter)),
        ),
    ),
  );
}
