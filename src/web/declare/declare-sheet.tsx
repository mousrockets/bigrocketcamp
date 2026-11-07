import { cn } from 'cn';
import { MinusIcon, PlusIcon, XIcon } from 'lucide-react';
import { type CSSProperties, useEffect, useRef } from 'react';
import { exerciseDescription, exerciseEffect, formatNumber } from '../../lib/domain';
import { payoffFor } from '../board/model';
import type { Declaration, ExerciseType } from '../board/types';
import { Segmented } from '../components/club/segmented';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import type { DeclareForm } from './declare-context';
import { useKeyboardInset } from './keyboard-inset';

// The sheet over any page (a window on a wide screen): who, which exercise, how much, and what it repays.

const typeItems: { value: ExerciseType; label: string }[] = [
  { value: 'pushups', label: 'Pompes' },
  { value: 'plank', label: 'Gainage' },
  { value: 'crunches', label: 'Abdos' },
];
const quickSteps: Record<ExerciseType, number[]> = {
  pushups: [5, 10, 20],
  plank: [0.25, 0.5, 1],
  crunches: [10, 20, 40],
};
const stepOf: Record<ExerciseType, number> = { pushups: 5, plank: 0.25, crunches: 10 };
const unitLabels: Record<ExerciseType, string> = { pushups: 'pompes', plank: 'min de gainage', crunches: 'abdos' };
const limitOf = (type: ExerciseType) => (type === 'plank' ? 1000 : 10000);
const round = (value: number) => Math.round(value * 100) / 100;

function Cell({ label, value, className }: { label: string; value: string; className?: string | undefined }) {
  return (
    <div className="flex flex-col items-center gap-0.5 p-2.5">
      <small className="text-[11px] font-semibold text-muted-foreground">{label}</small>
      <b className={cn('font-numeral text-[22px]', className)}>{value}</b>
    </div>
  );
}

