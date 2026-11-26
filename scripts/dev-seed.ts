// The fictitious club of `npm run db:seed` (docs/base-locale.md): three players, their matches, series, ranks and
// closed months over the two months before the current one. Its volumes and spreads follow production's aggregates
// (matches per evening, scores, forfeits, overtimes…), never its rows: the repository is public.
//
// Each day draws from its own random sequence, and the simulation always starts on the same day: a day gets the same
// matches whenever the seed runs, so running it again, even weeks later, only adds the days since.
import { parisDay, shiftDay, shiftMonth } from '../src/lib/days';
import {
  defaultForfeitRules,
  defaultHighScoreRules,
  defaultLastPlaceRules,
  forfeitRuleOn,
  highScorePoints,
  highScoreRuleOn,
  lastPlaceRuleOn,
  tournamentWinPushups,
} from '../src/lib/match-rules';
import type { MmrEntry } from '../src/lib/mmr-ledger';
import { midnightParis, monthBounds, monthCloseGraceMs, monthlyRanking, nextMonth } from '../src/lib/monthly-mmr';
import { currentSeason } from '../src/lib/season';
import { soundIds } from '../src/lib/sounds';

interface SeedMember {
  id: string;
  email: string;
  role: 'admin' | 'member';
  slot: string;
  platform: 'pc' | 'playstation';
  /** The main game ID first, then the other accounts the member confirmed. */
  playerIds: [string, ...string[]];
  /** Only a PC runs the collector: a console player's matches arrive through a teammate's. */
  collector: boolean;
  /** Their chance to win a 2v2 on their own, around the club's 47 %. */
  skill: number;
  /** How readily they pay their pushups: from a growing debt to none. */
  diligence: number;
  mmr: number;
  matchesBefore: number;
  bestMmr: number;
  solo?: { pseudo: string; playerId: string; mmr: number; matchesBefore: number };
}

export const seedMembers: readonly SeedMember[] = [
  {
    id: 'member-vincent',
    email: 'vincent@example.com',
    role: 'member',
    slot: 'chat-pris-tea',
    platform: 'pc',
    playerIds: ['Epic|chat-pris-tea-dev|0', 'Steam|chat-pris-tea-dev|0'],
    collector: true,
    skill: 0.47,
    diligence: 0.75,
    mmr: 1150,
    matchesBefore: 240,
    bestMmr: 1262,
    solo: { pseudo: 'chat-noir', playerId: 'Epic|chat-noir-dev|0', mmr: 1120, matchesBefore: 40 },
  },
  {
    id: 'member-dimitri',
    email: 'dimitri@example.com',
    role: 'admin',
    slot: 'nokouki',
    platform: 'pc',
    playerIds: ['Epic|nokouki-dev|0'],
    collector: true,
    skill: 0.52,
    diligence: 0.95,
    mmr: 1310,
    matchesBefore: 610,
    bestMmr: 1388,
    solo: { pseudo: 'nokouki-solo', playerId: 'Epic|nokouki-solo-dev|0', mmr: 1430, matchesBefore: 95 },
  },
  {
    id: 'member-kevin',
    email: 'kevin@example.com',
    role: 'member',
    slot: 'kevin-74000',
    platform: 'playstation',
    playerIds: ['PS4|kevin-74000-dev|0'],
    collector: false,
    skill: 0.44,
    diligence: 0.35,
    mmr: 1085,
    matchesBefore: 180,
    bestMmr: 1131,
    solo: { pseudo: 'kevin-solo', playerId: 'PS4|kevin-solo-dev|0', mmr: 1240, matchesBefore: 30 },
  },
];

/** Where every run starts: a day only depends on the days between it and this one. */
const simulationStart = '2026-08-01';
const confirmedAt = '2026-11-01T00:00:00.000Z';
const defeatPushups = 5;

