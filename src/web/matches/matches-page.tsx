import { useSearch } from '@tanstack/react-router';
import { cn } from 'cn';
import { parisDay } from '../../lib/days';
import { highScorePoints } from '../../lib/domain';
import { formatDayDate, formatLongDay, formatNumber } from '../../lib/format';
import { useBoardState } from '../board';
import { useClub } from '../club';
import { LiveStatus } from '../components/live-status';
import { PeriodKicker } from '../components/period-picker';
import { TabPage } from '../components/tab-page';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import { useNow } from '../hooks/use-now';
import { DayPicker } from './day-picker';
import {
  type Accounts,
  lastDays,
  periodSummary,
  playedDays,
  type ReplayMatch,
  recentDays,
  replay,
  type SummaryPlayer,
} from './timeline';

export function MatchesPage() {
  const club = useClub();
  const { board, error } = useBoardState();
  const { jour } = useSearch({ strict: false });
  const now = useNow(30_000);
  const today = parisDay(now);
  // No day chosen: the last seven days. A day after today cannot be read and leads back to them.
  const day = jour && jour <= today ? jour : null;
  const days = day ? [day] : lastDays(today);
  const summary = board ? periodSummary(board, club.roster, club.me.duoPseudo, days) : [];
  const groups = board ? replay(board, club.roster, days, today) : [];

  return (
    <TabPage
      kicker={formatLongDay(now)}
      title="Matchs"
      aside={<LiveStatus lastReceived={board?.collectors[0]?.last_seen ?? null} reception={false} />}
    >
      {error && !board && <p className="m-0 px-5 pt-10 text-[15px] text-t2 lg:px-0 lg:pt-0">{error}</p>}
      {board && (
        <div className="flex flex-col animate-rise [animation-delay:.06s] lg:flex-row lg:flex-wrap lg:items-start lg:gap-10">
          <section
            aria-label="Bilan du jour"
            className="flex flex-col gap-[18px] px-5 pt-8 lg:sticky lg:top-6 lg:max-w-[420px] lg:flex-[1_1_340px] lg:p-0"
          >
            <span className="flex flex-col gap-1.5">
              <PeriodKicker
                kicker={day ? 'Bilan du jour' : `Bilan · ${recentDays} jours`}
                picker={<DayPicker day={day} today={today} played={playedDays(board, club.roster)} />}
              />
              <h2 className="title-display text-[24px] [line-height:normal]">
                {summary.some((player) => player.owed > 0) ? 'Les bras vont chauffer' : 'Pas encore de casse'}
              </h2>
            </span>
            {summary.length > 0 ? (
              <div className="flex flex-col gap-2.5">
                {summary.map((player) => (
                  <PlayerSummary key={player.name} player={player} compact={day === null} />
                ))}
              </div>
            ) : (
              <p className="m-0 text-[15px] text-t2">
                {day === null
                  ? `Aucun match en ${recentDays} jours. Le terrain attend son kickoff.`
                  : day === today
                    ? 'Aucun match aujourd’hui. Le terrain attend son kickoff.'
                    : 'Aucun match ce jour-là.'}
              </p>
            )}
          </section>
          <section
            aria-label="Derniers matchs"
            className="flex flex-col gap-[18px] px-5 pt-12 lg:flex-[999_1_420px] lg:p-0"
          >
            <SectionTitle
              kicker={
                day === null
                  ? `Les ${recentDays} derniers jours`
                  : day === today
                    ? 'Les matchs du jour'
                    : `Les matchs du ${formatDayDate(day)}`
              }
              title="Le replay"
            />
            {groups.map((group) => (
              <div key={group.label} className="flex flex-col gap-2.5">
                <span className="font-semibold text-[13px] text-t2">{group.label}</span>
                <Card variant="glass" className="gap-0 py-0">
                  {group.matches.map((match) => (
                    <MatchRow key={match.guid} match={match} />
                  ))}
                </Card>
              </div>
            ))}
            {groups.length === 0 && (
              <p className="m-0 text-[15px] text-t2">
                {day === null
                  ? `Pas un match en ${recentDays} jours. Suspect.`
                  : day === today
                    ? 'Pas un match aujourd’hui. Suspect.'
                    : 'Pas un match ce jour-là. Suspect.'}
              </p>
            )}
          </section>
        </div>
      )}
    </TabPage>
  );
}

function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <span className="flex flex-col gap-1.5">
      <span className="label-caps">{kicker}</span>
      <h2 className="title-display text-[24px] [line-height:normal]">{title}</h2>
    </span>
  );
}

const signed = (value: number) =>
  value > 0 ? `+${formatNumber(value)}` : value < 0 ? `−${formatNumber(-value)}` : '0';

