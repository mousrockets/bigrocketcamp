import { useMutation } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { cn } from 'cn';
import { CheckIcon } from 'lucide-react';
import type { ClosedMonth } from '../../lib/contract/monthly';
import { formatDayMonth, formatMonth, formatNumber, formatPlace, formatShortMonth, plural } from '../../lib/format';
import { type Board, useBoardState } from '../board';
import { useClub } from '../club';
import { NowDot, PeriodKicker, PeriodPicker, periodLabelClass } from '../components/period-picker';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '../components/ui/item';
import { settleDrink } from '../writes';
import { countdown, type DrinkDebt, openDebts, type StandingLine, standingLines } from './standings';

type Monthly = NonNullable<Board['monthly']>;

const accountNames = { duo: 'Duo', solo: 'Solo' } as const;
const mmrOf = (value: number | null) => (value === null ? '0' : formatNumber(value));
const two = (value: number) => String(value).padStart(2, '0');
/** "d’octobre", "de novembre". */
const ofMonth = (month: string) => {
  const name = formatMonth(month).toLowerCase();
  return /^[aeiou]/.test(name) ? `d’${name}` : `de ${name}`;
};

/** The first name a player gave, or else their duo pseudo. */
function useNameOf(): (player: string) => string {
  const { players } = useClub();
  return (player) => players.find((candidate) => candidate.slot === player)?.firstName ?? player;
}

const row = 'flex-nowrap gap-3 rounded-none border-0 px-4 py-3 [line-height:normal]';
const words = 'min-w-0 gap-[3px] *:truncate';

/**
 * « Qui paie sa tournée ? »: the month's 2v2 MMR standings, the time left before they close, and who pays; with the
 * picker of the month, which leads to each closed month as it closed.
 */
export function MonthlyChallenge({
  monthly,
  me,
  now,
  month,
}: {
  monthly: Monthly;
  me: string | null;
  now: number;
  /** The month asked for, « 2026-10 »; the month going on without one. */
  month: string | undefined;
}) {
  const { current } = monthly;
  const closed = monthly.closed.find((candidate) => candidate.month === month && month !== current.month);
  const months = [...new Set([...monthly.closed.map((candidate) => candidate.month), current.month])].sort();
  const index = months.indexOf(closed?.month ?? current.month);
  const at = (target: string | undefined) => (target === current.month ? undefined : target);
  const before = months[index - 1];
  const after = months[index + 1];
  const picker = (
    <PeriodPicker
      label="Mois affiché"
      previous={before ? { search: { mois: before }, label: 'Mois précédent' } : null}
      next={after ? { search: { mois: at(after) }, label: 'Mois suivant' } : null}
    >
      {closed ? (
        <Link
          to="."
          search={(search: Record<string, unknown>) => ({ ...search, mois: undefined })}
          resetScroll={false}
          aria-label={`${formatShortMonth(closed.month)}, revenir au mois en cours`}
          className={periodLabelClass}
        >
          {formatShortMonth(closed.month)}
        </Link>
      ) : (
        <span className={periodLabelClass}>
          <NowDot />
          {formatMonth(current.month)}
        </span>
      )}
    </PeriodPicker>
  );
  return (
    <div className="flex flex-col gap-[18px]">
      <span className="flex flex-col gap-1.5">
        <PeriodKicker kicker="Défi du mois · 2v2" picker={picker} />
        <h2 className="title-display text-[24px]">
          {closed ? `Le verdict ${ofMonth(closed.month)}` : 'Qui paie sa tournée ?'}
        </h2>
      </span>
      {closed ? <ClosedStandings month={closed} me={me} /> : <LiveStandings monthly={monthly} me={me} now={now} />}
    </div>
  );
}

function LiveStandings({ monthly, me, now }: { monthly: Monthly; me: string | null; now: number }) {
  const { current } = monthly;
  const lines = standingLines(current.rows, me);
  const debts = openDebts(monthly.debts);
  return (
    <>
      <Countdown cutoffAt={current.cutoffAt} now={now} />
      <Standings lines={lines} />
      {debts.length > 0 && <Debts debts={debts} />}
    </>
  );
}

const nobodyPays = {
  tied: ' Égalité à la dernière place : personne ne paie.',
  incomplete: ' Un relevé manquait : personne ne paie.',
} as Partial<Record<string, string>>;

/** A closed month as it froze: when its MMR were read, its standings, and the last one. */
function ClosedStandings({ month, me }: { month: ClosedMonth; me: string | null }) {
  const losers = month.status === 'final' ? (month.losers ?? []) : [];
  const lines = standingLines(month.rows, me).map((line) => ({ ...line, pays: losers.includes(line.player) }));
  return (
    <>
      <Card variant="tile" className="flex-none flex-row items-center gap-2.5 px-3.5 py-3">
        <CheckIcon aria-hidden="true" strokeWidth={2.4} className="size-4 shrink-0 text-win" />
        <span className="text-[14px] text-t2">
          Mois clos, MMR relevés le {formatDayMonth(month.lastDay)}.{nobodyPays[month.status] ?? ''}
        </span>
      </Card>
      <Standings lines={lines} closed />
    </>
  );
}

function Standings({ lines, closed = false }: { lines: StandingLine[]; closed?: boolean }) {
  return (
    <Card variant="glass">
      <ol aria-label="Classement du mois" className="m-0 list-none p-0">
        {lines.map((line) => (
          <Standing key={line.player} line={line} drinks={lines.length - 1} closed={closed} />
        ))}
      </ol>
    </Card>
  );
}

