import { parisDay } from '../../lib/domain';
import type { DrinkDebt, MonthResult } from '../board/monthly';

// The words of the month's challenge, in the design's "Fun assumé" tone: built from the club's data only.

const monthName = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', month: 'long' });
const dayAndMonth = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long' });
const clock = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
const hourOf = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' });
const shortDay = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'short' });

/** "novembre" for "2026-11". */
export const monthOf = (month: string) => monthName.format(new Date(`${month}-15T12:00:00Z`));

/** "Novembre", as a title. */
export const titleMonthOf = (month: string) => {
  const name = monthOf(month);
  return name.charAt(0).toUpperCase() + name.slice(1);
};

/** "le 30 novembre à 23 h 59": a close at midnight is the last minute of the month's last day. */
export function closingLabel(cutoffAt: string): string {
  const cutoff = new Date(cutoffAt);
  const time = clock.format(cutoff);
  if (time === '00:00') return `le ${dayAndMonth.format(new Date(cutoff.getTime() - 60_000))} à 23 h 59`;
  return `le ${dayAndMonth.format(cutoff)} à ${time.replace(':', ' h ')}`;
}

/** "31/10" for the last day "2026-10-31". */
export const dayMonthOf = (day: string) => day.slice(5).split('-').reverse().join('/');

/** When a ranking was read, as the design says it: "ce soir", "hier", "le 5 nov.". */
export function readingLabel(recordedAt: string, now: number): string {
  const read = new Date(recordedAt);
  const day = parisDay(read);
  if (day === parisDay(new Date(now))) {
    const hour = Number(hourOf.format(read));
    return hour < 12 ? 'ce matin' : hour < 18 ? 'cet après-midi' : 'ce soir';
  }
  if (day === parisDay(new Date(now - 86_400_000))) return 'hier';
  return `le ${shortDay.format(read)}`;
}

const numberWords = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix'];

/** The sentence under a closed month's name. */
export function closedMonthLine(result: MonthResult): string {
  if (result.status === 'final') {
    const loser = result.losers?.[0] ?? '';
    const others = result.rows.length - 1;
    const share =
      others === 1
        ? 'Une boisson pour l’autre joueur.'
        : `Une boisson pour chacun des ${numberWords[others] ?? others} autres.`;
    return `${loser} finit lanterne rouge. Santé ! ${share}`;
  }
  if (result.status === 'tied') return 'Égalité parfaite en bas du classement : tout le monde garde son porte-monnaie.';
  return `Pas de dette automatique : MMR de fin de mois manquant pour ${result.missing.join(', ')}.`;
}

/** The debts of a month in the order the design lists them: the ones the member can settle first. */
export const debtsInOrder = (debts: DrinkDebt[]) =>
  [...debts].sort((a, b) => Number(b.canSettle && !b.paidAt) - Number(a.canSettle && !a.paidAt));

export type MonthSummary = {
  tone: 'owed' | 'settled' | 'missing';
  title: string;
  detail: string;
  /** The drink the member can mark as drunk from the summary. */
  settle?: DrinkDebt;
  /** The drink the member marked a moment ago and can still take back. */
  undo?: DrinkDebt;
};

/**
 * One closed month in a line, as the wide screen's "Bilans et boissons" cards show it. The card speaks of the
 * drink its button acts on: one the member can mark as drunk, else one they marked a moment ago, else the
 * next one owed.
 */
export function monthSummary(result: MonthResult, debts: DrinkDebt[]): MonthSummary {
  const month = titleMonthOf(result.month);
  if (result.status === 'tied') return { tone: 'settled', title: `${month} · ex æquo`, detail: 'Aucune boisson due' };
  if (result.status !== 'final')
    return { tone: 'missing', title: `${month} · pas de dette`, detail: 'MMR de fin de mois manquant' };
  if (!debts.length) return { tone: 'settled', title: `${month} · pas de dette`, detail: 'Aucune boisson due' };
  const unpaid = debtsInOrder(debts.filter((debt) => !debt.paidAt));
  const owedTo = (shown: DrinkDebt) => unpaid.filter((debt) => debt !== shown).map((debt) => debt.recipient);
  const settle = unpaid.find((debt) => debt.canSettle);
  const undo = settle ? undefined : debts.find((debt) => debt.paidAt && debt.canUndo);
  if (undo) {
    const others = owedTo(undo);
    return {
      tone: 'settled',
      title: `${month} · ${undo.payer} → ${undo.recipient}`,
      detail: `C’est bu${others.length ? ` · encore à offrir à ${others.join(', ')}` : ''}`,
      undo,
    };
  }
  const shown = settle ?? unpaid[0];
  if (!shown) return { tone: 'settled', title: `${month} · tournée payée`, detail: 'Toutes les boissons sont bues' };
  const others = owedTo(shown);
  return {
    tone: 'owed',
    title: `${month} · ${shown.payer} → ${shown.recipient}`,
    detail: `1 boisson à offrir${others.length ? ` · aussi à ${others.join(', ')}` : ''}`,
    ...(settle && { settle }),
  };
}
