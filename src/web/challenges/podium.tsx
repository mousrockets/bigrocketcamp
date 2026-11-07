import { cn } from 'cn';
import { formatNumber, plural } from '../../lib/format';
import { Badge } from '../components/ui/badge';
import type { PodiumStep } from './standings';

// The first in the middle and highest, the second on the left, the third on the right; read in rank order.
const steps = {
  1: { column: 'col-start-2', height: 132 },
  2: { column: 'col-start-1', height: 96 },
  3: { column: 'col-start-3', height: 66 },
} as const;
const placeOf = (index: number) => steps[(index + 1) as 1 | 2 | 3];

/** « Les bras d’or »: the week's three players with the most pushups, on a podium. */
export function WeeklyPodium({ podium }: { podium: PodiumStep[] }) {
  return (
    <div className="flex flex-col gap-[18px]">
      <span className="flex flex-col gap-1.5">
        <span className="label-caps">Podium de la semaine</span>
        <h2 className="title-display text-[24px]">Les bras d’or</h2>
      </span>
      {podium.length === 0 ? (
        <p className="m-0 text-[15px] text-t2 [line-height:1.45]">
          Personne n’a encore sué cette semaine. L’or est à prendre.
        </p>
      ) : (
        <ol className="m-0 grid list-none grid-cols-3 items-end gap-2 p-0">
          {podium.map((step, index) => (
            <Step key={step.name} step={step} place={placeOf(index)} />
          ))}
        </ol>
      )}
    </div>
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
