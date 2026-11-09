import { cn } from 'cn';
import type { ReactNode } from 'react';
import { formatNumber, plural } from '../../lib/format';
import { PeriodKicker } from '../components/period-picker';
import { Badge } from '../components/ui/badge';
import type { PodiumStep } from './standings';

// The first in the middle and highest, the second on the left, the third on the right; read in rank order.
const steps = {
  1: { column: 'col-start-2', height: 132 },
  2: { column: 'col-start-1', height: 96 },
  3: { column: 'col-start-3', height: 66 },
} as const;
const placeOf = (index: number) => steps[(index + 1) as 1 | 2 | 3];

/**
 * « Les bras d’or »: the three players with the most pushups in the week shown, on a podium, with the picker of the
 * week. The podium stands even when nobody climbed it: a step nobody earned stays empty.
 */
export function WeeklyPodium({
  podium,
  picker,
  current,
}: {
  podium: PodiumStep[];
  picker: ReactNode;
  /** The week going on, still open to anyone. */
  current: boolean;
}) {
  return (
    <div className="flex flex-col gap-[18px]">
      <span className="flex flex-col gap-1.5">
        <PeriodKicker kicker="Podium de la semaine" picker={picker} />
        <h2 className="title-display text-[24px]">Les bras d’or</h2>
      </span>
      <ol className="m-0 grid list-none grid-cols-3 items-end gap-2 p-0">
        {[0, 1, 2].map((index) => {
          const step = podium[index];
          return step ? (
            <Step key={step.name} step={step} place={placeOf(index)} />
          ) : (
            <EmptyStep key={index} rank={index + 1} place={placeOf(index)} />
          );
        })}
      </ol>
      {podium.length === 0 && (
        <p className="m-0 text-center text-[15px] text-t2 [line-height:1.45]">
          {current
            ? 'Personne n’a encore sué cette semaine. L’or est à prendre.'
            : 'Personne n’a sué cette semaine-là.'}
        </p>
      )}
    </div>
  );
}

/** A step nobody earned: a dash for the name, its pedestal and its number, greyed. */
function EmptyStep({ rank, place }: { rank: number; place: (typeof steps)[keyof typeof steps] }) {
  return (
    <li className={cn('row-start-1 flex min-w-0 flex-col items-center gap-2.5', place.column)}>
      <span aria-hidden="true" className="font-semibold text-[13px] text-t3">
        —
      </span>
      <span aria-hidden="true" className="h-[30px]" />
      <div
        className="flex w-full origin-bottom animate-pedestal justify-center rounded-[16px_16px_6px_6px] bg-linear-to-b from-white/5 to-white/1.5 pt-3 shadow-[inset_0_1px_0_rgba(255,255,255,.1),inset_0_0_0_.5px_rgba(255,255,255,.05)]"
        style={{ height: steps[rank as 1 | 2 | 3].height, animationDelay: `${0.15 + (3 - rank) * 0.08}s` }}
      >
        <b className="num text-[30px] text-t3 opacity-60 [line-height:1]">
          <span className="sr-only">Place </span>
          {rank}
          <span className="sr-only"> : personne</span>
        </b>
      </div>
    </li>
  );
}

function Step({ step, place }: { step: PodiumStep; place: (typeof steps)[keyof typeof steps] }) {
  const first = step.rank === 1;
  const height = steps[Math.min(step.rank, 3) as 1 | 2 | 3].height;
  return (
    <li className={cn('row-start-1 flex min-w-0 flex-col items-center gap-2.5', place.column)}>
      <span className="flex max-w-full items-center gap-[5px]">
        <b className="truncate font-semibold text-[13px]">{step.name}</b>
        {step.me && <Badge variant="me">TOI</Badge>}
      </span>
      <span className="flex flex-col items-center gap-1">
        <b className={cn('num [line-height:.8]', first ? 'text-[40px]' : 'text-[30px]')}>
          {formatNumber(step.pushups)}
        </b>
        <span className="label-caps text-[10px]">{plural(step.pushups, 'pompe')}</span>
      </span>
      <div
        className={cn(
          'flex w-full origin-bottom animate-pedestal justify-center rounded-[16px_16px_6px_6px] pt-3',
          first
            ? 'bg-linear-to-b from-white/22 to-white/6 shadow-[inset_0_1px_0_rgba(255,255,255,.45),inset_0_0_0_.5px_rgba(255,255,255,.12),0_-10px_40px_-10px_rgba(255,255,255,.35)]'
            : 'bg-linear-to-b from-white/9 to-white/2.5 shadow-[inset_0_1px_0_rgba(255,255,255,.18),inset_0_0_0_.5px_rgba(255,255,255,.07)]',
        )}
        style={{ height, animationDelay: `${0.15 + (3 - step.rank) * 0.08}s` }}
      >
        <b className={cn('num text-[30px] [line-height:1]', first ? 'text-t1' : 'text-t3')}>
          <span className="sr-only">Place </span>
          {step.rank}
        </b>
      </div>
    </li>
  );
}