// Production's spreads, from its first weeks.
const weekdayActivity = [0.75, 0.15, 0.95, 0.9, 0.65, 0.75, 0.45]; // Sunday first
const goalGaps: [number, number][] = [
  [1, 181],
  [2, 71],
  [3, 95],
  [4, 43],
  [5, 22],
  [6, 3],
  [8, 2],
];
const loserGoals: [number, number][] = [
  [0, 35],
  [1, 35],
  [2, 20],
  [3, 10],
];

// Doubles thresholds: Diamond III to Grand Champion I, four divisions each.
const tiers: [tier: number, from: number][] = [
  [15, 995],
  [16, 1075],
  [17, 1195],
  [18, 1315],
  [19, 1435],
  [20, 1575],
];

export function rankOf(mmr: number): { tier: number; division: number } {
  const index = tiers.findLastIndex(([, from]) => mmr >= from);
  const [tier, from] = tiers[Math.max(0, index)] ?? [15, 995];
  const to = tiers[Math.max(0, index) + 1]?.[1] ?? from + 140;
  const division = Math.min(4, Math.max(1, Math.floor(((mmr - from) / (to - from)) * 4) + 1));
  return { tier, division };
}

type Random = () => number;

function hashOf(text: string): number {
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 16777619);
  return hash >>> 0;
}

