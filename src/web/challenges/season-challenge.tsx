import { useQuery } from '@tanstack/react-query';
import { Link, useSearch } from '@tanstack/react-router';
import { cn } from 'cn';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { CSSProperties } from 'react';
import { formatNumber, formatSigned } from '../../lib/format';
import type { Board } from '../board';
import { useClub } from '../club';
import { NowDot, PeriodKicker, PeriodPicker, periodLabelClass } from '../components/period-picker';
import { medals, mineClass, Place } from '../components/ranking-place';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { seasonMmrQuery } from '../queries';
import { tilt, untilt } from '../team/player-card';
import { rankLightRgb, rankRgb } from '../team/stats';
import { type Climber, challengeSeasons, seasonPeaks } from './season-peaks';

/** The podium's steps: the first in the middle and highest, the second on the left, the third on the right. */
const podiumSteps = {
  1: { column: 'col-start-2', pedestal: 'h-14 lg:h-16' },
  2: { column: 'col-start-1', pedestal: 'h-9 lg:h-10' },
  3: { column: 'col-start-3', pedestal: 'h-5 lg:h-6' },
} as const;

/**
 * The season's challenge, the club's most important: « Au plus près de son peak all time », the podium of the solo
 * accounts, each player's own level, whose peak of the season came closest to their peak all time before it, or beat
 * it by the most. The season under way, or a past one from its address. Each step is a player card: the gap reads
 * first, then the player under their rank, then the season's peak over the peak all time it is measured against.
 */
