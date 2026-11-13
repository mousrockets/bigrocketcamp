import { and, asc, desc, eq, gte, isNull, lt, type SQLWrapper, sql } from 'drizzle-orm';
import { type ClubPlayer, type Roster, rosterOf } from './club';
import { parisDay } from './days';
import type { Database } from './db';
import type { MmrAccount, MmrEntry } from './mmr-ledger';
import { inJsonList, orm, rowid, sqlNamed, statementOf } from './orm';
import { readPlayerIdentities } from './player-identities';
import { drinkDebts, mmrEntries, monthlyMmrPolicy, monthlyMmrResults, soloMmrEntries } from './schema';

export const monthCloseGraceMs = 300_000;
/** How long the member who marked a drink paid can take it back. */
export const undoMs = 86_400_000;
const localParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** An error the API answers with its own HTTP status. */
const withStatus = (message: string, status: number) => Object.assign(new Error(message), { status });

export const parisMonth = (now: number = Date.now()): string => parisDay(new Date(now)).slice(0, 7);

function validMonth(month: unknown): string {
  if (typeof month !== 'string' || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Mois invalide.');
  return month;
}

export function nextMonth(month: string): string {
  validMonth(month);
  const [year = 0, monthNumber = 0] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 7);
}

/** The UTC instant of midnight in Paris on that day, whatever the daylight saving time. */
function midnightParis(day: string): number {
  const target = Date.parse(`${day}T00:00:00Z`);
  let guess = target;
  for (let step = 0; step < 3; step++) {
    const parts = Object.fromEntries(
      localParts
        .formatToParts(new Date(guess))
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]),
    );
    const wall = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    guess += target - wall;
  }
  return guess;
}

