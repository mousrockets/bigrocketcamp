import type { Roster } from '../../lib/club';
import { defaultLastPlaceRules, formatNumber, matchIndex, summarize } from '../../lib/domain';
import { type HistoryMatch, matchHistory } from '../../lib/match-history';
import type { LastPlaceRules } from '../../lib/match-rules';
import type { BoardState, ExerciseType, PlayerStats, Result, Streak } from './types';

// What the pages compute from the board: pure functions, tested in model.test.ts.

/** The +5 as the club set it over time; a board from an older API has none, the default applies. */
export const lastPlaceRulesOf = (state: BoardState | null): LastPlaceRules =>
  state?.rules?.lastPlace ?? defaultLastPlaceRules;

export function shiftDay(day: string, delta: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/** The Monday of the week holding `today`. */
export function weekStart(today: string): string {
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  return shiftDay(today, -weekday);
}

/** Days in a row with an exercise: the run going on (today or up to yesterday) and the longest. */
export function streakOf(days: Set<string>, today: string): Streak {
  let current = 0;
  for (let day = days.has(today) ? today : shiftDay(today, -1); days.has(day); day = shiftDay(day, -1)) current++;
  let best = 0;
  let run = 0;
  let previous = '';
  for (const day of Array.from(days).sort()) {
    run = previous && shiftDay(previous, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  return { current, best };
}

/** Each player's results and exercises; `day` limits the results to one day, '' takes them all. */
export function statsOf(roster: Roster, state: BoardState, day = ''): PlayerStats[] {
  return summarize(
    roster,
    state.results,
    state.exercises,
    day,
    state.matchRosters || [],
    lastPlaceRulesOf(state),
  ) as PlayerStats[];
}

export function streaksOf(roster: Roster, state: BoardState, today: string): Map<string, Streak> {
  return new Map(
    roster.map((name) => [
      name,
      streakOf(new Set(state.exercises.filter((exercise) => exercise.player === name).map((e) => e.day)), today),
    ]),
  );
}

/**
 * The club's matches, newest first: one entry per match with its score and what each club player owes.
 * `day` keeps one day ('' keeps all); test matches against bots only when asked.
 */
export function matchesOf(
  roster: Roster,
  state: BoardState,
  { day = '', tests = false }: { day?: string; tests?: boolean } = {},
): HistoryMatch<Result>[] {
  const rows = state.results.filter(
    (row) => roster.includes(row.name) && (!day || row.day === day) && (tests || row.kind === 'match'),
  );
  return matchHistory(
    rows,
    state.results,
    matchIndex(state.results, state.matchRosters || []),
    roster,
    lastPlaceRulesOf(state),
  );
}

/** The most recent real match of the club, if any. */
export function lastMatchOf(roster: Roster, state: BoardState): HistoryMatch<Result> | null {
  const [latest] = matchesOf(roster, state).sort((a, b) => (b.received ?? b.day).localeCompare(a.received ?? a.day));
  return latest ?? null;
}

/** The club's players by 2v2 MMR, best first; a player without a reading comes last, in roster order. */
export function standingsOf(roster: Roster, state: BoardState) {
  const ranks = new Map((state.doublesRanks ?? []).map((rank) => [rank.player, rank]));
  return roster
    .map((name, index) => ({ name, index, rank: ranks.get(name) ?? null }))
    .sort((a, b) => (b.rank?.mmr ?? -1) - (a.rank?.mmr ?? -1) || a.index - b.index);
}

/** A rank's tier alone, as the design writes it under a name: "Champion II · Division IV" → "Champion II". */
export function tierOf(label: string): string {
  return label.split(' · ')[0] ?? label;
}

const parisDayName = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** "il y a 12 min", "il y a 3 h", then the day: how long ago something arrived. */
export function sinceLabel(iso: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `le ${parisDayName.format(new Date(iso))}`;
}

/** The sentence under the member's debt, in the design's « Fun assumé » voice. */
export function debtLine(remaining: number): string {
  if (remaining <= 0) return 'Tu es à jour. Chaque série compte quand même dans les totaux.';
  return `${formatNumber(remaining)} pompe${remaining >= 2 ? 's' : ''}, champion. Même le ballon a mal aux bras pour toi.`;
}

/** How many of `segments` blocks of the debt bar are done. Nothing owed fills the bar. */
export function filledSegments(done: number, due: number, segments = 10): number {
  if (due <= 0) return segments;
  return Math.max(0, Math.min(segments, Math.round((done / due) * segments)));
}

/** The leader of the month's MMR ranking and their lead over the second, once two players have a reading. */
export function monthLead(state: BoardState): { leader: string; gap: number } | null {
  const rows = (state.monthly?.current.rows ?? [])
    .filter((row) => row.mmr !== null)
    .sort((a, b) => (b.mmr ?? 0) - (a.mmr ?? 0));
  const [first, second] = rows;
  if (!first || !second || first.mmr === null || second.mmr === null) return null;
  return { leader: first.player, gap: first.mmr - second.mmr };
}

/** Whole days left before an instant, counted up (a few hours left is one day). */
export function daysUntil(iso: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(iso) - now) / 86_400_000));
}

