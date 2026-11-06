import { type ClubPlayer, type Roster, rosterOf } from './club';
import type { Database } from './db';
import { parisDay } from './domain';
import type { MmrEntry } from './mmr-ledger';
import { readPlayerIdentities } from './player-identities';

export const monthCloseGraceMs = 300_000;
const undoMs = 86_400_000;
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
  // Only a reading from the month's last day confirms the player's rating at the close.
  const admissible = (entry: MmrEntry) => entry.recorded_at >= bounds.lastDayStartAt;
  const rows = roster
    .map((player) => {
      const candidates = entries
        .filter(
          (entry) =>
            entry.player === player && entry.recorded_at >= bounds.startAt && entry.recorded_at < bounds.cutoffAt,
        )
        .sort(
          (a, b) => a.recorded_at.localeCompare(b.recorded_at) || Number(a.sequence ?? 0) - Number(b.sequence ?? 0),
        );
      const latest = (live ? null : candidates.filter(admissible).at(-1)) || candidates.at(-1);
      return {
        player,
        mmr: latest?.mmr ?? null,
        recordedAt: latest?.recorded_at ?? null,
        confirmedForClose: Boolean(latest) && admissible(latest as MmrEntry),
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

async function policy(db: Database, now: number) {
  await db
    .prepare('INSERT INTO monthly_mmr_policy (id,starts_month) VALUES (1,?) ON CONFLICT(id) DO NOTHING')
    .bind(parisMonth(now))
    .run();
  return db.prepare('SELECT starts_month FROM monthly_mmr_policy WHERE id=1').first<{ starts_month: string }>();
}

const entries = (db: Database) =>
  db
    .prepare(
      'SELECT rowid AS sequence,id,player,mmr,tier,division,recorded_at FROM mmr_entries ORDER BY recorded_at,rowid',
    )
    .all<MmrEntry>();

export async function closeMonthlyMmr(db: Database, roster: Roster, now: number = Date.now()) {
  const config = await policy(db, now);
  const all = (await entries(db)).results;
  const current = parisMonth(now);
  let closed = 0;
  const existing = (await db.prepare('SELECT month FROM monthly_mmr_results').all<{ month: string }>()).results.map(
    (row) => row.month,
  );
  for (let month = config?.starts_month ?? current; month < current && closed < 24; month = nextMonth(month)) {
    const bounds = monthBounds(month);
    if (now < Date.parse(bounds.cutoffAt) + monthCloseGraceMs || existing.includes(month)) continue;
    const snapshot = monthlyRanking(roster, all, month);
    const payload = JSON.stringify(snapshot);
    const closedAt = new Date(now).toISOString();
    const writes = [
      db
        .prepare(
          'INSERT INTO monthly_mmr_results (month,cutoff_at,closed_at,status,snapshot) VALUES (?,?,?,?,?) ON CONFLICT(month) DO NOTHING',
        )
        .bind(month, bounds.cutoffAt, closedAt, snapshot.status, payload),
    ];
    for (const debt of snapshot.debts) {
      writes.push(
        db
          .prepare(
            "INSERT INTO drink_debts (id,month,payer,recipient) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM monthly_mmr_results WHERE month=? AND snapshot=? AND status='final') ON CONFLICT(id) DO NOTHING",
          )
          .bind(debt.id, debt.month, debt.payer, debt.recipient, month, payload),
      );
    }
    await db.batch(writes);
    closed++;
  }
  return { ok: true, closed, month: current };
}

interface StoredDebt extends DrinkDebt {
  paid_at: string | null;
  paid_by: string | null;
}

export async function settleDrink(
  db: Database,
  roster: Roster,
  userId: string,
  id: unknown,
  undo = false,
  now: number = Date.now(),
) {
  if (typeof id !== 'string' || id.length > 160) throw new Error('Dette invalide.');
  const debt = await db.prepare('SELECT * FROM drink_debts WHERE id=?').bind(id).first<StoredDebt>();
  if (!debt) throw withStatus('Dette introuvable.', 404);
  const own = (await readPlayerIdentities(db, roster, userId)).map((identity) => identity.slot);
  if (!own.includes(debt.payer) && !own.includes(debt.recipient)) {
    throw withStatus('Seuls les deux joueurs concernés peuvent confirmer la boisson.', 403);
  }
  if (undo) {
    if (debt.paid_by !== userId || !debt.paid_at || now - Date.parse(debt.paid_at) > undoMs) {
      throw withStatus('Annulation disponible pendant 24 h pour son auteur.', 403);
    }
    await db
      .prepare('UPDATE drink_debts SET paid_at=NULL,paid_by=NULL WHERE id=? AND paid_by=? AND paid_at=?')
      .bind(id, userId, debt.paid_at)
      .run();
  } else {
    await db
      .prepare('UPDATE drink_debts SET paid_at=?,paid_by=? WHERE id=? AND paid_at IS NULL')
      .bind(new Date(now).toISOString(), userId, id)
      .run();
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
  const [all, closed, debts, identities, config] = await Promise.all([
    entries(db),
    db
      .prepare('SELECT month,cutoff_at,closed_at,status,snapshot FROM monthly_mmr_results ORDER BY month DESC')
      .all<{ month: string; closed_at: string; snapshot: string }>(),
    db.prepare('SELECT * FROM drink_debts ORDER BY month DESC,payer,recipient').all<StoredDebt>(),
    readPlayerIdentities(db, roster, userId),
    db.prepare('SELECT starts_month FROM monthly_mmr_policy WHERE id=1').first<{ starts_month: string }>(),
  ]);
  const allowedPlayers = identities.map((identity) => identity.slot);
  const month = parisMonth(now);
  const { debts: _preview, losers: _last, ...live } = monthlyRanking(roster, all.results, month, { live: true });
  return {
    startsMonth: config?.starts_month ?? month,
    current: { ...live, status: 'live' as const },
    closed: closed.results.map((row) => ({ ...JSON.parse(row.snapshot), closedAt: row.closed_at })),
    allowedPlayers,
    debts: debts.results.map((debt) => ({
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