export function monthBounds(month: string) {
  validMonth(month);
  const following = nextMonth(month);
  const lastDay = new Date(Date.parse(`${following}-01T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  return {
    month,
    startAt: new Date(midnightParis(`${month}-01`)).toISOString(),
    lastDay,
    lastDayStartAt: new Date(midnightParis(lastDay)).toISOString(),
    cutoffAt: new Date(midnightParis(`${following}-01`)).toISOString(),
  };
}

const accounts: readonly MmrAccount[] = ['duo', 'solo'];

export interface DrinkDebt {
  id: string;
  month: string;
  payer: string;
  recipient: string;
}

export function monthlyRanking(
  roster: Roster,
  entries: MmrEntry[],
  month: string,
  { live = false }: { live?: boolean } = {},
) {
  const bounds = monthBounds(month);
  // Only a reading from the month's last day confirms the account's rating at the close.
  const admissible = (entry: MmrEntry) => entry.recorded_at >= bounds.lastDayStartAt;
  const rows = roster
    .map((player) => {
      // Each account's reading at the close: its last one of the last day, else its latest one of the month.
      const readings = accounts.flatMap((account) => {
        const candidates = entries
          .filter(
            (entry) =>
              entry.player === player &&
              (entry.account ?? 'duo') === account &&
              entry.recorded_at >= bounds.startAt &&
              entry.recorded_at < bounds.cutoffAt,
          )
          .sort(
            (a, b) => a.recorded_at.localeCompare(b.recorded_at) || Number(a.sequence ?? 0) - Number(b.sequence ?? 0),
          );
        const latest = (live ? null : candidates.filter(admissible).at(-1)) || candidates.at(-1);
        return latest ? [{ entry: latest, account, confirmed: admissible(latest) }] : [];
      });
      // The player counts with the sum of their accounts: an account never read this month adds nothing, and one
      // not read on the last day adds its latest reading. One account read on the last day confirms the player.
      // `account` names the best of them, whose rank shows; the duo account wins a tie.
      const best = readings.reduce<(typeof readings)[number] | null>(
        (top, reading) => (top && top.entry.mmr >= reading.entry.mmr ? top : reading),
        null,
      );
      const of = (account: MmrAccount) => readings.find((reading) => reading.account === account)?.entry.mmr ?? null;
      const latest = readings.map((reading) => reading.entry.recorded_at).sort();
      return {
        player,
        mmr: readings.length ? readings.reduce((sum, reading) => sum + reading.entry.mmr, 0) : null,
        recordedAt: latest.at(-1) ?? null,
        confirmedForClose: readings.some((reading) => reading.confirmed),
        account: best?.account ?? null,
        duo: of('duo'),
        solo: of('solo'),
      };
    })
    .sort((a, b) => (b.mmr ?? -1) - (a.mmr ?? -1) || roster.indexOf(a.player) - roster.indexOf(b.player));
  const missing = rows.filter((row) => !row.confirmedForClose).map((row) => row.player);
  if (missing.length)
    return {
      ...bounds,
      rows,
      status: 'incomplete' as const,
      missing,
      losers: [] as string[],
      debts: [] as DrinkDebt[],
    };
  const minimum = Math.min(...rows.map((row) => row.mmr ?? 0));
  const last = rows.filter((row) => row.mmr === minimum);
  if (last.length !== 1) {
    return {
      ...bounds,
      rows,
      status: 'tied' as const,
      missing: [],
      losers: last.map((row) => row.player),
      debts: [] as DrinkDebt[],
    };
  }
  const payer = last[0]?.player ?? '';
  return {
    ...bounds,
    rows,
    status: 'final' as const,
    missing: [],
    losers: [payer],
    debts: roster
      .filter((player) => player !== payer)
      .map((recipient) => ({ id: `${month}:${payer}:${recipient}`, month, payer, recipient })),
  };
}

const readPolicy = (db: Database) =>
  orm(db)
    .select({ starts_month: monthlyMmrPolicy.startsMonth })
    .from(monthlyMmrPolicy)
    .where(eq(monthlyMmrPolicy.id, 1))
    .get();

async function policy(db: Database, now: number) {
  const config = await readPolicy(db);
  if (config) return config;
  await orm(db)
    .insert(monthlyMmrPolicy)
    .values({ id: 1, startsMonth: parisMonth(now) })
    .onConflictDoNothing({ target: monthlyMmrPolicy.id });
  return readPolicy(db);
}

// Duo and solo readings live in their own tables; a ranking reads both, each tagged with its account.
const ledgers = [
  ['duo', 'mmr_entries'],
  ['solo', 'solo_mmr_entries'],
] as const;

/** One account's readings of the month by the roster's players. */
const accountEntries = (
  db: Database,
  account: MmrAccount,
  ledger: typeof mmrEntries | typeof soloMmrEntries,
  roster: Roster,
  bounds: ReturnType<typeof monthBounds>,
) =>
  orm(db)
    .select({
      sequence: rowid.as('sequence'),
      account: sql<MmrAccount>`${account}`.as('account'),
      id: ledger.id,
      player: ledger.player,
      mmr: ledger.mmr,
      tier: ledger.tier,
      division: ledger.division,
      recorded_at: ledger.recordedAt,
    })
    .from(ledger)
    .where(
      and(
        inJsonList(ledger.player, roster),
        gte(ledger.recordedAt, bounds.startAt),
        lt(ledger.recordedAt, bounds.cutoffAt),
      ),
    );

/** The month's readings of each player's accounts: only what one month's ranking needs. */
const monthEntries = (db: Database, roster: Roster, month: string): Promise<MmrEntry[]> => {
  const bounds = monthBounds(month);
  return accountEntries(db, 'duo', mmrEntries, roster, bounds).unionAll(
    accountEntries(db, 'solo', soloMmrEntries, roster, bounds),
  );
};

/** The latest reading of the month of each player's accounts: all the live ranking shows. */
const latestEntries = (db: Database, roster: Roster, month: string) => {
  const bounds = monthBounds(month);
  // Raw: one indexed lookup per player, driven by json_each, which Drizzle cannot select from.
  return db
    .prepare(
      ledgers
        .map(
          ([account, table]) =>
            `SELECT entry.rowid AS sequence,'${account}' AS account,entry.id,entry.player,entry.mmr,entry.tier,entry.division,entry.recorded_at
              FROM json_each(?1) AS slot
              JOIN ${table} AS entry ON entry.rowid = (
                SELECT rowid FROM ${table} WHERE player = slot.value AND recorded_at >= ?2 AND recorded_at < ?3
                ORDER BY recorded_at DESC, rowid DESC LIMIT 1
              )`,
        )
        .join(' UNION ALL '),
    )
    .bind(JSON.stringify(roster), bounds.startAt, bounds.cutoffAt)
    .all<MmrEntry>();
};

export async function closeMonthlyMmr(db: Database, roster: Roster, now: number = Date.now()) {
  const config = await policy(db, now);
  const current = parisMonth(now);
  let closed = 0;
  const query = orm(db);
  const existing = (await query.select({ month: monthlyMmrResults.month }).from(monthlyMmrResults)).map(
    (row) => row.month,
  );
  for (let month = config?.starts_month ?? current; month < current && closed < 24; month = nextMonth(month)) {
    const bounds = monthBounds(month);
    if (now < Date.parse(bounds.cutoffAt) + monthCloseGraceMs || existing.includes(month)) continue;
    const snapshot = monthlyRanking(roster, await monthEntries(db, roster, month), month);
    const payload = JSON.stringify(snapshot);
    const closedAt = new Date(now).toISOString();
    const writes: SQLWrapper[] = [
      query
        .insert(monthlyMmrResults)
        .values({ month, cutoffAt: bounds.cutoffAt, closedAt, status: snapshot.status, snapshot: payload })
        .onConflictDoNothing({ target: monthlyMmrResults.month }),
    ];
    for (const debt of snapshot.debts) {
      // Raw: a debt is only owed under the snapshot that closed the month, and Drizzle builds an insert from a
      // select only by listing every column, in order. One D1 batch, then, rather than Drizzle's.
      writes.push(
        sql`INSERT INTO drink_debts (id,month,payer,recipient) SELECT ${debt.id},${debt.month},${debt.payer},${debt.recipient} WHERE EXISTS (SELECT 1 FROM monthly_mmr_results WHERE month=${month} AND snapshot=${payload} AND status='final') ON CONFLICT(id) DO NOTHING`,
      );
    }
    await db.batch(writes.map((write) => statementOf(db, write)));
    closed++;
  }
  return { ok: true, closed, month: current };
}

export async function settleDrink(
  db: Database,
  roster: Roster,
  userId: string,
  id: string,
  undo = false,
  now: number = Date.now(),
) {
  const query = orm(db);
  const debt = await query.select(sqlNamed(drinkDebts)).from(drinkDebts).where(eq(drinkDebts.id, id)).get();
  if (!debt) throw withStatus('Dette introuvable.', 404);
  const own = (await readPlayerIdentities(db, roster, userId)).map((identity) => identity.slot);
  if (!own.includes(debt.payer) && !own.includes(debt.recipient)) {
    throw withStatus('Seuls les deux joueurs concernés peuvent confirmer la boisson.', 403);
  }
  if (undo) {
    if (debt.paid_by !== userId || !debt.paid_at || now - Date.parse(debt.paid_at) > undoMs) {
      throw withStatus('Annulation disponible pendant 24 h pour son auteur.', 403);
    }
    await query
      .update(drinkDebts)
      .set({ paidAt: null, paidBy: null })
      .where(and(eq(drinkDebts.id, id), eq(drinkDebts.paidBy, userId), eq(drinkDebts.paidAt, debt.paid_at)));
  } else {
    await query
      .update(drinkDebts)
      .set({ paidAt: new Date(now).toISOString(), paidBy: userId })
      .where(and(eq(drinkDebts.id, id), isNull(drinkDebts.paidAt)));
  }
  return { ok: true };
}

export async function readMonthlyMmr(
  db: Database,
  players: readonly ClubPlayer[],
  userId: string,
  now: number = Date.now(),
) {
  const roster = rosterOf(players);
  const month = parisMonth(now);
  const query = orm(db);
  const [latest, closed, debts, identities, config] = await Promise.all([
    latestEntries(db, roster, month),
    query
      .select({ closed_at: monthlyMmrResults.closedAt, snapshot: monthlyMmrResults.snapshot })
      .from(monthlyMmrResults)
      .orderBy(desc(monthlyMmrResults.month)),
    query
      .select(sqlNamed(drinkDebts))
      .from(drinkDebts)
      .orderBy(desc(drinkDebts.month), asc(drinkDebts.payer), asc(drinkDebts.recipient)),
    readPlayerIdentities(db, roster, userId),
    readPolicy(db),
  ]);
  const allowedPlayers = identities.map((identity) => identity.slot);
  const { debts: _preview, losers: _last, ...live } = monthlyRanking(roster, latest.results, month, { live: true });
  return {
    startsMonth: config?.starts_month ?? month,
    current: { ...live, status: 'live' as const },
    closed: closed.map((row) => ({ ...JSON.parse(row.snapshot), closedAt: row.closed_at })),
    allowedPlayers,
    debts: debts.map((debt) => ({
      id: debt.id,
      month: debt.month,
      payer: debt.payer,
      recipient: debt.recipient,
      paidAt: debt.paid_at,
      canSettle: allowedPlayers.includes(debt.payer) || allowedPlayers.includes(debt.recipient),
      canUndo: Boolean(debt.paid_at) && debt.paid_by === userId && now - Date.parse(debt.paid_at ?? '') <= undoMs,
    })),
  };
}