/** Days, hours and minutes before the month's standings freeze. */
function Countdown({ cutoffAt, now }: { cutoffAt: string; now: number }) {
  const { days, hours, minutes } = countdown(cutoffAt, now);
  const parts = [
    { value: String(days), unit: plural(days, 'jour') },
    { value: two(hours), unit: plural(hours, 'heure') },
    { value: two(minutes), unit: 'min' },
  ];
  return (
    <div
      role="timer"
      aria-label={`Clôture dans ${days} ${plural(days, 'jour')}, ${hours} ${plural(hours, 'heure')} et ${minutes} ${plural(minutes, 'minute')}`}
      className="flex gap-2"
    >
      {parts.map(({ value, unit }) => (
        <Card key={unit} variant="tile" aria-hidden="true">
          <b className="num text-[30px] [line-height:.85]">{value}</b>
          <span className="label-caps text-[10px]">{unit}</span>
        </Card>
      ))}
    </div>
  );
}

function Standing({ line, drinks, closed }: { line: StandingLine; drinks: number; closed: boolean }) {
  const nameOf = useNameOf();
  const account = line.account ? accountNames[line.account] : null;
  return (
    <li
      className={cn(
        'border-line not-first:border-t-[.5px]',
        line.pays && 'bg-linear-to-b from-cost-strong/7 to-cost-strong/2',
      )}
    >
      <Item className={row}>
        <b className="num w-11 shrink-0 self-center text-[22px] text-t2 [line-height:1]">
          {line.position}
          <span className="align-super font-semibold font-sans text-[10px]">
            {formatPlace(line.position).slice(String(line.position).length)}
          </span>
        </b>
        <ItemContent className={words}>
          <span className="flex min-w-0 items-center gap-1.5">
            <ItemTitle className="truncate font-semibold text-[15px] [line-height:normal]">
              {nameOf(line.player)}
            </ItemTitle>
            {line.me && <Badge variant="me">TOI</Badge>}
          </span>
          <ItemDescription className="text-[12px] text-t3 [line-height:normal]">
            {line.mmr === null
              ? 'Pas encore relevé ce mois-ci'
              : line.accounts
                ? `Duo ${mmrOf(line.accounts.duo)} + Solo ${mmrOf(line.accounts.solo)}`
                : account}
          </ItemDescription>
          {!closed && line.gap && (
            <ItemDescription className="font-semibold text-[12px] text-t2 [line-height:normal]">
              +{formatNumber(line.gap.mmr)} pour passer {formatPlace(line.gap.position)}
            </ItemDescription>
          )}
        </ItemContent>
        <ItemActions>
          <b className="num text-[24px] [line-height:1]">{line.mmr === null ? '—' : formatNumber(line.mmr)}</b>
        </ItemActions>
      </Item>
      {line.pays && (
        <div className="mx-3 mb-3 flex items-center gap-2.5 rounded-[14px] bg-linear-135 from-cost-strong/22 to-cost-strong/8 px-3 py-2.5 text-cost shadow-[inset_0_.5px_0_rgba(255,210,160,.35),inset_0_0_0_.5px_rgba(255,159,69,.25)]">
          <DrinkIcon />
          <b className="flex-1 font-semibold text-[#ffd2a1] text-[14px]">
            {closed ? 'Dernier du mois' : 'Paie ta tournée !'}
          </b>
          <span className="font-semibold text-[13px] tabular-nums">
            {drinks} {plural(drinks, 'boisson')}
          </span>
        </div>
      )}
    </li>
  );
}

/** The drinks owed by a closed month, which the payer or the recipient marks offered. */
function Debts({ debts }: { debts: DrinkDebt[] }) {
  const { refresh } = useBoardState();
  const nameOf = useNameOf();
  const settle = useMutation({ mutationFn: settleDrink, onSuccess: () => refresh() });
  return (
    <div className="flex flex-col gap-2.5">
      <span className="label-caps">Tournées à offrir</span>
      <Card variant="glass">
        <ul aria-label="Tournées à offrir" className="m-0 list-none p-0">
          {debts.map((debt) => (
            <Item key={debt.id} render={<li />} className={cn(row, 'border-line not-first:border-t-[.5px]')}>
              <ItemContent className={words}>
                <ItemTitle className="font-semibold text-[15px] [line-height:normal]">
                  {nameOf(debt.payer)} → {nameOf(debt.recipient)}
                </ItemTitle>
                <ItemDescription
                  className={cn('text-[12px] [line-height:normal]', debt.paidAt ? 'text-win' : 'text-t3')}
                >
                  {debt.paidAt ? 'Offerte' : '1 boisson'} · défi {ofMonth(debt.month)}
                </ItemDescription>
              </ItemContent>
              {(debt.paidAt ? debt.canUndo : debt.canSettle) && (
                <ItemActions>
                  <Button
                    variant="line"
                    className="h-8 rounded-full px-3 text-[13px]"
                    disabled={settle.isPending}
                    onClick={() => settle.mutate({ action: debt.paidAt ? 'undo' : 'settle', id: debt.id })}
                  >
                    {debt.paidAt ? 'Annuler' : 'Boisson offerte'}
                  </Button>
                </ItemActions>
              )}
            </Item>
          ))}
        </ul>
      </Card>
      {settle.error && (
        <p role="alert" className="m-0 text-[13px] text-destructive">
          {settle.error.message}
        </p>
      )}
    </div>
  );
}

function DrinkIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 4h10l-1.2 15a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8z" />
      <path d="M16 8h1.5a2.5 2.5 0 0 1 0 5H15.6" />
      <path d="M6.4 9h9.2" />
    </svg>
  );
}
