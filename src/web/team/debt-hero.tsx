import { Link } from '@tanstack/react-router';
import { cn } from 'cn';
import { Button } from '../components/ui/button';
import { Flame, PlayIcon } from '../shell/icons';
import { type Debt, figure, litSegments, plural } from './stats';

const segments = 24;

/** The member's own debt, big: what is left, a segmented gauge of what was paid, and the button to pay more. */
export function DebtHero({ debt, streak }: { debt: Debt; streak: number }) {
  const lit = litSegments(debt.percent, segments);
  const settled = debt.left === 0;
  return (
    <section
      aria-label="Ta dette"
      className="flex animate-rise flex-col gap-4 px-5 py-10 [animation-delay:.06s] lg:flex-row lg:flex-wrap lg:items-end lg:justify-between lg:gap-x-14 lg:gap-y-8 lg:p-0"
    >
      <div className="flex flex-col gap-4 lg:max-w-[600px] lg:flex-[1_1_440px]">
        <div className="flex items-center justify-between">
          <span className="label-caps">Tes défis</span>
          <StreakCount streak={streak} />
        </div>
        <div className="flex items-end gap-3 lg:gap-3.5">
          <b className="num text-[104px] tracking-[-.035em] [line-height:.78] lg:text-[128px]">{figure(debt.left)}</b>
          <span className="pb-1 font-medium text-[17px] text-t2 lg:pb-1.5 lg:text-[19px]">
            {plural(debt.left, 'pompe')}
          </span>
        </div>
        <div aria-hidden="true" className="flex items-end gap-[3px]">
          {Array.from({ length: segments }, (_, index) => (
            <i
              // biome-ignore lint/suspicious/noArrayIndexKey: the segments are fixed, the index is their identity.
              key={index}
              className={cn(
                'h-2 flex-1 origin-bottom animate-segment rounded-[2px]',
                index >= lit ? 'bg-white/8' : settled ? 'bg-win' : 'bg-t1',
                index === lit - 1 && !settled && 'shadow-[0_0_10px_rgba(255,255,255,.55)]',
              )}
              style={{ animationDelay: `${0.2 + index * 0.025}s` }}
            />
          ))}
        </div>
        <div className="flex items-baseline justify-between text-[12px] text-t3 tabular-nums">
          <span>
            {figure(debt.paid)} / {figure(debt.owed)}
          </span>
          <b className="num text-[15px] text-t1">{debt.percent} %</b>
        </div>
      </div>
      <div className="mt-1 flex flex-col gap-6 lg:mt-0 lg:flex-[0_1_300px] lg:gap-3.5">
        <p className="m-0 text-[15px] text-t2 [line-height:1.45] lg:[line-height:1.5]">
          {settled ? 'Ardoise propre. Le free play t’attend.' : 'Même le ballon a mal aux bras pour toi.'}
        </p>
        <Button variant="cta" size="cta" nativeButton={false} render={<Link to="/declarer" />}>
          <PlayIcon />
          Lancer une série
        </Button>
      </div>
    </section>
  );
}

/** Days in a row with an exercise, with a flame that dims once the streak is broken. */
export function StreakCount({ streak, large = false }: { streak: number; large?: boolean }) {
  return (
    <span
      title={`${streak} ${plural(streak, 'jour')} de streak`}
      className={cn('flex items-center gap-[5px] font-semibold text-[13px]', streak > 0 ? 'text-cost' : 'text-t3')}
    >
      <Flame width={large ? 12 : 11} height={large ? 15 : 14} dim={streak === 0} />
      {large ? streak : `${streak} ${plural(streak, 'jour')}`}
    </span>
  );
}