/** "15 pompes enregistrées", "2 min de gainage enregistrées", "20 abdos enregistrés". */
export function savedLine(type: ExerciseType, count: number): string {
  if (type === 'plank') return `${formatNumber(count / 60)} min de gainage enregistrée${count >= 120 ? 's' : ''}.`;
  if (type === 'crunches')
    return `${formatNumber(count)} abdo${count >= 2 ? 's' : ''} enregistré${count >= 2 ? 's' : ''}.`;
  return `${formatNumber(count)} pompe${count >= 2 ? 's' : ''} enregistrée${count >= 2 ? 's' : ''}.`;
}

/** What paying the whole debt takes with this exercise: plank by quarter minutes, crunches count half. */
export function payoffFor(type: ExerciseType, owed: number): number {
  const limit = type === 'plank' ? 1000 : 10000;
  return Math.min(
    limit,
    type === 'plank' ? Math.ceil((owed / 15) * 4) / 4 : Math.ceil(type === 'crunches' ? owed * 2 : owed),
  );
}

/** Where a result comes from, as the member reads it. */
export function sourceLabel(row: Result): string {
  if (row.review_required) return 'À vérifier : les sources ne sont pas d’accord';
  if (row.verification === 'confirmed') return 'Confirmé par les deux sources';
  if (row.verification === 'corrected') return 'Corrigé par Epic';
  return row.selected_source === 'epic' ? 'Reçu d’Epic' : 'Reçu par le collecteur PC';
}

/**
 * Everyone in a match's scoreboard: the club's side first, best score first, then the other side. Players outside
 * the club are never named on screen ("Adversaire 1", "Coéquipier"), only counted.
 */
export function scoreboardOf(roster: readonly string[], state: BoardState, guid: string, clubTeam: number) {
  const rows = state.results.filter((row) => row.match_guid === guid);
  const byScore = (a: Result, b: Result) => b.score - a.score;
  const ours = rows.filter((row) => row.team === clubTeam).sort(byScore);
  const theirs = rows.filter((row) => row.team !== clubTeam).sort(byScore);
  let opponent = 0;
  return [...ours, ...theirs].map((row) => {
    const member = roster.includes(row.name);
    const label = member ? row.name : row.team === clubTeam ? 'Coéquipier' : `Adversaire ${++opponent}`;
    return { row, member, ours: row.team === clubTeam, label };
  });
}

/** "6 matchs, 3 victoires, 3 défaites. Les bras vont chauffer ce soir.": the design's playful summary. */
export function matchesSummary(matches: { outcome: string }[], when: string, tonight = false): string {
  const count = matches.length;
  const wins = matches.filter((match) => match.outcome === 'victory').length;
  const losses = matches.filter((match) => match.outcome === 'defeat').length;
  if (!count) return `Aucun match reçu ${when}.`;
  const tally = `${count} match${count > 1 ? 's' : ''}, ${wins} victoire${wins > 1 ? 's' : ''}, ${losses} défaite${losses > 1 ? 's' : ''}.`;
  if (!losses) return `${tally} Les bras se reposent.`;
  return `${tally} ${tonight ? 'Les bras vont chauffer ce soir.' : 'Les bras ont chauffé.'}`;
}
