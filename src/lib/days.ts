import { addDays, formatISO, parseISO, startOfISOWeek } from 'date-fns';

// The club lives in Paris: a day is the Paris calendar day, written "2026-11-07". Every day computation goes
// through this module.

const parisCalendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The Paris day of a moment: "2026-11-07". */
export const parisDay = (at: Date | number | string = new Date()): string => parisCalendar.format(new Date(at));

/** The Paris month of a moment: "2026-11". */
export const parisMonth = (at: Date | number | string = new Date()): string => parisDay(at).slice(0, 7);

const asDate = (day: string) => parseISO(day);
const asDay = (date: Date) => formatISO(date, { representation: 'date' });

/** The day `delta` days after (or before) `day`. */
export const shiftDay = (day: string, delta: number): string => asDay(addDays(asDate(day), delta));

/** The Monday of the week of `day`. */
export const weekStart = (day: string): string => asDay(startOfISOWeek(asDate(day)));

/** Whether two moments fall on the same Paris day. */
export const sameParisDay = (a: Date | number | string, b: Date | number | string): boolean =>
  parisDay(a) === parisDay(b);