export function SeasonChallenge({ board, current }: { board: Board; current: number }) {
  const club = useClub();
  const { saison } = useSearch({ strict: false });
  // The ratings come apart from the board, which cannot afford the whole history on every change.
  const ratings = useQuery(seasonMmrQuery);
  const seasonMmr = ratings.data?.seasons ?? [];
  const seasons = challengeSeasons(seasonMmr, club.roster, current);
  // The Stats page writes its seasons as text: only a number here is a season of Défis.
  const season = typeof saison === 'number' && seasons.includes(saison) ? saison : current;
  const { climbers, unknown } = seasonPeaks(board, seasonMmr, club.roster, club.me.duoPseudo, season);
  return (
    <div className="flex flex-col gap-4">
      <span className="flex flex-col gap-1.5">
        <PeriodKicker
          kicker="Défi de la saison · solo"
          picker={<SeasonPicker season={season} seasons={seasons} current={current} />}
        />
        <h2 className="title-display text-[24px] [line-height:normal]">Au plus près de son peak all time</h2>
      </span>
      {ratings.isPending && <Skeleton className="h-[300px] rounded-[22px]" />}
      {ratings.isError && (
        <p className="m-0 text-[15px] text-t2">Les peaks n’ont pas répondu. Réessaie dans un instant.</p>
      )}
      {ratings.isSuccess && (
        <>
          <ol className="m-0 grid list-none grid-cols-3 items-end gap-2 p-0 lg:mx-auto lg:w-full lg:max-w-[760px] lg:gap-5">
            {climbers.slice(0, 3).map((climber, index) => (
              <PodiumCard key={climber.name} climber={climber} step={(index + 1) as 1 | 2 | 3} />
            ))}
          </ol>
          {climbers.length > 3 && (
            <ol className="m-0 flex list-none flex-col gap-1 p-0">
              {climbers.slice(3).map((climber) => (
                <li
                  key={climber.name}
                  className={cn('flex items-center gap-3 py-1.5 text-[14px] text-t2', climber.me && mineClass)}
                >
                  <Place place={climber.place} mine={climber.me} />
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="truncate">{climber.shown}</span>
                    {climber.me && <Badge variant="me">TOI</Badge>}
                  </span>
                  <b className="num text-[17px] text-t1">{formatSigned(climber.gap.gap)}</b>
                </li>
              ))}
            </ol>
          )}
          {unknown.length > 0 && (
            <p className="m-0 text-[12px] text-t3 [line-height:1.45]">
              Pas de peak solo relevé {season === current ? 'cette saison' : `en saison ${season}`}, ou pas de peak all
              time d’avant connu : {new Intl.ListFormat('fr').format(unknown)}.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** The arrows between the seasons the challenge can show; the one under way carries the blue dot. */
function SeasonPicker({ season, seasons, current }: { season: number; seasons: number[]; current: number }) {
  const index = seasons.indexOf(season);
  const older = seasons[index + 1];
  const newer = seasons[index - 1];
  const at = (number: number) => (number === current ? undefined : number);
  return (
    <PeriodPicker
      label="Saison affichée"
      previous={older === undefined ? null : { search: { saison: at(older) }, label: 'Saison précédente' }}
      next={newer === undefined ? null : { search: { saison: at(newer) }, label: 'Saison suivante' }}
    >
      {season === current ? (
        <span className={periodLabelClass}>
          <NowDot />
          Saison {season}
        </span>
      ) : (
        <Link
          to="."
          search={(search: Record<string, unknown>) => ({ ...search, saison: undefined })}
          resetScroll={false}
          aria-label={`Saison ${season}, revenir à la saison en cours`}
          className={periodLabelClass}
        >
          Saison {season}
        </Link>
      )}
    </PeriodPicker>
  );
}

/**
 * A peak in small: its capitals, then the figure in the colour of its rank. The season's peak carries an arrow, up
 * when it went past the peak all time, down when it stayed under: the gap above says by how much.
 */
function PeakFigure({
  label,
  value,
  tier,
  rise,
}: {
  label: string;
  value: number;
  tier: number | null;
  rise?: number | null;
}) {
  const Arrow = rise ? (rise > 0 ? ArrowUp : ArrowDown) : null;
  return (
    <span className="flex items-baseline justify-between gap-2">
      <span className="text-t3">{label}</span>
      <span className="flex items-center gap-0.5">
        {Arrow && (
          <Arrow
            aria-hidden="true"
            strokeWidth={3}
            className={cn('size-3', rise && rise > 0 ? 'text-win' : 'text-t3')}
          />
        )}
        <span className="num text-[14px] lg:text-[15px]" style={{ color: `rgb(${rankLightRgb(tier)})` }}>
          {formatNumber(value)}
        </span>
      </span>
    </span>
  );
}

/** One step of the podium: a player card in their rank's colour, standing on its pedestal. */
function PodiumCard({ climber, step }: { climber: Climber; step: 1 | 2 | 3 }) {
  const { gap, place, me, shown } = climber;
  const rgb = rankRgb(gap.tier);
  const first = step === 1;
  return (
    <li className={cn('row-start-1 flex min-w-0 animate-rise flex-col gap-2', podiumSteps[step].column)}>
      <div
        onPointerMove={tilt}
        onPointerLeave={untilt}
        style={{ '--rank': rgb, '--rank-light': rankLightRgb(gap.tier) } as CSSProperties}
        className={cn(
          'player-card flex flex-col items-center gap-3 px-2.5 pt-4 pb-3.5 text-center lg:gap-4 lg:px-4 lg:pt-6 lg:pb-5',
          me && 'shadow-[inset_0_0_0_1px_rgba(255,255,255,.32)]',
        )}
      >
        <i
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-1"
          style={{ background: `radial-gradient(130% 70% at 50% -10%, rgba(${rgb},.32), rgba(${rgb},0) 65%)` }}
        />
        <i aria-hidden="true" className="player-card-holo pointer-events-none absolute inset-0 z-2" />
        <i aria-hidden="true" className="player-card-glint pointer-events-none absolute inset-0 z-3" />
        <span className="relative z-4 flex flex-col items-center gap-1.5">
          <b
            className={cn(
              'num [line-height:.85]',
              first ? 'text-[38px] lg:text-[52px]' : 'text-[30px] lg:text-[42px]',
              gap.gap >= 0 ? 'text-win' : 'text-t1',
            )}
          >
            {formatSigned(gap.gap)}
          </b>
          <span className="label-caps text-[10px]">écart</span>
        </span>
        <img
          src={`/rocket-league/ranks/${gap.tier ?? 0}.png`}
          alt=""
          className={cn(
            'relative z-4 object-contain [filter:drop-shadow(0_6px_16px_rgba(var(--rank),.55))]',
            first ? 'size-14 lg:size-20' : 'size-11 lg:size-16',
          )}
        />
        <span className="relative z-4 flex w-full min-w-0 flex-col items-center gap-2">
          <span className="flex min-w-0 max-w-full flex-col items-center gap-1 lg:flex-row">
            <b className="line-clamp-2 break-all font-semibold text-[13px] [line-height:1.2] lg:text-[15px]">{shown}</b>
            {me && <Badge variant="tag">TOI</Badge>}
          </span>
          {/* The season's peak over the peak all time before it: the gap reads from one to the other. */}
          <span className="flex w-full max-w-[150px] flex-col gap-1 text-[11px] lg:text-[12px]">
            <PeakFigure label="Saison" value={gap.peak} tier={gap.tier} rise={gap.gap} />
            {gap.allTime !== null && <PeakFigure label="All time" value={gap.allTime} tier={gap.allTimeTier} />}
          </span>
        </span>
      </div>
      <div
        aria-hidden="true"
        className={cn(
          'flex origin-bottom animate-pedestal items-start justify-center rounded-[12px_12px_4px_4px] pt-1.5',
          podiumSteps[step].pedestal,
          first
            ? 'bg-linear-to-b from-white/18 to-white/4 shadow-[inset_0_1px_0_rgba(255,255,255,.35)]'
            : 'bg-linear-to-b from-white/8 to-white/2 shadow-[inset_0_1px_0_rgba(255,255,255,.14)]',
        )}
      >
        <span className={cn('num text-[15px] lg:text-[17px]', me ? medals[place] : 'text-t3')}>{place}</span>
      </div>
      <span className="sr-only">Place {place}</span>
    </li>
  );
}
