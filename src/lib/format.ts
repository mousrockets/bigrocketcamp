import { sameParisDay, shiftDay } from './days';

// How the app writes numbers, times and dates, in French and in Paris time. Every text shown to a member goes
// through this module, so that "1 509", "19 h 42" or "il y a 8 min" read the same everywhere.

const numbers = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2, useGrouping: 'always' });
const longDays = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
// A club month ("2026-11") is read at noon UTC on the 15th: the same month in every time zone.
const monthNames = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', month: 'long' });
const shortDates = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short' });

/**
 * "1 509": a full space between thousands, from 1 000 up. French writes it narrow, which the condensed figures
 * squeeze to nothing.
 */
export const formatNumber = (value: number): string => numbers.format(value).replace(/[\u202f\u00a0]/g, '\u00a0');

/** The word, with an s from 2 on: "1 pompe", "0 pompe", "2 pompes". */
export const plural = (count: number, word: string, pluralForm = `${word}s`): string =>
  Math.abs(count) >= 2 ? pluralForm : word;

/** "35 pompes": a number and its word. */
export const count = (value: number, word: string, pluralWord?: string): string =>
  `${formatNumber(value)} ${plural(value, word, pluralWord)}`;

const clocks = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });

/** "21:40", in Paris time: a match's kickoff in a list, like a scoreboard writes it. */
/** "1er", "2ème". */
export const formatPlace = (position: number): string => (position === 1 ? '1er' : `${position}ème`);

export const formatClock = (at: Date | number | string): string => clocks.format(new Date(at));

/** "19 h 42", in Paris time. */
export const formatTime = (at: Date | number | string): string => formatClock(at).replace(':', ' h ');

/** "5 nov.", in Paris time. */
export const formatShortDate = (at: Date | number | string): string => shortDates.format(new Date(at));

const capitalized = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** "Samedi 7 novembre", in Paris time: the day above a tab's title. */
export const formatLongDay = (at: Date | number | string): string => capitalized(longDays.format(new Date(at)));

/** "Novembre": the name of a club month, written "2026-11". */
export const formatMonth = (month: string): string => capitalized(monthNames.format(new Date(`${month}-15T12:00:00Z`)));

/** A club day, "2026-11-07", read at noon in Paris: the same day whatever the time zone. */
const noonOf = (day: string) => `${day}T12:00:00+01:00`;

const shortDays = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const shortMonths = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', month: 'short', year: 'numeric' });

const weekdayDates = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric' });

/** "Jeudi 5 novembre": a club day, written "2026-11-05", in full. */
export const formatDay = (day: string): string => formatLongDay(noonOf(day));

/** "vendredi 6": a club day of the week going on. */
export const formatWeekdayDate = (day: string): string => weekdayDates.format(new Date(noonOf(day)));

/** "Mar. 3 nov.": a club day, written "2026-11-03", in a few letters. */
export const formatShortDay = (day: string): string => capitalized(shortDays.format(new Date(noonOf(day))));

/** « Aujourd’hui », « Hier · vendredi 6 », then the club day in full: a day heading in a list, newest first. */
export function formatRecentDay(day: string, today: string): string {
  if (day === today) return 'Aujourd’hui';
  if (day === shiftDay(today, -1)) return `Hier · ${formatWeekdayDate(day)}`;
  return formatDay(day);
}

const dayMonths = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long' });

/** "31 octobre": a club day, written "2026-10-31", in a sentence. */
export const formatDayMonth = (day: string): string => dayMonths.format(new Date(noonOf(day)));

/** "3 nov.": a club day, written "2026-11-03". */
export const formatDayDate = (day: string): string => formatShortDate(noonOf(day));

/** "26 oct. – 1 nov.": the days of a club week, from its Monday. */
export const formatWeek = (monday: string): string => {
  const sunday = new Date(Date.parse(noonOf(monday)) + 6 * 86_400_000);
  return `${formatDayDate(monday)} – ${formatShortDate(sunday)}`;
};

/** "Oct. 2026": a club month, written "2026-10", in a few letters. */
export const formatShortMonth = (month: string): string =>
  capitalized(shortMonths.format(new Date(`${month}-15T12:00:00Z`)));

/** "à 19 h 42" today, "le 5 nov. à 22 h 10" another day. */
export const formatWhen = (at: Date | number | string, now: Date | number = Date.now()): string =>
  sameParisDay(at, now) ? `à ${formatTime(at)}` : `le ${formatShortDate(at)} à ${formatTime(at)}`;

/** "il y a 8 min": how long ago something happened. */
export function formatAge(at: Date | number | string, now: Date | number = Date.now()): string {
  const minutes = Math.max(0, Math.floor((Number(now) - new Date(at).getTime()) / 60_000));
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `il y a ${count(days, 'jour')}`;
}