export function DeclareSheet({
  open,
  onOpenChange,
  form,
  onChange,
  roster,
  me,
  debt,
  pending,
  busy,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: DeclareForm;
  onChange: (next: Partial<DeclareForm>) => void;
  roster: readonly string[];
  me: string | null;
  /** The chosen player's debt, or null while the board loads. */
  debt: number | null;
  pending: Declaration | null;
  busy: boolean;
  error: string;
  onSubmit: () => void;
}) {
  const locked = !!pending || busy;
  const { type, count } = form;
  const seconds = type === 'plank' ? Math.round(count * 60) : count;
  const valid = Number.isFinite(count) && count > 0;
  const effect = debt !== null && valid ? exerciseEffect(debt, { type, count: seconds }) : null;
  const payoff = debt ? payoffFor(type, debt) : 0;
  const limit = limitOf(type);
  const players = [...(me && roster.includes(me) ? [me] : []), ...roster.filter((name) => name !== me)].map((name) => ({
    value: name,
    label: name === me ? 'Toi' : name,
  }));
  // While the keyboard is open, the sheet sits on top of it and keeps the field and the button in view.
  const keyboard = useKeyboardInset(open);
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const focused = document.activeElement;
    if (keyboard && focused instanceof HTMLElement && content.current?.contains(focused)) {
      focused.scrollIntoView({ block: 'nearest' });
    }
  }, [keyboard]);
  const add = (amount: number) =>
    onChange({ count: Math.min(limit, Math.max(stepOf[type], round((Number.isFinite(count) ? count : 0) + amount))) });

  return (
    <Dialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <DialogContent
        ref={content}
        showCloseButton={false}
        data-keyboard={keyboard ? '' : undefined}
        style={
          keyboard
            ? ({
                '--keyboard-bottom': `${keyboard.bottom}px`,
                '--keyboard-top': `${keyboard.height}px`,
              } as CSSProperties)
            : undefined
        }
        className={cn(
          'group/sheet *:shrink-0 top-auto bottom-[var(--keyboard-bottom,0px)] left-0 flex max-h-[min(92dvh,calc(var(--keyboard-top,100dvh)-12px))] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-4 overflow-y-auto rounded-t-[30px] rounded-b-none border-t border-border bg-popover px-[18px] pt-2.5 pb-0 ring-0 sm:max-w-none',
          'data-open:slide-in-from-bottom data-closed:slide-out-to-bottom data-open:zoom-in-100 data-closed:zoom-out-100',
          'lg:top-1/2 lg:bottom-auto lg:left-1/2 lg:max-w-[560px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:gap-[18px] lg:rounded-[28px] lg:border lg:p-7 lg:shadow-[0_40px_120px_rgb(0_0_0/0.6)] lg:data-open:slide-in-from-bottom-4',
        )}
      >
        <i aria-hidden="true" className="h-[5px] w-[38px] self-center rounded-full bg-faint lg:hidden" />
        <div className="flex items-end justify-between gap-3 lg:items-start">
          <div className="flex flex-col gap-1">
            <span className="kicker">Pour aujourd’hui</span>
            <DialogTitle className="font-display text-[26px] leading-tight lg:text-3xl">
              Déclarer un exercice
            </DialogTitle>
          </div>
          <DialogClose
            render={<Button variant="ghost" size="icon-xl" className="size-9 bg-surface text-soft lg:size-10" />}
          >
            <XIcon />
            <span className="sr-only">Fermer</span>
          </DialogClose>
        </div>
        <DialogDescription className="sr-only">
          Choisis le joueur, l’exercice et la quantité ; la série réduit sa dette de pompes.
        </DialogDescription>

        <Segmented
          label="Pour qui"
          items={players}
          value={pending?.player ?? form.player}
          disabled={locked}
          onChange={(player) => onChange({ player })}
          className="bg-surface"
        />
        <Segmented
          label="Exercice"
          items={typeItems}
          value={pending?.type ?? type}
          disabled={locked}
          onChange={(next) => onChange({ type: next })}
          className="bg-surface"
        />

        <div className="grid grid-cols-[60px_1fr_60px] items-center gap-2 lg:grid-cols-[64px_1fr_64px]">
          <Button
            type="button"
            variant="secondary"
            aria-label="Moins"
            disabled={locked || !valid || count <= stepOf[type]}
            onClick={() => add(-stepOf[type])}
            className="size-[60px] rounded-[20px] border border-input bg-surface lg:size-16"
          >
            <MinusIcon className="size-6" />
          </Button>
          <div className="flex flex-col items-center gap-0.5">
            <label htmlFor="declare-count" className="sr-only">
              {type === 'plank'
                ? 'Durée de gainage en minutes'
                : type === 'crunches'
                  ? 'Nombre d’abdos'
                  : 'Nombre de pompes'}
            </label>
            <Input
              id="declare-count"
              type="number"
              inputMode="decimal"
              min={type === 'plank' ? 0.25 : 1}
              step={type === 'plank' ? 0.25 : 1}
              max={limit}
              required
              disabled={locked}
              value={Number.isNaN(count) ? '' : count}
              onChange={(event) => onChange({ count: event.target.valueAsNumber })}
              aria-describedby="declare-credit"
              className="h-auto w-full appearance-none border-0 bg-transparent p-0 text-center font-numeral text-[88px] leading-[0.85] shadow-none focus-visible:ring-0 lg:text-[104px] dark:bg-transparent [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span aria-hidden="true" className="text-[13px] font-semibold text-muted-foreground">
              {unitLabels[type]}
            </span>
          </div>
          <Button
            type="button"
            variant="secondary"
            aria-label="Plus"
            disabled={locked}
            onClick={() => add(stepOf[type])}
            className="size-[60px] rounded-[20px] border border-input bg-surface lg:size-16"
          >
            <PlusIcon className="size-6" />
          </Button>
        </div>

        <fieldset
          aria-label="Quantités rapides"
          className="no-scrollbar -mx-[18px] flex min-w-0 gap-2 overflow-x-auto px-[18px] lg:mx-0 lg:flex-wrap lg:justify-center lg:px-0"
        >
          {quickSteps[type].map((amount) => (
            <Button
              key={amount}
              type="button"
              variant="outline"
              disabled={locked}
              onClick={() => add(amount)}
              className="h-10 rounded-full border-input bg-transparent px-3.5 text-sm font-semibold dark:bg-transparent"
            >
              +{formatNumber(amount)}
              {type === 'plank' ? ' min' : ''}
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={locked || !payoff}
            onClick={() => onChange({ count: payoff })}
            className="h-10 rounded-full border-primary/50 bg-transparent px-3.5 text-sm font-semibold text-link dark:bg-transparent"
          >
            Tout rembourser{payoff ? ` (${formatNumber(payoff)}${type === 'plank' ? ' min' : ''})` : ''}
          </Button>
        </fieldset>

        <div id="declare-credit" aria-live="polite" className="grid grid-cols-3 rounded-[14px] bg-surface">
          <Cell label="Équivalent" value={effect ? formatNumber(effect.equivalent) : '—'} />
          <div className="border-x border-border">
            <Cell label="Dette" value={debt === null ? '…' : formatNumber(debt)} />
          </div>
          <Cell
            label="Restera"
            value={effect ? formatNumber(effect.remaining) : '—'}
            className={effect?.remaining === 0 ? 'text-settled' : undefined}
          />
        </div>
        {effect && effect.excess > 0 && (
          <p className="-mt-1 text-center text-xs text-muted-foreground">
            {debt === 0
              ? 'Aucune dette en cours : la série compte quand même dans l’historique et les totaux.'
              : `${formatNumber(effect.excess)} équiv. pompes de plus que la dette : le solde reste à zéro, toute la série est gardée dans l’historique.`}
          </p>
        )}
        <p className="-mt-1 text-center text-xs text-muted-foreground">
          1 min de gainage = 15 pompes · 20 abdos = 10 pompes
          {type === 'plank' && ' · par tranches de 15 s'}
        </p>

        {pending && (
          <Alert>
            <AlertDescription>
              Déclaration en attente : {exerciseDescription(pending)} pour {pending.player}. Réessayer ne la comptera
              pas deux fois.
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="sticky bottom-0 z-10 -mx-[18px] -mt-2 flex gap-2.5 bg-popover px-[18px] pt-2 pb-[max(env(safe-area-inset-bottom),24px)] group-data-[keyboard]/sheet:pb-3 lg:static lg:mx-0 lg:mt-0 lg:p-0">
          <DialogClose
            render={
              <Button
                variant="outline"
                className="hidden h-14 rounded-2xl border-input bg-transparent px-[22px] text-[15px] font-semibold text-soft lg:inline-flex dark:bg-transparent"
              />
            }
          >
            Annuler
          </DialogClose>
          <Button
            type="button"
            variant="action"
            disabled={busy || (!pending && !valid)}
            onClick={onSubmit}
            className="h-14 flex-1 rounded-2xl text-lg"
          >
            {busy ? 'Enregistrement…' : pending ? 'Réessayer la déclaration' : 'Valider la série'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
