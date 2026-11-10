import type { Roster } from './club';
import { count, formatNumber } from './format';
import {
  type DodgeRules,
  defaultDodgeRules,
  defaultLastPlaceRules,
  dodgedPushups,
  type LastPlaceRules,
  lastPlaceBonus,
  type MatchRow,
  matchIndex,
  type RosterSize,
  teamPlace,
} from './match-rules';
import { parseOrThrow, says, z } from './validation';

export {
  defaultDodgeRules,
  defaultForfeitRules,
  defaultHighScoreRules,
  defaultLastPlaceRules,
  dodgedPushups,
  dodgeRules,
  forfeitRuleOn,
  highScorePoints,
  highScoreRuleOn,
  lastPlaceBonus,
  lastPlaceRuleOn,
  matchIndex,
} from './match-rules';

export const playerName = (roster: Roster, name: unknown): string | null =>
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
  /** Absent while the source sent none (older collectors, Epic's history). */
  demos?: number;
  crossbarHits?: number;
}

// biome-ignore lint/suspicious/noExplicitAny: the collector's payload is validated field by field below.
export type RawResult = Record<string, any> | null | undefined;

function normalize(roster: Roster, raw: RawResult, includeOthers: boolean): ReceivedResult | null {
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
    playerName(roster, raw.Name) ??
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
    ...(bounded(raw.Demos) ? { demos: raw.Demos } : {}),
    ...(bounded(raw.CrossbarHits) ? { crossbarHits: raw.CrossbarHits } : {}),
  };
}

/** A club member's result; anybody else's is dropped. */
export function normalizeResult(roster: Roster, raw: RawResult): ReceivedResult | null {
  return normalize(roster, raw, false);
}

/** Any participant of the match, club member or not. */
export function normalizeParticipant(roster: Roster, raw: RawResult): ReceivedResult {
  return normalize(roster, raw, true) as ReceivedResult;
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

export function exerciseDescription(exercise: CountedExercise): string {
  const type = exerciseType(exercise);
  if (type === 'plank') return `${formatNumber(exercise.count / 60)} min de gainage`;
  if (type === 'crunches') return `${formatNumber(exercise.count)} abdos`;
  return `${formatNumber(exercise.count)} pompes`;
}

const pushups = (value: number) => count(value, 'pompe');

/**
 * What the player reads once the server has saved an exercise: what it reduced, from the debt it was declared
 * against, then what is left now. `remaining` is read again after saving, so a defeat received meanwhile shows.
 */
export function exerciseReceipt(
  player: string,
  exercise: CountedExercise,
  debtBefore: number,
  remaining: number,
): string {
  const effect = exerciseEffect(debtBefore, exercise);
  const reduced = effect.reduction > 0 ? `Dette réduite de ${pushups(effect.reduction)}` : 'Aucune dette à réduire';
  const ahead =
    effect.excess > 0 && remaining === 0 ? ` ${pushups(effect.excess)} d’avance pour les prochaines défaites.` : '';
  return `Exercice enregistré pour ${player} : ${exerciseDescription(exercise)}. ${reduced}, il en reste ${formatNumber(remaining)}.${ahead}`;
}

export interface Exercise {
  id: string;
  player: string;
  type: ExerciseType;
  count: number;
  day: string;
}

const invalidExercise = 'Déclaration invalide.';

/** An exercise as the page declares it; whether the player is in the club is checked against the roster. */
export const exerciseInput = z
  .object({
    id: z.string(says(invalidExercise)).regex(/^[a-zA-Z0-9-]{16,80}$/, says(invalidExercise)),
    player: z.string(says(invalidExercise)),
    type: z.enum(exerciseTypes, says(invalidExercise)).default('pushups'),
    // Repetitions, or whole seconds for the plank.
    count: z.int(says(invalidExercise)).min(1, says(invalidExercise)),
    day: z.string(says(invalidExercise)).refine(validDay, says(invalidExercise)),
  })
  .refine((exercise) => exercise.count <= (exercise.type === 'plank' ? 60_000 : 10_000), says(invalidExercise));

export function validateExercise(roster: Roster, input: unknown): Exercise {
  const exercise = parseOrThrow(exerciseInput, input, invalidExercise);
  if (!roster.includes(exercise.player)) throw new Error(invalidExercise);
  return { id: exercise.id, player: exercise.player, type: exercise.type, count: exercise.count, day: exercise.day };
}

export interface StoredExercise extends CountedExercise {
  player: string;
  day?: string;
}

export function summarize<Row extends MatchRow>(
  roster: Roster,
  rows: Row[],
  exercises: StoredExercise[],
  day: string,
  rosters: RosterSize[] = [],
  rules: LastPlaceRules = defaultLastPlaceRules,
  dodge: DodgeRules = defaultDodgeRules,
) {
  const matches = matchIndex(rows, rosters);
  return roster.map((name) => {
    const all = rows.filter((row) => row.name === name && row.kind === 'match' && !row.review_required);
    const selected = all.filter((row) => !day || row.day === day);
    // A forfeit won or a game from 1000 points lowers what is due like an exercise would: the pushups dodged
    // count for later defeats.
    const due = all.reduce(
      (sum, row) =>
        sum +
        (row.team !== row.winner ? 5 : 0) +
        lastPlaceBonus(row, matches, roster, rules) -
        dodgedPushups(row, dodge),
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
  roster: Roster,
  rows: Row[],
  day: string,
  rosters: RosterSize[] = [],
  rules: LastPlaceRules = defaultLastPlaceRules,
  dodge: DodgeRules = defaultDodgeRules,
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
    /** Pushups taken off by the wins the opponents forfeited and the games from 1000 points. */
    dodged: 0,
    /** What the day adds to the debt: the defeats, the bonus, less what was dodged. */
    generated: 0,
  }));
  const byName = new Map(players.map((player) => [player.name, player]));
  const dayRows = rows.filter((row) => row.day === day);
  const matches = matchIndex(dayRows, rosters);
  // Players who left are not on the final scoreboard the index holds: their defeats count apart.
  const leavers = new Map<string, Row[]>();
  for (const row of dayRows) {
    const guid = row.match_guid ?? row.matchGuid;
    if (!row.left || row.kind !== 'match' || row.review_required || !byName.has(row.name) || !guid) continue;
    leavers.set(guid, [...(leavers.get(guid) ?? []), row]);
  }
  let matchCount = 0;
  for (const guid of new Set([...matches.keys(), ...leavers.keys()])) {
    const present = [...(matches.get(guid)?.players.values() ?? [])].filter((row) => byName.has(row.name));
    const tracked = [...present, ...(leavers.get(guid) ?? [])];
    if (!tracked.length) continue;
    matchCount++;
    for (const row of tracked) {
      const player = byName.get(row.name);
      if (!player) continue;
      player.played++;
      if (row.team === row.winner) player.wins++;
      else player.losses++;
      const place = teamPlace(row, matches, roster);
      if (place.compared) {
        player.compared++;
        if (place.lowest) player.lowest++;
        if (place.tied) player.lowestTies++;
      }
      player.bonus += lastPlaceBonus(row, matches, roster, rules);
      player.dodged += dodgedPushups(row, dodge);
    }
  }
  for (const player of players) {
    player.unranked = player.played - player.compared;
    player.generated = player.losses * 5 + player.bonus - player.dodged;
  }
  return { day, matchCount, players };
}