/** Mulberry32: a small, seeded generator, the same numbers on every machine. */
function randomFor(seed: string): Random {
  let state = hashOf(seed);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (random: Random, min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const pick = <T>(random: Random, list: readonly T[]): T => list[Math.floor(random() * list.length)] as T;
function weighted<T>(random: Random, entries: readonly [T, number][]): T {
  let left = random() * entries.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [value, weight] of entries) {
    left -= weight;
    if (left < 0) return value;
  }
  return entries[0]?.[0] as T;
}
const hexOf = (random: Random, length: number) =>
  Array.from({ length }, () => Math.floor(random() * 16).toString(16)).join('');

interface Opponent {
  name: string;
  playerId: string;
}

/** Invented gamertags: the opponents of production never leave it. */
const opponents: readonly Opponent[] = (() => {
  const random = randomFor('opponents');
  const starts = ['Turbo', 'Zephyr', 'Kraken', 'Nova', 'Pixel', 'Rafale', 'Comete', 'Panda', 'Volt', 'Orage', 'Lune'];
  const ends = ['Rider', 'Lynx', 'Fox', 'Boost', 'Flick', 'Dash', 'Ace', 'Storm', 'Kick', 'Drift'];
  const platforms: [string, number][] = [
    ['Epic', 60],
    ['PS4', 20],
    ['XboxOne', 10],
    ['Steam', 8],
    ['Switch', 2],
  ];
  return Array.from({ length: 90 }, () => {
    const name = `${pick(random, starts)}${pick(random, ends)}${random() < 0.5 ? between(random, 2, 99) : ''}`;
    return { name, playerId: `${weighted(random, platforms)}|seed-${hexOf(random, 16)}|0` };
  });
})();

interface Row {
  match_guid: string;
  player_id: string;
  name: string;
  day: string;
  kind: 'match';
  team: number;
  winner: number;
  score: number;
  goals: number;
  assists: number;
  saves: number;
  demos?: number;
  crossbar_hits?: number;
}

interface Ending {
  timeSeconds: number | null;
  overtime: boolean | null;
  opponentsGone: boolean | null;
  blueGoals: number | null;
  orangeGoals: number | null;
  playlist: number | null;
}

interface Match {
  guid: string;
  endsAt: number;
  rows: Row[];
  ending: Ending;
  club: SeedMember[];
  clubWon: boolean;
}

type Table = Record<string, unknown>[];

interface Tables {
  members: Table;
  player_identities: Table;
  player_identity_aliases: Table;
  result_observations: Table;
  source_reports: Table;
  collectors: Table;
  tournament_wins: Table;
  exercises: Table;
  exercise_reactions: Table;
  sound_draws: Table;
  mmr_entries: Table;
  solo_mmr_entries: Table;
  monthly_mmr_results: Table;
  drink_debts: Table;
}

const iso = (at: number) => new Date(at).toISOString();
const atParis = (day: string, minutes: number) => midnightParis(day) + minutes * 60_000;

/** Splits a team's goals between its players, with an assist from a teammate on most of them. */
function teamRows(
  random: Random,
  players: { name: string; playerId: string }[],
  base: Omit<Row, 'player_id' | 'name' | 'score' | 'goals' | 'assists' | 'saves'>,
  goals: number,
  withExtras: boolean,
): Row[] {
  const lines = players.map((player) => ({ ...player, goals: 0, assists: 0 }));
  for (let goal = 0; goal < goals; goal++) {
    const scorer = pick(random, lines);
    scorer.goals++;
    const mates = lines.filter((line) => line !== scorer);
    if (mates.length && random() < 0.55) pick(random, mates).assists++;
  }
  return lines.map((line) => {
    const saves = weighted(random, [
      [0, 20],
      [1, 30],
      [2, 25],
      [3, 15],
      [4, 7],
      [5, 3],
    ]);
    const demos = weighted(random, [
      [0, 45],
      [1, 35],
      [2, 15],
      [3, 5],
    ]);
    const crossbars = weighted(random, [
      [0, 65],
      [1, 28],
      [2, 7],
    ]);
    const score = 100 * line.goals + 50 * line.assists + 50 * saves + 25 * demos + between(random, 80, 320);
    return {
      match_guid: base.match_guid,
      player_id: line.playerId,
      name: line.name,
      day: base.day,
      kind: base.kind,
      team: base.team,
      winner: base.winner,
      score,
      goals: line.goals,
      assists: line.assists,
      saves,
      ...(withExtras ? { demos, crossbar_hits: crossbars } : {}),
    };
  });
}

function playMatch(
  random: Random,
  {
    day,
    endsAt,
    club,
    playlist,
    clock,
  }: { day: string; endsAt: number; club: SeedMember[]; playlist: number | null; clock: boolean },
): Match {
  const guid = hexOf(random, 32);
  // Tournament opponents are weaker on average than ranked ones.
  const edge = playlist === 34 ? 0.15 : 0;
  const skill = club.reduce((sum, member) => sum + member.skill, 0) / club.length + edge;
  const clubWon = random() < skill;
  const clubTeam = random() < 0.5 ? 0 : 1;
  const winner = clubWon ? clubTeam : 1 - clubTeam;
  const gap = weighted(random, goalGaps);
  const losing = weighted(random, loserGoals);
  const overtime = clock && gap === 1 && random() < 0.3;
  const forfeit = clock && !overtime && random() < 0.3;
  const goalsOf = (team: number) => (team === winner ? losing + gap : losing);
  const foes: Opponent[] = [];
  while (foes.length < club.length) {
    const foe = pick(random, opponents);
    if (!foes.includes(foe)) foes.push(foe);
  }
  const base = { match_guid: guid, day, kind: 'match' as const, winner };
  const clubPlayers = club.map((member) => ({
    name: member.slot,
    // Some evenings, a member plays from another of their confirmed accounts.
    playerId: member.playerIds.length > 1 && random() < 0.2 ? (member.playerIds[1] ?? '') : member.playerIds[0],
  }));
  const rows = [
    ...teamRows(random, clubPlayers, { ...base, team: clubTeam }, goalsOf(clubTeam), clock),
    ...teamRows(
      random,
      foes.map((foe) => ({ name: foe.name, playerId: foe.playerId })),
      { ...base, team: 1 - clubTeam },
      goalsOf(1 - clubTeam),
      clock,
    ),
  ];
  return {
    guid,
    endsAt,
    rows,
    club,
    clubWon,
    ending: {
      timeSeconds: clock ? (overtime ? between(random, 5, 180) : forfeit ? between(random, 15, 210) : 0) : null,
      overtime: clock ? overtime : null,
      opponentsGone: clock && forfeit && clubWon && random() < 0.25 ? true : null,
      blueGoals: clock ? goalsOf(0) : null,
      orangeGoals: clock ? goalsOf(1) : null,
      playlist,
    },
  };
}

async function sourceOf(memberId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(memberId));
  return `live-${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)}`;
}

