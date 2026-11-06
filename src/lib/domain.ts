import { roster } from './club';
import {
  type LastPlaceRule,
  lastPlaceBonus,
  lastPlaceRule,
  type MatchRow,
  matchIndex,
  type RosterSize,
} from './match-rules';

export { roster } from './club';
export { lastPlaceRule } from './match-rules';

export const parisDay = (date: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

export const playerName = (name: unknown): string | null =>
  roster.find((player) => player === String(name).trim().toLowerCase()) ?? null;

const validDay = (day: unknown): day is string =>
  typeof day === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(day) &&
  !Number.isNaN(Date.parse(day)) &&
  new Date(day).toISOString().slice(0, 10) === day;

const bounded = (value: unknown, max = 1_000_000): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max;

export interface ReceivedResult {
  matchGuid: string;
  playerId: string;
  name: string;
  day: string;
  kind: 'match' | 'test';
  team: number;
  winner: number;
  score: number;
  goals: number;
  assists: number;
  saves: number;
}

// biome-ignore lint/suspicious/noExplicitAny: the collector's payload is validated field by field below.
type RawResult = Record<string, any> | null | undefined;

function normalize(raw: RawResult, includeOthers: boolean): ReceivedResult | null {
  if (
    !raw ||
    typeof raw.MatchGuid !== 'string' ||
    !raw.MatchGuid.trim() ||
    raw.MatchGuid.length > 128 ||
    typeof raw.PlayerId !== 'string' ||
    !raw.PlayerId ||
    raw.PlayerId.length > 256
  ) {
    throw new Error('Identifiants invalides.');
  }
  if (
    !validDay(raw.Day) ||
    !['match', 'test'].includes(raw.Kind) ||
    ![0, 1].includes(raw.Team) ||
    ![0, 1].includes(raw.Winner)
  ) {
    throw new Error('Résultat invalide.');
  }
  if (![raw.Score, raw.Goals, raw.Assists, raw.Saves].every((value) => bounded(value)))
    throw new Error('Statistiques invalides.');
  const name =
    playerName(raw.Name) ??
    (includeOthers && typeof raw.Name === 'string' && raw.Name.trim().length > 0 && raw.Name.length <= 128
      ? raw.Name.trim()
      : null);
  if (!name) {
    if (includeOthers) throw new Error('Nom du joueur invalide.');
    return null;
  }
  return {
    matchGuid: raw.MatchGuid,
    playerId: raw.PlayerId,
    name,
    day: raw.Day,
    kind: raw.Kind,
    team: raw.Team,
    winner: raw.Winner,
    score: raw.Score,
    goals: raw.Goals,
    assists: raw.Assists,
    saves: raw.Saves,
  };
}

/** A club member's result; anybody else's is dropped. */
export function normalizeResult(raw: RawResult): ReceivedResult | null {
  return normalize(raw, false);
}

/** Any participant of the match, club member or not. */
export function normalizeParticipant(raw: RawResult): ReceivedResult {
  return normalize(raw, true) as ReceivedResult;
}

export const exerciseTypes = ['pushups', 'plank', 'crunches'] as const;
export type ExerciseType = (typeof exerciseTypes)[number];

/** `count` is repetitions for pushups and crunches, and whole seconds for the plank. */
export interface CountedExercise {
  type?: ExerciseType | string;
  count: number;
}

export const exerciseType = (exercise: { type?: string }): string =>
  exercise.type === undefined ? 'pushups' : exercise.type;

// Whole seconds keep every credit exact: one second of plank is a quarter pushup.
export const pushupCredit = (exercise: CountedExercise): number =>
  exercise.count * (exerciseType(exercise) === 'plank' ? 0.25 : exerciseType(exercise) === 'crunches' ? 0.5 : 1);

export function exerciseEffect(remaining: number, exercise: CountedExercise) {
  const equivalent = pushupCredit(exercise);
  const reduction = Math.min(remaining, equivalent);
  return {
    equivalent,
    reduction,
    remaining: Math.max(0, remaining - equivalent),
    excess: Math.max(0, equivalent - remaining),
  };
}

export const formatNumber = (value: number): string =>
  new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value);

