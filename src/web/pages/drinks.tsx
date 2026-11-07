import { useMutation } from '@tanstack/react-query';
import { CheckIcon, CupSodaIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { formatNumber } from '../../lib/domain';
import { useBoardState } from '../board/board-context';
import { BackLink, PageHeader, Panel } from '../components/club/page';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { settleDrink } from '../writes';
import { monthOf } from './challenge';

// The closed months, newest first: who finished last, and the drinks they owe until each one is marked given.

const closedOn = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' });
const paidOn = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long' });
const accountLabels = { duo: 'duo', solo: 'solo' } as const;

export function DrinksPage() {
  const { data, refresh } = useBoardState();
  const monthly = data?.monthly;
  const [busy, setBusy] = useState(false);
  const writing = useRef(false);
  const settle = useMutation({ mutationFn: settleDrink }).mutateAsync;
  const mine = new Set(monthly?.allowedPlayers ?? []);

  async function act(body: Parameters<typeof settleDrink>[0], done: string) {
    if (writing.current) return;
    writing.current = true;
    setBusy(true);
    try {
      await settle(body);
      toast.success(done);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }

  const closed = [...(monthly?.closed ?? [])].sort((a, b) => b.month.localeCompare(a.month));
  return (
    <>
      <PageHeader
        back={<BackLink to="/defi" label="Retour au défi" />}
        kicker="Bilans mensuels"
        title="Bilans et boissons"
      />
      {!data ? (
        <Skeleton className="h-[300px] rounded-card" />
      ) : !closed.length ? (
        <p className="px-1 text-sm text-muted-foreground">Le premier bilan apparaîtra à la fin de ce mois.</p>
      ) : (
        <div className="flex flex-col gap-3.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5">
          {closed.map((result) => {
            const debts = (monthly?.debts ?? []).filter((debt) => debt.month === result.month);
            return (
              <Panel key={result.month} aria-label={monthOf(result.month)}>
                <div className="flex flex-col gap-2 p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="font-display text-[22px] first-letter:uppercase">{monthOf(result.month)}</h2>
                    <span className="kicker">Clos le {closedOn.format(new Date(result.cutoffAt))}</span>
                  </div>
                  <p className="text-sm leading-[1.45] text-soft">
                    {result.status === 'final'
                      ? `${result.losers?.[0] ?? ''} termine dernier : une boisson à chacun des autres.`
                      : result.status === 'tied'
                        ? 'Ex æquo à la dernière place : aucune dette.'
                        : `Pas de dette automatique : MMR de fin de mois manquant pour ${result.missing.join(', ')}.`}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {result.rows
                      .map(
                        (row) =>
                          `${row.player} ${row.mmr !== null ? formatNumber(row.mmr) : 'non renseigné'}${row.account ? ` (${accountLabels[row.account]})` : ''}`,
                      )
                      .join(' · ')}
                  </p>
                </div>
                {debts.length === 0 ? (
                  <div className="grid grid-cols-[40px_1fr] items-center gap-3 border-t border-border px-4 py-3">
                    <span
                      aria-hidden="true"
                      className="flex size-10 items-center justify-center rounded-xl bg-settled/12 text-settled"
                    >
                      <CheckIcon className="size-5" />
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <b className="text-sm font-semibold">Aucune boisson due</b>
                      <small className="text-xs text-muted-foreground">
                        Classement arrêté au {closedOn.format(new Date(result.cutoffAt))}
                      </small>
                    </span>
                  </div>
                ) : (
                  debts.map((debt) => (
                    <div
                      key={debt.id}
                      className="grid grid-cols-[40px_1fr_auto] items-center gap-3 border-t border-border px-4 py-3"
                    >
                      <span
                        aria-hidden="true"
                        className={
                          debt.paidAt
                            ? 'flex size-10 items-center justify-center rounded-xl bg-settled/12 text-settled'
                            : 'flex size-10 items-center justify-center rounded-xl bg-cost/14 text-cost-soft'
                        }
                      >
                        {debt.paidAt ? <CheckIcon className="size-5" /> : <CupSodaIcon className="size-5" />}
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <b className="text-sm font-semibold">
                          {debt.payer} → {debt.recipient}
                        </b>
                        <small className={debt.paidAt ? 'text-xs text-muted-foreground' : 'text-xs text-cost-soft'}>
                          1 boisson · {debt.paidAt ? `offerte le ${paidOn.format(new Date(debt.paidAt))}` : 'à offrir'}
                        </small>
                      </span>
                      {!debt.paidAt && debt.canSettle ? (
                        <Button
                          variant="inverse"
                          disabled={busy}
                          onClick={() => act({ action: 'settle', id: debt.id }, 'Boisson marquée comme offerte.')}
                          className="h-9 rounded-full px-3 font-sans text-[13px] font-semibold"
                        >
                          {mine.has(debt.recipient) ? 'Boisson reçue' : 'Boisson offerte'}
                        </Button>
                      ) : debt.paidAt && debt.canUndo ? (
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => act({ action: 'undo', id: debt.id }, 'Paiement annulé.')}
                          className="h-9 rounded-full px-3 text-[13px]"
                        >
                          Annuler
                        </Button>
                      ) : (
                        <span />
                      )}
                    </div>
                  ))
                )}
              </Panel>
            );
          })}
        </div>
      )}
    </>
  );
}