/** Everything the seed writes, for the day `now` falls on: rows per table, in the order they must be written. */
export async function devSeedTables(now: number): Promise<Tables> {
  const today = parisDay(now);
  const firstMonth = shiftMonth(today.slice(0, 7), -2);
  const firstDay = `${firstMonth}-01`;
  const roster = seedMembers.map((member) => member.slot);
  const shown = (at: number) => at <= now && parisDay(at) >= firstDay;
  const tables: Tables = {
    members: seedMembers.map((member, index) => ({
      id: member.id,
      email: member.email,
      role: member.role,
      duo_pseudo: member.slot,
      solo_pseudo: member.solo?.pseudo ?? null,
      solo_player_id: member.solo?.playerId ?? null,
      platform: member.platform,
      roster_position: index + 1,
    })),
    player_identities: seedMembers.map((member) => ({
      slot: member.slot,
      owner: member.id,
      player_id: member.playerIds[0],
    })),
    player_identity_aliases: seedMembers.flatMap((member) =>
      member.playerIds.map((playerId) => ({
        player_id: playerId,
        slot: member.slot,
        confirmed_by: member.id,
        confirmed_at: confirmedAt,
      })),
    ),
    result_observations: [],
    source_reports: [],
    collectors: [],
    tournament_wins: [],
    exercises: [],
    exercise_reactions: [],
    sound_draws: [],
    mmr_entries: [],
    solo_mmr_entries: [],
    monthly_mmr_results: [],
    drink_debts: [],
  };
  const sources = new Map(
    await Promise.all(seedMembers.map(async (member) => [member.id, await sourceOf(member.id)] as const)),
  );
  const mmr = new Map(seedMembers.map((member) => [member.slot, member.mmr]));
  const soloMmr = new Map(
    seedMembers.flatMap((member) => (member.solo ? [[member.slot, member.solo.mmr] as const] : [])),
  );
  const debt = new Map(seedMembers.map((member) => [member.slot, 0]));
  const lastSeen = new Map<string, { at: number; rankedAt: number | null }>();

  const wonTournaments = new Set<string>();

  const record = (member: SeedMember, at: number, change: number) => {
    const current = mmr.get(member.slot) ?? member.mmr;
    // Each player drifts back to their level: a rating wanders, but never far.
    const value = current + change + Math.round((member.mmr - current) / 40);
    mmr.set(member.slot, value);
    if (!shown(at)) return;
    tables.mmr_entries.push({
      id: `seed-${member.slot}-${at}`,
      player: member.slot,
      mmr: value,
      ...rankOf(value),
      recorded_at: iso(at),
    });
  };

  for (let day = simulationStart; day <= today; day = shiftDay(day, 1)) {
    // One random sequence per day and per use, each drawn whatever is shown: a day never depends on `now`.
    const random = randomFor(`matches ${day}`);
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    const lastOfMonth = shiftDay(day, 1).slice(0, 7) !== day.slice(0, 7);
    // Some evenings come from an older collector, which sent no clock, playlist, demos or crossbar hits.
    const clock = random() >= 0.12;
    const matches: Match[] = [];
    if (random() < (weekdayActivity[weekday] ?? 0.5) || lastOfMonth) {
      const lineup = weighted<SeedMember[]>(random, [
        [[...seedMembers], 30],
        [[seedMembers[0], seedMembers[1]] as SeedMember[], 35],
        [[seedMembers[1], seedMembers[2]] as SeedMember[], 20],
        [[seedMembers[0], seedMembers[2]] as SeedMember[], 15],
      ]);
      const sessions = [{ start: 20 * 60 + between(random, 0, 90), count: between(random, 3, 12) }];
      if (random() < 0.25) sessions.unshift({ start: 13 * 60 + between(random, 0, 180), count: between(random, 2, 5) });
      const tournament = clock && (weekday === 0 || weekday === 6) && random() < 0.5;
      for (const [index, session] of sessions.entries()) {
        let minute = session.start;
        let rounds = index === sessions.length - 1 && tournament ? 2 : 0;
        for (let played = 0; played < session.count || rounds > 0; played++) {
          minute += between(random, 6, 10);
          const trio = lineup.length === 3 && rounds === 0 && random() < 0.35;
          const club = trio ? lineup : pick(random, pairsOf(lineup));
          const playlist = !clock ? null : rounds > 0 ? 34 : trio ? 13 : 11;
          const match = playMatch(random, { day, endsAt: atParis(day, minute), club, playlist, clock });
          matches.push(match);
          if (rounds > 0) {
            rounds = match.clubWon ? rounds - 1 : 0;
            if (match.clubWon && rounds === 0) {
              wonTournaments.add(match.guid);
              if (shown(match.endsAt + 600_000)) {
                tables.tournament_wins.push({ match_guid: match.guid, declared: iso(match.endsAt + 600_000) });
              }
            }
          }
        }
      }
    }

    // The simulated debt starts over each month: a month's series only depend on its own days, whatever `now` is.
    // What a player leaves unpaid still adds up on the board, which counts every match shown.
    if (day.endsWith('-01')) for (const member of seedMembers) debt.set(member.slot, 0);
    for (const match of matches) {
      for (const member of match.club) {
        debt.set(member.slot, Math.max(-50, (debt.get(member.slot) ?? 0) + dueFor(match, member, wonTournaments)));
        if (match.ending.playlist === 11) {
          record(
            member,
            match.endsAt + between(random, 60, 180) * 1000,
            (match.clubWon ? 1 : -1) * between(random, 7, 12),
          );
        }
      }
      const senders = match.club.filter((member) => member.collector);
      const sending = senders.length > 1 && random() < 0.15 ? senders : [pick(random, senders)];
      if (!shown(match.endsAt)) continue;
      for (const [position, sender] of sending.entries()) {
        const sourceId = sources.get(sender.id) ?? '';
        const received = iso(match.endsAt + (position + 1) * 4000);
        const players = [...match.rows].sort((a, b) => a.player_id.localeCompare(b.player_id));
        for (const [index, row] of match.rows.entries()) {
          tables.result_observations.push({
            id: `seed-${match.guid}-${position}-${index}`,
            match_guid: match.guid,
            player_id: row.player_id,
            source_id: sourceId,
            source_type: 'collector',
            payload: JSON.stringify(row),
            received,
          });
        }
        tables.source_reports.push({
          id: `seed-${match.guid}-${position}`,
          match_guid: match.guid,
          source_id: sourceId,
          source_type: 'collector',
          expected_players: match.rows.length,
          players: JSON.stringify(players),
          received,
          time_seconds: match.ending.timeSeconds,
          overtime: match.ending.overtime,
          opponents_gone: match.ending.opponentsGone,
          blue_goals: match.ending.blueGoals,
          orange_goals: match.ending.orangeGoals,
          playlist: match.ending.playlist,
        });
        const seen = lastSeen.get(sourceId);
        lastSeen.set(sourceId, {
          at: match.endsAt,
          rankedAt: match.ending.playlist === 11 ? match.endsAt : (seen?.rankedAt ?? null),
        });
      }
    }

    // The monthly challenge only closes on readings of the month's last day: everybody plays a ranked game then.
    for (const member of seedMembers) {
      const random = randomFor(`readings ${day} ${member.slot}`);
      const playedRanked = matches.some((match) => match.ending.playlist === 11 && match.club.includes(member));
      if (lastOfMonth && !playedRanked) {
        record(
          member,
          atParis(day, 22 * 60 + between(random, 30, 59)),
          (random() < 0.5 ? 1 : -1) * between(random, 7, 12),
        );
      }
      const solo = member.solo;
      if (solo && random() < 0.3) {
        let at = atParis(day, 17 * 60 + between(random, 0, 120));
        for (let game = between(random, 1, 4); game > 0; game--) {
          at += between(random, 7, 11) * 60_000;
          const current = soloMmr.get(member.slot) ?? solo.mmr;
          const change = (random() < member.skill + 0.03 ? 1 : -1) * between(random, 7, 12);
          const value = current + change + Math.round((solo.mmr - current) / 40);
          soloMmr.set(member.slot, value);
          if (shown(at)) {
            tables.solo_mmr_entries.push({
              id: `seed-solo-${member.slot}-${at}`,
              player: member.slot,
              player_id: solo.playerId,
              mmr: value,
              ...rankOf(value),
              recorded_at: iso(at),
            });
          }
        }
      }
    }

    for (const member of seedMembers) declareSeries(member, day, matches.length > 0);
  }

  function declareSeries(member: SeedMember, day: string, played: boolean) {
    const random = randomFor(`series ${day} ${member.slot}`);
    const owed = debt.get(member.slot) ?? 0;
    if (owed < 15 || random() > member.diligence * (played ? 1 : 0.4)) return;
    let left = random() < member.diligence / 2 ? owed : Math.round(owed * (0.3 + random() * 0.6));
    let at = atParis(day, played ? 23 * 60 + between(random, 0, 40) : between(random, 8 * 60, 21 * 60));
    while (left > 0) {
      const type = weighted(random, [
        ['pushups', 78],
        ['crunches', 12],
        ['plank', 10],
      ] as [string, number][]);
      const count =
        type === 'pushups'
          ? between(random, 2, 8) * 5
          : type === 'crunches'
            ? between(random, 2, 10) * 10
            : between(random, 2, 6) * 30;
      const credit = count * (type === 'plank' ? 0.25 : type === 'crunches' ? 0.5 : 1);
      left -= credit;
      const before = debt.get(member.slot) ?? 0;
      debt.set(member.slot, before - credit);
      at += between(random, 2, 6) * 60_000;
      const sound = pick(random, soundIds);
      const reaction = random() < 0.15;
      const friend = pick(
        random,
        seedMembers.filter((other) => other !== member),
      );
      const emoji = pick(random, ['💪', '🔥', '😂']);
      const reactedAt = at + between(random, 1, 90) * 60_000;
      if (!shown(at)) continue;
      const id = `seed-${member.slot}-${at}`;
      tables.exercises.push({
        id,
        player: member.slot,
        count,
        day: parisDay(at),
        created: iso(at),
        author: member.id,
        type,
      });
      // A series that clears its author's debt draws a sound.
      if (before > 0 && before - credit <= 0) {
        tables.sound_draws.push({ exercise_id: id, member_id: member.id, sound, drawn: iso(at) });
      }
      if (reaction && shown(reactedAt)) {
        tables.exercise_reactions.push({ exercise_id: id, author: friend.id, emoji, created: iso(reactedAt) });
      }
    }
  }

  for (const [id, seen] of lastSeen) {
    tables.collectors.push({
      id,
      last_seen: iso(seen.at),
      last_ranked_at: seen.rankedAt === null ? null : iso(seen.rankedAt),
    });
  }

  // Closed months, as the hourly task closes them: the app's own ranking, then the drinks the last player owes.
  const entries: MmrEntry[] = [
    ...tables.mmr_entries.map((entry) => ({ ...(entry as unknown as MmrEntry), account: 'duo' as const })),
    ...tables.solo_mmr_entries.map((entry) => ({ ...(entry as unknown as MmrEntry), account: 'solo' as const })),
  ];
  const closed: string[] = [];
  for (let month = firstMonth; month < today.slice(0, 7); month = nextMonth(month)) {
    const bounds = monthBounds(month);
    const closedAt = Date.parse(bounds.cutoffAt) + monthCloseGraceMs + 300_000;
    if (closedAt > now) continue;
    const ofMonth = entries.filter(
      (entry) => entry.recorded_at >= bounds.startAt && entry.recorded_at < bounds.cutoffAt,
    );
    const snapshot = monthlyRanking(roster, ofMonth, month);
    tables.monthly_mmr_results.push({
      month,
      cutoff_at: bounds.cutoffAt,
      closed_at: iso(closedAt),
      status: snapshot.status,
      snapshot: JSON.stringify(snapshot),
    });
    closed.push(month);
    for (const debt of snapshot.debts) {
      tables.drink_debts.push({ ...debt, paid_at: null, paid_by: null });
    }
  }
  // The older month's drinks were all offered; the latest month's, only the first one so far.
  for (const [index, month] of closed.entries()) {
    const debts = tables.drink_debts.filter((debt) => debt.month === month);
    const offered = index < closed.length - 1 ? debts : debts.slice(0, 1);
    for (const debt of offered) {
      const recipient = seedMembers.find((member) => member.slot === debt.recipient);
      const paidAt = Date.parse(monthBounds(month).cutoffAt) + monthCloseGraceMs + 2 * 86_400_000;
      if (recipient && paidAt <= now) Object.assign(debt, { paid_at: iso(paidAt), paid_by: recipient.id });
    }
  }
  return tables;
}

