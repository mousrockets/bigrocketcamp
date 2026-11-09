import { shiftDay, weekStart } from '../../lib/days';
import { type ExerciseType, exerciseDescription, exerciseType, exerciseTypes } from '../../lib/domain';
import { formatClock, formatRecentDay } from '../../lib/format';
import type { Board } from '../board';

type Exercise = Board['exercises'][number];

// What the journal of Défis reads from the board: who did what in the week shown, and when.

export interface JournalTotal {
  name: string;
  me: boolean;
  /** Repetitions for pushups and crunches, seconds for the plank; an exercise never done is absent. */
  counts: Partial<Record<ExerciseType, number>>;
}

export interface JournalEntry {
  id: string;
  /** « 17:18 », in Paris time. */
  clock: string;
  name: string;
  me: boolean;
  /** « 20 pompes », « 1,5 min de gainage ». */
  what: string;
}

export interface JournalDay {
  label: string;
  entries: JournalEntry[];
}

const known = (type: string): type is ExerciseType => (exerciseTypes as readonly string[]).includes(type);

function ofWeek(exercises: readonly Exercise[], roster: readonly string[], day: string): Exercise[] {
  const monday = weekStart(day);
  const sunday = shiftDay(monday, 6);
  return exercises.filter(
    (exercise) => roster.includes(exercise.player) && exercise.day >= monday && exercise.day <= sunday,
  );
}

/** Each exercise each player did in the week of `day`, added up; the member first, then the roster's order. */
export function weeklyTotals(
  exercises: readonly Exercise[],
  roster: readonly string[],
  me: string | null,
  day: string,
): JournalTotal[] {
  const week = ofWeek(exercises, roster, day);
  const totals = roster.flatMap((name) => {
    const counts: JournalTotal['counts'] = {};
    for (const exercise of week.filter((candidate) => candidate.player === name)) {
      const type = exerciseType(exercise);
      if (known(type)) counts[type] = (counts[type] ?? 0) + exercise.count;
    }
    return Object.keys(counts).length > 0 ? [{ name, me: name === me, counts }] : [];
  });
  return [...totals.filter((total) => total.me), ...totals.filter((total) => !total.me)];
}

/** The exercises of the week of `day`, newest first, by day. */
export function weeklyJournal(
  exercises: readonly Exercise[],
  roster: readonly string[],
  me: string | null,
  day: string,
  today: string,
): JournalDay[] {
  const days: JournalDay[] = [];
  const newestFirst = ofWeek(exercises, roster, day).sort(
    (a, b) => b.day.localeCompare(a.day) || b.created.localeCompare(a.created),
  );
  for (const exercise of newestFirst) {
    const label = formatRecentDay(exercise.day, today);
    let group = days.at(-1);
    if (group?.label !== label) {
      group = { label, entries: [] };
      days.push(group);
    }
    group.entries.push({
      id: exercise.id,
      clock: formatClock(exercise.created),
      name: exercise.player,
      me: exercise.player === me,
      what: exerciseDescription(exercise),
    });
  }
  return days;
}
