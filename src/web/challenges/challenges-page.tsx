import { Link, useSearch } from '@tanstack/react-router';
import { cn } from 'cn';
import { parisDay, shiftDay, weekStart } from '../../lib/days';
import { formatLongDay, formatWeek } from '../../lib/format';
import { useBoardState } from '../board';
import { useClub } from '../club';
import { NowDot, PeriodPicker, periodLabelClass } from '../components/period-picker';
import { TabPage } from '../components/tab-page';
import { cardVariants } from '../components/ui/card';
import { useNow } from '../hooks/use-now';
import { MonthlyChallenge } from './monthly-challenge';
import { WeeklyPodium } from './podium';
import { firstWeek, weeklyPodium } from './standings';

// On a phone, the two challenges follow each other on the page; on a computer, each sits in its card, side by side.
const challenge = cn(
  cardVariants({ variant: 'glass' }),
  'max-lg:animate-rise max-lg:rounded-none max-lg:bg-none max-lg:px-5 max-lg:shadow-none lg:flex-[1_1_420px] lg:p-7',
);

export function ChallengesPage() {
  const club = useClub();
  const { board, error } = useBoardState();
  const { semaine, mois } = useSearch({ strict: false });
  const now = useNow(30_000);
  const me = club.me.duoPseudo;
  const thisWeek = weekStart(parisDay(now));
  const week = semaine && semaine < thisWeek ? weekStart(semaine) : thisWeek;
  const podium = board ? weeklyPodium(board.exercises, club.roster, me, week) : [];

  return (
    <TabPage kicker={formatLongDay(now)} title="Défis">
      {error && !board && <p className="m-0 px-5 pt-10 text-[15px] text-t2 lg:px-0 lg:pt-0">{error}</p>}
      {board && (
        <div className="flex flex-col lg:animate-rise lg:flex-row lg:flex-wrap lg:items-start lg:gap-6 lg:[animation-delay:.06s]">
          <section
            aria-label="Podium de la semaine"
            className={cn(challenge, 'max-lg:pt-8 max-lg:[animation-delay:.06s]')}
          >
            <WeeklyPodium
              podium={podium}
              current={week === thisWeek}
              picker={<WeekPicker week={week} thisWeek={thisWeek} first={firstWeek(board.exercises) ?? thisWeek} />}
            />
          </section>
          {board.monthly && (
            <section aria-label="Défi du mois" className={cn(challenge, 'max-lg:pt-12 max-lg:[animation-delay:.12s]')}>
              <MonthlyChallenge
                monthly={board.monthly}
                doublesRanks={board.doublesRanks}
                me={me}
                now={now}
                month={mois}
              />
            </section>
          )}
        </div>
      )}
    </TabPage>
  );
}

/** « Cette semaine », or the days of an earlier one, back to the week of the first exercise. */
function WeekPicker({ week, thisWeek, first }: { week: string; thisWeek: string; first: string }) {
  const after = shiftDay(week, 7);
  return (
    <PeriodPicker
      label="Semaine affichée"
      previous={week > first ? { search: { semaine: shiftDay(week, -7) }, label: 'Semaine précédente' } : null}
      next={
        week < thisWeek
          ? { search: { semaine: after === thisWeek ? undefined : after }, label: 'Semaine suivante' }
          : null
      }
    >
      {week === thisWeek ? (
        <span className={periodLabelClass}>
          <NowDot />
          Cette semaine
        </span>
      ) : (
        <Link
          to="."
          search={(search: Record<string, unknown>) => ({ ...search, semaine: undefined })}
          resetScroll={false}
          aria-label={`${formatWeek(week)}, revenir à cette semaine`}
          className={periodLabelClass}
        >
          {formatWeek(week)}
        </Link>
      )}
    </PeriodPicker>
  );
}