/** What a match costs a club player under the club's default rules: what the board will count, near enough. */
function dueFor(match: Match, member: SeedMember, wonTournaments: ReadonlySet<string>): number {
  const row = match.rows.find((line) => line.name === member.slot);
  if (!row) return 0;
  const day = row.day;
  const clubScores = match.rows.filter((line) => match.club.some((other) => other.slot === line.name));
  const lowest = clubScores.every((line) => line === row || line.score > row.score);
  const lastPlace =
    !match.clubWon && clubScores.length > 1 && lowest && lastPlaceRuleOn(defaultLastPlaceRules, day).enabled;
  const highScore = row.score >= highScorePoints && highScoreRuleOn(defaultHighScoreRules, day).enabled;
  const forfeited = match.ending.overtime === false && (match.ending.timeSeconds ?? 0) > 0;
  const forfeitWon = match.clubWon && forfeited && forfeitRuleOn(defaultForfeitRules, day).enabled;
  return (
    (match.clubWon ? 0 : defeatPushups) +
    (lastPlace ? defeatPushups : 0) -
    (highScore ? 10 : 0) -
    (forfeitWon ? defeatPushups : 0) -
    (wonTournaments.has(match.guid) ? tournamentWinPushups : 0)
  );
}

function pairsOf(lineup: SeedMember[]): SeedMember[][] {
  return lineup.flatMap((first, index) => lineup.slice(index + 1).map((second) => [first, second]));
}

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function inserts(table: string, rows: Table, onConflict = 'ON CONFLICT DO NOTHING'): string[] {
  const statements: string[] = [];
  for (let start = 0; start < rows.length; start += 20) {
    const chunk = rows.slice(start, start + 20);
    const columns = Object.keys(chunk[0] ?? {});
    const values = chunk.map((row) => `(${columns.map((column) => sqlValue(row[column])).join(',')})`);
    statements.push(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${values.join(',')} ${onConflict};`);
  }
  return statements;
}

/** Ranks shown on the cards: each account's latest reading, its season peak and its all-time best. */
function rankRows(tables: Tables, now: number): { duo: Table; solo: Table } {
  const latest = (rows: Table, player: string) => rows.filter((row) => row.player === player).at(-1);
  const peak = (rows: Table, player: string) =>
    rows
      .filter((row) => row.player === player)
      .reduce<Record<string, unknown> | undefined>(
        (top, row) => (top && Number(top.mmr) >= Number(row.mmr) ? top : row),
        undefined,
      );
  const fetchedAt = iso(now - 120_000);
  const card = (rows: Table, player: string, matchesBefore: number, best: number) => {
    const last = latest(rows, player);
    const top = peak(rows, player);
    if (!last || !top) return [];
    const bestMmr = Math.max(best, Number(top.mmr));
    const bestRank = rankOf(bestMmr);
    return [
      {
        player,
        mmr: last.mmr,
        tier: last.tier,
        division: last.division,
        matches_played: matchesBefore + rows.filter((row) => row.player === player).length,
        placement_matches: null,
        fetched_at: fetchedAt,
        status: 'ready',
        season: currentSeason.number,
        peak_mmr: top.mmr,
        peak_tier: top.tier,
        peak_division: top.division,
        peak_at: top.recorded_at,
        best_mmr: bestMmr,
        best_tier: bestRank.tier,
        best_division: bestRank.division,
      },
    ];
  };
  return {
    duo: seedMembers.flatMap((member) =>
      card(tables.mmr_entries, member.slot, member.matchesBefore, member.bestMmr).map((row) => ({
        ...row,
        player_id: member.playerIds[0],
        last_attempt: fetchedAt,
      })),
    ),
    solo: seedMembers.flatMap((member) =>
      member.solo
        ? card(tables.solo_mmr_entries, member.slot, member.solo.matchesBefore, member.solo.mmr + 40).map((row) => ({
            ...row,
            player_id: member.solo?.playerId,
          }))
        : [],
    ),
  };
}

/** The seed as SQL statements, one per line: nothing it already wrote is written twice. */
export async function devSeed(now: number = Date.now()): Promise<string[]> {
  const tables = await devSeedTables(now);
  const ranks = rankRows(tables, now);
  const firstMonth = shiftMonth(parisDay(now).slice(0, 7), -2);
  const newer = (table: string, rows: Table) =>
    `ON CONFLICT(player) DO UPDATE SET ${Object.keys(rows[0] ?? {})
      .filter((column) => column !== 'player')
      .map((column) => `${column}=excluded.${column}`)
      .join(',')} WHERE ${table}.fetched_at IS NULL OR ${table}.fetched_at <= excluded.fetched_at`;
  return [
    // Members keep what was changed locally (a solo pseudo set by hand, for one).
    ...inserts(
      'members',
      tables.members,
      'ON CONFLICT(id) DO UPDATE SET solo_pseudo=excluded.solo_pseudo,solo_player_id=excluded.solo_player_id WHERE members.solo_pseudo IS NULL',
    ),
    ...inserts('player_identities', tables.player_identities),
    ...inserts('player_identity_aliases', tables.player_identity_aliases),
    `INSERT INTO monthly_mmr_policy (id,starts_month) VALUES (1,'${firstMonth}') ON CONFLICT(id) DO UPDATE SET starts_month=excluded.starts_month WHERE monthly_mmr_policy.starts_month>excluded.starts_month;`,
    ...inserts('result_observations', tables.result_observations),
    ...inserts('source_reports', tables.source_reports),
    ...inserts(
      'collectors',
      tables.collectors,
      'ON CONFLICT(id) DO UPDATE SET last_seen=max(collectors.last_seen,excluded.last_seen),last_ranked_at=coalesce(excluded.last_ranked_at,collectors.last_ranked_at)',
    ),
    ...inserts('tournament_wins', tables.tournament_wins),
    ...inserts('exercises', tables.exercises),
    ...inserts('exercise_reactions', tables.exercise_reactions),
    ...inserts('sound_draws', tables.sound_draws),
    ...inserts('mmr_entries', tables.mmr_entries),
    ...inserts('solo_mmr_entries', tables.solo_mmr_entries),
    ...inserts('player_ranks', ranks.duo, newer('player_ranks', ranks.duo)),
    ...inserts('solo_ranks', ranks.solo, newer('solo_ranks', ranks.solo)),
    ...inserts('monthly_mmr_results', tables.monthly_mmr_results),
    ...inserts('drink_debts', tables.drink_debts),
  ];
}
