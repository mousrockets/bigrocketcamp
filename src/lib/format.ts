import { sameParisDay } from './days';

// How the app writes numbers, times and dates, in French and in Paris time. Every text shown to a member goes
// through this module, so that "1 509", "19 h 42" or "il y a 8 min" read the same everywhere.

const numbers = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2, useGrouping: 'always' });
const times = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
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

/** "19 h 42", in Paris time. */
export const formatTime = (at: Date | number | string): string => times.format(new Date(at)).replace(':', ' h ');

/** "5 nov.", in Paris time. */
export const formatShortDate = (at: Date | number | string): string => shortDates.format(new Date(at));

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