export function exerciseDescription(exercise: CountedExercise): string {
  const type = exerciseType(exercise);
  if (type === 'plank') return `${formatNumber(exercise.count / 60)} min de gainage`;
  if (type === 'crunches') return `${formatNumber(exercise.count)} abdos`;
  return `${formatNumber(exercise.count)} pompes`;
}

export interface Exercise {
  id: string;
  player: string;
  type: ExerciseType;
  count: number;
  day: string;
}

export function validateExercise(input: unknown): Exercise {
  // biome-ignore lint/suspicious/noExplicitAny: validated field by field.
  const x = input as Record<string, any> | null;
  const type = x ? exerciseType(x) : undefined;
  if (
    !x ||
    typeof x.id !== 'string' ||
    !/^[a-zA-Z0-9-]{16,80}$/.test(x.id) ||
    !roster.includes(x.player) ||
    !exerciseTypes.includes(type as ExerciseType) ||
    !bounded(x.count, type === 'plank' ? 60_000 : 10_000) ||
    x.count === 0 ||
    !validDay(x.day)
  ) {
    throw new Error('Déclaration invalide.');
  }
  return { id: x.id, player: x.player, type: type as ExerciseType, count: x.count, day: x.day };
}

export interface StoredExercise extends CountedExercise {
  player: string;
  day?: string;
}

export function summarize<Row extends MatchRow>(
  rows: Row[],
  exercises: StoredExercise[],
  day: string,
  rosters: RosterSize[] = [],
  rule: LastPlaceRule = lastPlaceRule,
) {
  const matches = matchIndex(rows, rosters);
  return roster.map((name) => {
    const all = rows.filter((row) => row.name === name && row.kind === 'match' && !row.review_required);
    const selected = all.filter((row) => !day || row.day === day);
    const due = all.reduce(
      (sum, row) => sum + (row.team !== row.winner ? 5 : 0) + lastPlaceBonus(row, matches, rule),
      0,
    );
    const performed = exercises.filter((exercise) => exercise.player === name);
    const done = performed.reduce((sum, exercise) => sum + pushupCredit(exercise), 0);
    const total = (type: string) =>
      performed
        .filter((exercise) => exerciseType(exercise) === type)
        .reduce((sum, exercise) => sum + exercise.count, 0);
    return {
      name,
      played: selected.length,
      wins: selected.filter((row) => row.team === row.winner).length,
      losses: selected.filter((row) => row.team !== row.winner).length,
      due,
      done,
      pushups: total('pushups'),
      plankSeconds: total('plank'),
      crunches: total('crunches'),
      remaining: Math.max(0, due - done),
    };
  });
}

export function dailyRecap<Row extends MatchRow>(
  rows: Row[],
  day: string,
  rosters: RosterSize[] = [],
  rule: LastPlaceRule = lastPlaceRule,
) {
  if (!validDay(day)) throw new Error('Date du récap invalide.');
  const players = roster.map((name) => ({
    name,
    played: 0,
    wins: 0,
    losses: 0,
    lowest: 0,
    lowestTies: 0,
    compared: 0,
    unranked: 0,
    bonus: 0,
    generated: 0,
  }));
  const byName = new Map(players.map((player) => [player.name, player]));
  const matches = matchIndex(
    rows.filter((row) => row.day === day),
    rosters,
  );
  let matchCount = 0;
  for (const match of matches.values()) {
    const tracked = [...match.players.values()].filter((row) => byName.has(row.name));
    if (!tracked.length) continue;
    matchCount++;
    for (const row of tracked) {
      const player = byName.get(row.name);
      if (!player) continue;
      player.played++;
      if (row.team === row.winner) player.wins++;
      else player.losses++;
      if (match.complete) {
        player.compared++;
        if (row.score === match.minimum) {
          player.lowest++;
          if (match.last.length > 1) player.lowestTies++;
        }
      }
      player.bonus += lastPlaceBonus(row, matches, rule);
    }
  }
  for (const player of players) {
    player.unranked = player.played - player.compared;
    player.generated = player.losses * 5 + player.bonus;
  }
  return { day, matchCount, players };
}
