import { cn } from 'cn';
import { useId } from 'react';
import { formatNumber } from '../../lib/domain';
import { useBoardState } from '../board/board-context';
import type { DrinkDebt, MonthResult } from '../board/monthly';
import { DrinkButton, DrinkTile, useDrinkActions } from '../components/club/drink-parts';
import { BackLink, PageHeader, Panel } from '../components/club/page';
import { Skeleton } from '../components/ui/skeleton';
import { closedMonthLine, dayMonthOf, debtsInOrder, monthOf, titleMonthOf } from './challenge-copy';

// The closed months, newest first: who finished last, and the drinks they owe until each one is marked drunk.

const paidOn = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long' });

type DrinkActions = ReturnType<typeof useDrinkActions>;

/** The design's .dr: a drink, who owes it to whom, and its button. */
function DebtRow({ debt, actions }: { debt: DrinkDebt; actions: DrinkActions }) {
  const id = useId();
  return (
    <div className="grid grid-cols-[40px_1fr_auto] items-center gap-3 border-t border-border px-4 py-3">
      <DrinkTile tone={debt.paidAt ? 'settled' : 'owed'} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <b id={id} className="text-sm font-semibold">
          {debt.payer} → {debt.recipient}
        </b>
        <small className={cn('text-xs', debt.paidAt ? 'text-muted-foreground' : 'text-cost-soft')}>
          1 boisson · {debt.paidAt ? `bue le ${paidOn.format(new Date(debt.paidAt))}` : 'à offrir'}
        </small>
      </span>
      {!debt.paidAt && debt.canSettle ? (
        <DrinkButton kind="settle" disabled={actions.busy} onClick={() => actions.settle(debt)} describedBy={id} />
      ) : debt.paidAt && debt.canUndo ? (
        <DrinkButton kind="undo" disabled={actions.busy} onClick={() => actions.undo(debt)} describedBy={id} />
      ) : (
        <span />
      )}
    </div>
  );
}

/**
 * A closed month as the design draws it: its drinks under a line when its last owes some; when the month could
 * not be decided, "Aucune boisson due" inside the card; a tie needs nothing more than its sentence.
 */
function MonthCard({ result, debts, actions }: { result: MonthResult; debts: DrinkDebt[]; actions: DrinkActions }) {
  const head = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-[22px]">{titleMonthOf(result.month)}</h2>
        <span className="kicker">Clos le {dayMonthOf(result.lastDay)}</span>
      </div>
      <p className="text-sm leading-[1.45] text-soft">{closedMonthLine(result)}</p>
      {result.status !== 'incomplete' && (
        <p className="text-xs text-muted-foreground tabular-nums">
          {result.rows
            .map((row) => `${row.player} ${row.mmr !== null ? formatNumber(row.mmr) : 'non renseigné'}`)
            .join(' · ')}
        </p>
      )}
    </>
  );
  if (result.status === 'final' && debts.length > 0) {
    return (
      <Panel aria-label={monthOf(result.month)} className="overflow-hidden">
        <div className="flex flex-col gap-2 p-4">{head}</div>
        {debtsInOrder(debts).map((debt) => (
          <DebtRow key={debt.id} debt={debt} actions={actions} />
        ))}
      </Panel>
    );
  }
  return (
    <Panel aria-label={monthOf(result.month)} className="gap-2 p-4">
      {head}
      {result.status !== 'tied' && (
        <div className="grid grid-cols-[40px_1fr_auto] items-center gap-3 border-t border-border pt-3">
          <DrinkTile tone="settled" />
          <span className="flex flex-col gap-0.5">
            <b className="text-sm font-semibold">Aucune boisson due</b>
            <small className="text-xs text-muted-foreground">
              Classement arrêté au {dayMonthOf(result.lastDay)}, 23 h 59
            </small>
          </span>
          <span />
        </div>
      )}
    </Panel>
  );
}

export function DrinksPage() {
  const { data } = useBoardState();
  const monthly = data?.monthly;
  const actions = useDrinkActions();
  const closed = [...(monthly?.closed ?? [])].sort((a, b) => b.month.localeCompare(a.month));
  return (
    <>
      <PageHeader back={<BackLink to="/defi" label="Retour au défi" />} kicker="Bilans mensuels" title="Les tournées" />
      {!data ? (
        <Skeleton className="h-[300px] rounded-card" />
      ) : !closed.length ? (
        <p className="px-1 text-sm text-muted-foreground">Le premier bilan apparaîtra à la fin de ce mois.</p>
      ) : (
        <div className="flex flex-col gap-3.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5">
          {closed.map((result) => (
            <MonthCard
              key={result.month}
              result={result}
              debts={(monthly?.debts ?? []).filter((debt) => debt.month === result.month)}
              actions={actions}
            />
          ))}
        </div>
      )}
    </>
  );
}