/** A player's summary; over several days, the squares of their matches shrink to fit. */
function PlayerSummary({ player, compact }: { player: SummaryPlayer; compact: boolean }) {
  const defeats = player.losses * 5;
  return (
    <Card variant="glass" className="gap-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 flex-1 flex-col gap-2.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <b className="truncate font-semibold text-[17px]">{player.name}</b>
            {player.me && <Badge variant="me">TOI</Badge>}
          </span>
          <span className="flex flex-col gap-[7px]">
            <span aria-hidden="true" className="flex flex-wrap gap-1">
              {player.outcomes.map((outcome, index) => (
                <i
                  // biome-ignore lint/suspicious/noArrayIndexKey: a day's matches keep their order.
                  key={index}
                  className={cn(
                    compact ? 'size-2 rounded-[2px]' : 'size-2.5 rounded-[3px]',
                    outcome === 'win' ? 'bg-win' : 'bg-cost-strong opacity-90',
                  )}
                />
              ))}
            </span>
            {/* A narrow card breaks the line between its parts, never inside one. */}
            <span className="text-[13px] text-t2 [&>span]:whitespace-nowrap">
              <span>{accountLabels[player.accounts]} ·</span>{' '}
              <span>
                {player.wins + player.losses} {player.wins + player.losses > 1 ? 'parties' : 'partie'} ·
              </span>{' '}
              <span>
                <span className="text-win">{player.wins} W</span> ·{' '}
                <span className="text-cost-strong">{player.losses} L</span>
              </span>
            </span>
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1.5">
          <b className={cn('num text-[44px] [line-height:.8]', player.owed > 0 ? 'text-cost' : 'text-win')}>
            {formatNumber(Math.max(0, player.owed))}
          </b>
          <span className="text-[12px] text-t3">{player.owed > 0 ? 'pompes à faire' : 'mains propres'}</span>
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 border-line border-t-[.5px] pt-3.5">
        <Figure label="Défaites × 5" value={defeats} />
        <Figure label="Bonus" value={player.bonus} />
        <Figure label="Esquivées" value={-player.dodged} credit />
      </div>
    </Card>
  );
}

function Figure({ label, value, credit = false }: { label: string; value: number; credit?: boolean }) {
  return (
    <span className="flex flex-col gap-[5px]">
      <span className="text-[11px] text-t3">{label}</span>
      <b className={cn('num text-[20px] [line-height:1]', value === 0 ? 'text-t3' : credit ? 'text-win' : 'text-t1')}>
        {signed(value)}
      </b>
    </span>
  );
}

const accountLabels = { duo: 'Duo', solo: 'Solo', both: 'Solo et Duo' } satisfies Record<Accounts, string>;

const outcomes = {
  victory: { label: 'GG', className: 'bg-[rgba(76,211,138,.14)] text-win' },
  defeat: { label: 'AÏE', className: 'bg-[rgba(255,159,69,.14)] text-cost' },
  'between-members': { label: 'DUEL', className: 'bg-white/8 text-t2' },
  review: { label: 'À VOIR', className: 'bg-white/8 text-t2' },
};

function MatchRow({ match }: { match: ReplayMatch }) {
  const outcome = outcomes[match.outcome];
  return (
    <div className="flex flex-col gap-2.5 px-4 py-3.5 [&+&]:border-line [&+&]:border-t-[.5px]">
      <div className="flex items-center gap-2.5">
        <Badge
          className={cn(
            'h-5 rounded-[10px] border-0 px-2 font-display font-extrabold text-[12px] italic tracking-[.02em] [font-stretch:72%]',
            outcome.className,
          )}
        >
          {outcome.label}
        </Badge>
        <span className="min-w-0 flex-1 truncate text-[12px] text-t3">
          {[match.clock, ...match.tags].filter(Boolean).join(' · ')}
        </span>
        <b className="num shrink-0 text-[24px] [line-height:1]">
          {match.score ? `${match.score[0]} – ${match.score[1]}` : '–'}
        </b>
      </div>
      <div className="flex flex-col gap-1.5">
        {match.players.map((player) => (
          <span key={player.name} className="flex items-baseline justify-between gap-2.5 text-[13px]">
            <span className="min-w-0 truncate text-t2">
              {player.account}{' '}
              <span className="text-t3">
                · {formatNumber(player.points)} pts{player.lastPlace ? ' · moins de pts' : ''}
                {player.left ? ' · a quitté' : ''}
                {player.highScore ? ` · ${formatNumber(highScorePoints)}+ pts` : ''}
              </span>
            </span>
            <b
              className={cn(
                'num shrink-0 text-[16px]',
                player.cost > 0 ? 'text-cost' : player.cost < 0 ? 'text-win' : 'text-t3',
              )}
            >
              {signed(player.cost)}
            </b>
          </span>
        ))}
      </div>
    </div>
  );
}
