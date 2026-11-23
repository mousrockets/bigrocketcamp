import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { cn } from 'cn';
import { Gamepad2, type LucideIcon, TrendingUp, Trophy, UserRound, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { parisDay, shiftDay } from '../../lib/days';
import { highScorePoints } from '../../lib/domain';
import { formatDay, formatDayDate, formatLongDay, formatNumber } from '../../lib/format';
import type { MatchMode } from '../../lib/live-stats';
import { useBoardState } from '../board';
import { useClub } from '../club';
import { BoardPending, TitleSkeleton } from '../components/board-pending';
import { LiveStatus } from '../components/live-status';
import { PeriodKicker } from '../components/period-picker';
import { SegmentedControl } from '../components/segmented-control';
import { TabPage } from '../components/tab-page';
import { Badge } from '../components/ui/badge';
import { buttonVariants } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { useNow } from '../hooks/use-now';
import { DayPicker } from './day-picker';
import {
  type AccountChoice,
  type Accounts,
  hasSoloAccounts,
  lastDays,
  lastSession,
  onAccounts,
  periodSummary,
  playedDays,
  type ReplayMatch,
  recentDays,
  replay,
  type Session,
  type SummaryPlayer,
} from './timeline';
import { TournamentSheet } from './tournament-sheet';

export function MatchesPage() {
  const club = useClub();
  const { board, error } = useBoardState();
  const { jour, tournoi } = useSearch({ strict: false });
  const navigate = useNavigate();
  const now = useNow(30_000);
  const today = parisDay(now);
  // No day chosen: the last seven days. A day after today cannot be read and leads back to them.
  const day = jour && jour <= today ? jour : null;
  const days = day ? [day] : lastDays(today);
  const [account, setAccount] = useState<AccountChoice>('all');
  const summary = board
    ? periodSummary(onAccounts(board, club.roster, account), club.roster, club.me.duoPseudo, days)
    : [];
  const groups = board ? replay(board, club.roster, days, today) : [];
  const session = board ? lastSession(board, club.roster, club.me.duoPseudo) : null;
  const tournament = groups.flatMap((group) => group.matches).find((match) => match.guid === tournoi) ?? null;

  return (
    <TabPage
      kicker={formatLongDay(now)}
      title="Matchs"
      aside={<LiveStatus lastReceived={board?.collectors[0]?.last_seen ?? null} reception={false} />}
    >
      {!board && (
        <BoardPending error={error} className="flex flex-col lg:flex-row lg:flex-wrap lg:items-start lg:gap-10">
          <div className="flex flex-col gap-[18px] px-5 pt-8 lg:max-w-[420px] lg:flex-[1_1_340px] lg:p-0">
            <TitleSkeleton />
            <Skeleton className="h-[150px] rounded-[22px]" />
            <Skeleton className="h-[150px] rounded-[22px]" />
          </div>
          <div className="flex flex-col gap-[18px] px-5 pt-12 lg:flex-[999_1_420px] lg:p-0">
            <TitleSkeleton />
            <Skeleton className="h-[300px] rounded-[22px]" />
          </div>
        </BoardPending>
      )}
      {board && (
        <div className="flex flex-col animate-rise [animation-delay:.06s] lg:flex-row lg:flex-wrap lg:items-start lg:gap-10">
          <div className="flex flex-col lg:sticky lg:top-6 lg:max-w-[420px] lg:flex-[1_1_340px] lg:gap-10">
            {day === null && session && <SessionRecap session={session} today={today} />}
            <section aria-label="Bilan du jour" className="flex flex-col gap-[18px] px-5 pt-8 lg:p-0">
              <span className="flex flex-col gap-1.5">
                <PeriodKicker
                  kicker={day ? 'Bilan du jour' : `Bilan · ${recentDays} jours`}
                  picker={<DayPicker day={day} today={today} played={playedDays(board, club.roster)} />}
                />
                <h2 className="title-display text-[24px] [line-height:normal]">
                  {summary.some((player) => player.owed > 0) ? 'Les bras vont chauffer' : 'Pas encore de casse'}
                </h2>
              </span>
              {hasSoloAccounts(board) && (
                <SegmentedControl
                  label="Comptes du bilan"
                  options={accountChoices}
                  value={account}
                  onChange={setAccount}
                />
              )}
              {summary.length > 0 ? (
                <div className="flex flex-col gap-2.5">
                  {summary.map((player) => (
                    <PlayerSummary key={player.name} player={player} compact={day === null} />
                  ))}
                </div>
              ) : (
                <p className="m-0 text-[15px] text-t2">
                  {account !== 'all'
                    ? `Aucun match en ${accountLabels[account].toLowerCase()} sur cette période.`
                    : day === null
                      ? `Aucun match en ${recentDays} jours. Le terrain attend son kickoff.`
                      : day === today
                        ? 'Aucun match aujourd’hui. Le terrain attend son kickoff.'
                        : 'Aucun match ce jour-là.'}
                </p>
              )}
            </section>
          </div>
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
          <TournamentSheet
            match={tournament}
            onClose={() =>
              void navigate({
                to: '.',
                search: (previous) => ({ ...previous, tournoi: undefined }),
                resetScroll: false,
              })
            }
          />
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

/** « Aujourd’hui · samedi 21 novembre », « Hier · vendredi 20 novembre », then the day in full. */
function sessionDate(day: string, today: string): string {
  const relative = day === today ? 'Aujourd’hui · ' : day === shiftDay(today, -1) ? 'Hier · ' : '';
  return relative + formatDay(day);
}

/** The last day played, in a line per account: wins, defeats and the MMR it moved. */
function SessionRecap({ session, today }: { session: Session; today: string }) {
  return (
    <section aria-label="Dernière session" className="flex flex-col gap-[18px] px-5 pt-8 lg:p-0">
      <SectionTitle kicker={sessionDate(session.day, today)} title="Dernière session" />
      <Card variant="glass" className="gap-0 py-0">
        <ul className="m-0 list-none p-0">
          {session.accounts.map((player) => (
            <li
              key={player.pseudo}
              className="flex items-center gap-3 px-4 py-3 [&+&]:border-line [&+&]:border-t-[.5px]"
            >
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <b className="truncate font-semibold text-[15px]">{player.pseudo}</b>
                {player.me && <Badge variant="me">TOI</Badge>}
              </span>
              <span className="shrink-0 text-[13px] text-t2">
                <span className="text-win">{player.wins} W</span> ·{' '}
                <span className="text-cost-strong">{player.losses} L</span>
              </span>
              <b
                className={cn(
                  'num w-[76px] shrink-0 text-right text-[16px]',
                  player.mmr === null || player.mmr === 0 ? 'text-t3' : player.mmr > 0 ? 'text-win' : 'text-cost',
                )}
              >
                {player.mmr === null ? '–' : `${signed(player.mmr)} MMR`}
              </b>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

/** A player's summary; over several days, the squares of their matches shrink to fit. */
function PlayerSummary({ player, compact }: { player: SummaryPlayer; compact: boolean }) {
  const defeats = player.losses * 5;
  return (
    <Card variant="glass" className="gap-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 flex-1 flex-col gap-2.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <b className="truncate font-semibold text-[17px]">{player.pseudo}</b>
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

const accountChoices = [
  { value: 'all', label: 'Tous' },
  { value: 'duo', label: 'Duo' },
  { value: 'solo', label: 'Solo' },
] as const satisfies readonly { value: AccountChoice; label: string }[];

const outcomes = {
  victory: { label: 'GG', className: 'bg-[rgba(76,211,138,.14)] text-win' },
  defeat: { label: 'AÏE', className: 'bg-[rgba(255,159,69,.14)] text-cost' },
  'between-members': { label: 'DUEL', className: 'bg-white/8 text-t2' },
  review: { label: 'À VOIR', className: 'bg-white/8 text-t2' },
};

const modes = {
  casual: { label: 'Occasionnel', Icon: Gamepad2 },
  // Ranked moves the MMR.
  ranked: { label: 'Compétitif', Icon: TrendingUp },
  tournament: { label: 'Tournoi', Icon: Trophy },
  private: { label: 'Match privé', Icon: null },
} satisfies Record<MatchMode, { label: string; Icon: LucideIcon | null }>;

function ModeBadge({ mode }: { mode: MatchMode }) {
  const { label, Icon } = modes[mode];
  return (
    <Badge variant="mode" role="img" aria-label={label} title={label} className={cn(!Icon && 'w-auto gap-0.5 px-1.5')}>
      {Icon ? (
        <Icon aria-hidden="true" />
      ) : (
        <>
          <UserRound aria-hidden="true" />
          <span aria-hidden="true" className="font-semibold text-[9px] [line-height:1]">
            vs
          </span>
          <UserRound aria-hidden="true" />
        </>
      )}
    </Badge>
  );
}

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
        {match.mode && <ModeBadge mode={match.mode} />}
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
              {player.party && (
                <Badge variant="party" role="img" aria-label="En groupe" className="align-[-3px]">
                  <UsersRound aria-hidden="true" />
                </Badge>
              )}{' '}
              <span className="text-t3">
                · {formatNumber(player.points)} pts
                {player.mvp && (
                  <>
                    {' · '}
                    <b className="font-semibold text-t1">MVP</b>
                  </>
                )}
                {player.lastPlace ? ' · moins de pts' : ''}
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
      {match.tournament && (
        <Link
          to="/matchs"
          search={(previous) => ({ ...previous, tournoi: match.guid })}
          resetScroll={false}
          className={cn(
            buttonVariants({ variant: 'soft', size: 'sm' }),
            'self-start',
            match.tournament === 'won' && 'text-win hover:text-win',
          )}
        >
          <Trophy aria-hidden="true" />
          {match.tournament === 'won' ? 'Tournoi gagné' : 'Tournoi gagné ?'}
        </Link>
      )}
    </div>
  );
}
