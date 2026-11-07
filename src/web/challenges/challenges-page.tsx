import { cn } from 'cn';
import { parisDay } from '../../lib/days';
import { formatLongDay } from '../../lib/format';
import { useBoardState } from '../board';
import { useClub } from '../club';
import { epicNotice } from '../components/epic-notice';
import { cardVariants } from '../components/ui/card';
import { useNow } from '../hooks/use-now';
import { MonthlyChallenge } from './monthly-challenge';
import { WeeklyPodium } from './podium';
import { weeklyPodium } from './standings';

// On a phone, the two challenges follow each other on the page; on a computer, each sits in its card, side by side.
const challenge = cn(
  cardVariants({ variant: 'glass' }),
  'max-lg:animate-rise max-lg:rounded-none max-lg:bg-none max-lg:px-5 max-lg:shadow-none lg:flex-[1_1_420px] lg:p-7',
);

export function ChallengesPage() {
  const club = useClub();
  const { board, error } = useBoardState();
  const now = useNow(30_000);
  const me = club.me.duoPseudo;
  const podium = board ? weeklyPodium(board.exercises, club.roster, me, parisDay(now)) : [];

  return (
    <main className="relative flex min-h-dvh flex-col pt-[max(60px,calc(env(safe-area-inset-top)+12px))] pb-[120px] lg:px-[clamp(20px,5vw,72px)] lg:pt-11 lg:pb-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[360px] bg-[radial-gradient(90%_60%_at_50%_-12%,rgba(70,120,220,.16),rgba(0,0,0,0)_70%)] lg:h-[440px] lg:bg-[radial-gradient(60%_70%_at_30%_-15%,rgba(70,120,220,.13),rgba(0,0,0,0)_70%)]"
      />
      <div className="relative flex w-full flex-col lg:mx-auto lg:max-w-[1060px] lg:gap-14">
        <header className="flex animate-rise items-end justify-between gap-4 px-5 pt-2 lg:p-0">
          <span className="flex flex-col gap-1.5">
            <span className="label-caps">{formatLongDay(now)}</span>
            <h1 className="title-display text-[36px] [line-height:1] lg:text-[40px]">Défis</h1>
          </span>
        </header>

        {error && !board && <p className="m-0 px-5 pt-10 text-[15px] text-t2 lg:px-0 lg:pt-0">{error}</p>}
        {board && (
          <div className="flex flex-col lg:animate-rise lg:flex-row lg:flex-wrap lg:items-start lg:gap-6 lg:[animation-delay:.06s]">
            <section
              aria-label="Podium de la semaine"
              className={cn(challenge, 'max-lg:pt-8 max-lg:[animation-delay:.06s]')}
            >
              <WeeklyPodium podium={podium} />
            </section>
            {board.monthly && (
              <section
                aria-label="Défi du mois"
                className={cn(challenge, 'max-lg:pt-12 max-lg:[animation-delay:.12s]')}
              >
                <MonthlyChallenge monthly={board.monthly} doublesRanks={board.doublesRanks} me={me} now={now} />
              </section>
            )}
          </div>
        )}

        <p className="mx-6 mt-10 mb-0 text-center text-[11px] text-t3 [line-height:1.5] lg:m-0 lg:text-left lg:[line-height:normal]">
          {epicNotice}
        </p>
      </div>
    </main>
  );
}
