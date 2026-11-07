import { cn } from 'cn';
import { Check, Minus, Plus, X } from 'lucide-react';
import { useState } from 'react';
import type { ExerciseType } from '../../lib/domain';
import { formatNumber } from '../../lib/format';
import { Button } from '../components/ui/button';
import { DialogClose, DialogTitle } from '../components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group';
import type { Debt } from '../team/stats';
import { kindOrder, kinds, minus, payoff, plus, pushupsOf } from './quantities';

const segments = 24;

export interface Series {
  type: ExerciseType;
  /** In the sheet's unit: repetitions, or minutes of plank. */
  amount: number;
  /** What it is worth in pushups. */
  pushups: number;
}

/** The sheet's content: what exercise, how much, what it is worth and what will be left. */
export function DeclareSheet({
  debt,
  sending,
  onDeclare,
}: {
  debt: Debt;
  sending: boolean;
  onDeclare: (series: Series) => void;
}) {
  const [type, setType] = useState<ExerciseType>('pushups');
  const [amount, setAmount] = useState(kinds.pushups.start);
  const kind = kinds[type];
  const pushups = pushupsOf(type, amount);
  const equivalent = Math.min(debt.left, pushups);
  const after = Math.max(0, debt.left - pushups);
  const paid = debt.owed > 0 ? Math.round((debt.paid / debt.owed) * segments) : 0;
  const preview = debt.owed > 0 ? Math.round(((debt.paid + equivalent) / debt.owed) * segments) : 0;
  const settles = after === 0;

  const pick = (next: ExerciseType) => {
    setType(next);
    setAmount(kinds[next].start);
  };

  return (
    <>
      <i aria-hidden="true" className="-mb-2 h-[5px] w-9 self-center rounded-[3px] bg-white/22 lg:hidden" />
      <div className="flex items-start justify-between gap-3">
        <span className="flex flex-col gap-1.5">
          <span className="label-caps">Tes défis · {formatNumber(debt.left)} à rendre</span>
          <DialogTitle className="title-display font-bold text-[30px] [line-height:normal]">
            Vas-y champion !
          </DialogTitle>
        </span>
        <DialogClose render={<Button variant="soft" size="round" aria-label="Fermer" />}>
          <X strokeWidth={2.4} />
        </DialogClose>
      </div>

      <ToggleGroup
        aria-label="Exercice"
        value={[type]}
        onValueChange={(value: string[]) => {
          const [next] = value;
          if (next) pick(next as ExerciseType);
        }}
        spacing={0}
        className="relative grid h-9 w-full grid-cols-3 rounded-[11px] bg-[rgba(118,118,128,.22)] p-0.5"
      >
        <i
          aria-hidden="true"
          className="absolute top-0.5 left-0.5 h-8 w-[calc((100%-4px)/3)] rounded-[9px] bg-[rgba(120,120,128,.55)] shadow-[inset_0_.5px_0_rgba(255,255,255,.18),0_3px_8px_rgba(0,0,0,.25)] transition-transform duration-[450ms] ease-(--ease)"
          style={{ transform: `translateX(${kindOrder.indexOf(type) * 100}%)` }}
        />
        {kindOrder.map((value) => (
          <ToggleGroupItem
            key={value}
            value={value}
            className="relative z-1 h-8 rounded-[9px] bg-transparent font-semibold text-[14px] text-t2 hover:bg-transparent hover:text-t1 aria-pressed:bg-transparent aria-pressed:text-t1"
          >
            {kinds[value].label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="flex items-center justify-between gap-2">
        <Button variant="step" size="step" aria-label="Moins" onClick={() => setAmount(minus(type, amount))}>
          <Minus strokeWidth={2.4} />
        </Button>
        <div aria-live="polite" className="flex flex-col items-center gap-2">
          <b className="num text-[112px] tracking-[-.035em] [line-height:.78]">{formatNumber(amount)}</b>
          <span className="font-medium text-[14px] text-t2">{kind.unit}</span>
        </div>
        <Button variant="step" size="step" aria-label="Plus" onClick={() => setAmount(plus(amount, kind.step))}>
          <Plus strokeWidth={2.4} />
        </Button>
      </div>

      <fieldset className="m-0 flex gap-2 border-0 p-0">
        <legend className="sr-only">Ajouts rapides</legend>
        {kind.quick.map((quick) => (
          <Button key={quick} variant="chip" size="chip" onClick={() => setAmount(plus(amount, quick))}>
            +{formatNumber(quick)}
          </Button>
        ))}
        <Button
          variant="chip"
          size="chip"
          disabled={debt.left === 0}
          onClick={() => setAmount(payoff(type, debt.left))}
          className="flex-1 bg-white/14"
        >
          Tout rendre
        </Button>
      </fieldset>

      <div className="flex flex-col gap-3 rounded-[18px] bg-white/4 px-4 py-3.5 shadow-[inset_0_0_0_.5px_rgba(255,255,255,.07)]">
        <div aria-hidden="true" className="flex gap-[3px]">
          {Array.from({ length: segments }, (_, index) => (
            <i
              // biome-ignore lint/suspicious/noArrayIndexKey: the segments are fixed, the index is their identity.
              key={index}
              className={cn(
                'h-2 flex-1 rounded-[2px] transition-[background-color,box-shadow] duration-500 ease-(--ease)',
                index < paid
                  ? 'bg-[rgba(245,245,247,.42)]'
                  : index < preview
                    ? cn(
                        'animate-[breathe_1.6s_ease-in-out_infinite]',
                        settles
                          ? 'bg-win shadow-[0_0_10px_rgba(76,211,138,.55)]'
                          : 'bg-t1 shadow-[0_0_10px_rgba(255,255,255,.5)]',
                      )
                    : 'bg-white/8',
              )}
            />
          ))}
        </div>
        <div aria-live="polite" className="flex items-end justify-between gap-3">
          <span className="flex flex-col gap-1.5">
            <span className="label-caps">Équivalent</span>
            <span className="flex items-baseline gap-1.5">
              <b className="num text-[24px] [line-height:.85]">{formatNumber(equivalent)}</b>
              <span className="text-[13px] text-t2">pompes</span>
            </span>
          </span>
          <span className="flex flex-col items-end gap-1.5">
            <span className="label-caps">Restera</span>
            <span className="flex items-baseline gap-1.5">
              <span className="text-[13px] text-t3 tabular-nums">{formatNumber(debt.left)} →</span>
              <b className={cn('num text-[24px] [line-height:.85]', settles && 'text-win')}>{formatNumber(after)}</b>
            </span>
          </span>
        </div>
      </div>

      <p className="-mt-1.5 mb-0 text-center text-[12px] text-t3">
        1 min de gainage = 15 pompes · 20 abdos = 10 pompes
      </p>

      <Button variant="cta" size="cta-tall" disabled={sending} onClick={() => onDeclare({ type, amount, pushups })}>
        <Check strokeWidth={2.6} />
        {sending ? 'Envoi…' : settles ? 'Ardoise propre, je valide' : 'Valider la série'}
      </Button>
    </>
  );
}
