import { useMutation } from '@tanstack/react-query';
import { cn } from 'cn';
import { formatMonth, formatNumber, plural } from '../../lib/format';
import { type Board, useBoardState } from '../board';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '../components/ui/item';
import { settleDrink } from '../writes';
import { countdown, type DrinkDebt, openDebts, type StandingLine, standingLines } from './standings';

type Monthly = NonNullable<Board['monthly']>;

const accountNames = { duo: 'Duo', solo: 'Solo' } as const;
const rankIcon = (tier: number | null) => `/rocket-league/ranks/${tier ?? 0}.png`;
const two = (value: number) => String(value).padStart(2, '0');
/** "d’octobre", "de novembre". */
const ofMonth = (month: string) => {
  const name = formatMonth(month).toLowerCase();
  return /^[aeiou]/.test(name) ? `d’${name}` : `de ${name}`;
};

const row = 'flex-nowrap gap-3 rounded-none border-0 px-4 py-3 [line-height:normal]';
const words = 'min-w-0 gap-[3px] *:truncate';

/** « Qui paie sa tournée ? »: the month's 2v2 MMR standings, the time left before they close, and who pays. */
export function MonthlyChallenge({
  monthly,
  doublesRanks,
  me,
  now,
}: {
  monthly: Monthly;
  doublesRanks: Board['doublesRanks'];
  me: string | null;
  now: number;
}) {
  const { current } = monthly;
  const lines = standingLines(current.rows, doublesRanks, me);
  const drinks = lines.length - 1;
  const debts = openDebts(monthly.debts);
  return (
    <div className="flex flex-col gap-[18px]">
      <span className="flex flex-col gap-1.5">
        <span className="label-caps">Défi du mois · {formatMonth(current.month)} · 2v2</span>
        <h2 className="title-display text-[24px]">Qui paie sa tournée ?</h2>
      </span>
      <Countdown cutoffAt={current.cutoffAt} now={now} />
      <Card variant="glass">
        <ol aria-label="Classement du mois" className="m-0 list-none p-0">
          {lines.map((line) => (
            <Standing key={line.player} line={line} drinks={drinks} />
          ))}
        </ol>
      </Card>
      <p className="m-0 text-[12px] text-t3 [line-height:1.5]">
        On garde le meilleur MMR 2v2 de chacun, entre son compte duo et son compte solo, relevé le dernier jour du mois.
        Le dernier offre une boisson à chacun des autres, soft ou pas. Ex æquo à la dernière place : personne ne paie.
      </p>
      {debts.length > 0 && <Debts debts={debts} />}
    </div>
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

function Standing({ line, drinks }: { line: StandingLine; drinks: number }) {
  const account = line.account ? accountNames[line.account] : null;
  return (
    <li
      className={cn(
        'border-line not-first:border-t-[.5px]',
        line.pays && 'bg-linear-to-b from-cost-strong/7 to-cost-strong/2',
      )}
    >
      <Item className={row}>
        <b className="num w-3.5 shrink-0 text-center text-[17px] text-t3">{line.position}</b>
        <ItemMedia className="translate-y-0 self-center">
          <img
            src={rankIcon(line.rank?.tier ?? null)}
            alt={line.rank ? `Icône de rank ${line.rank.name}` : ''}
            width={34}
            height={34}
            className={cn('size-[34px] object-contain', !line.rank && 'opacity-40')}
          />
        </ItemMedia>
        <ItemContent className={words}>
          <span className="flex min-w-0 items-center gap-1.5">
            <ItemTitle className="truncate font-semibold text-[15px] [line-height:normal]">{line.player}</ItemTitle>
            {line.me && <Badge variant="me">TOI</Badge>}
          </span>
          <ItemDescription className="text-[12px] text-t3 [line-height:normal]">
            {account ? [account, line.rank?.name].filter(Boolean).join(' · ') : 'Pas encore relevé ce mois-ci'}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <b className="num text-[24px] [line-height:1]">{line.mmr === null ? '—' : formatNumber(line.mmr)}</b>
        </ItemActions>
      </Item>
      {line.pays && (
        <div className="mx-3 mb-3 flex items-center gap-2.5 rounded-[14px] bg-linear-135 from-cost-strong/22 to-cost-strong/8 px-3 py-2.5 text-cost shadow-[inset_0_.5px_0_rgba(255,210,160,.35),inset_0_0_0_.5px_rgba(255,159,69,.25)]">
          <DrinkIcon />
          <b className="flex-1 font-semibold text-[#ffd2a1] text-[14px]">Paie ta tournée !</b>
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
                  {debt.payer} → {debt.recipient}
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
