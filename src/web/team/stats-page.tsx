import { useNavigate, useSearch } from '@tanstack/react-router';
import { cn } from 'cn';
import { useState } from 'react';
import { formatNumber } from '../../lib/format';
import { seasonAt } from '../../lib/season';
import { useBoardState } from '../board';
import { useClub } from '../club';
import { BackLink } from '../components/back-link';
import { BoardPending } from '../components/board-pending';
import { FilterSelect } from '../components/filter-select';
import { TabPage } from '../components/tab-page';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { type CareerAccount, type CareerScope, soloAccountOf } from './career';
import {
  type ComparedPlayer,
  comparedPlayers,
  type RankedLine,
  ranked,
  type Stat,
  type StatFormat,
  seasonsPlayed,
  statsOf,
  winRate,
} from './comparison';
import { rankLightRgb } from './stats';

type Scope = Exclude<CareerScope, 'ranked'>;

const scopes = [
  { value: 'all', label: 'Tous les modes' },
  { value: 'duel', label: '1v1' },
  { value: 'doubles', label: '2v2' },
  { value: 'standard', label: '3v3' },
  { value: 'tournament', label: 'Tournoi' },
] as const satisfies readonly { value: Scope; label: string }[];

const accounts = [
  { value: 'all', label: 'Tous les comptes' },
  { value: 'solo', label: 'Compte solo' },
  { value: 'duo', label: 'Compte duo' },
] as const satisfies readonly { value: CareerAccount; label: string }[];

/** How the empty page names the matches of each mode. */
const modeWords: Record<Scope, string> = {
  all: 'Pas un match',
  duel: 'Pas un 1v1 ranked',
  doubles: 'Pas un 2v2 ranked',
  standard: 'Pas un 3v3 ranked',
  tournament: 'Pas un match de tournoi',
};

const formatted = (value: number | null, format: StatFormat) => {
  if (value === null) return '–';
  if (format === 'percent') return `${formatNumber(Math.round(value))} %`;
  // Two decimals: averages of a few matches are close, and one decimal would show a tie the bars deny.
  if (format === 'perMatch') return formatNumber(Math.round(value * 100) / 100);
  return formatNumber(value);
};

/**
 * The Stats page, opened from L'équipe: every player side by side over one season, or every match. The share of
 * wins leads; each other stat ranks the players, the leader in big.
 */
export function StatsPage() {
  const club = useClub();
  const { board, error } = useBoardState();
  const { saison } = useSearch({ strict: false });
  const navigate = useNavigate();
  // The club plays 2v2 first: it opens there.
  const [scope, setScope] = useState<Scope>('doubles');
  const [chosenAccount, setAccount] = useState<CareerAccount>('all');
  const current = seasonAt(new Date().toISOString());
  const played = board ? seasonsPlayed(board, club.roster) : [];
  const seasons = [...new Set([...(current === null ? [] : [current]), ...played])].sort((a, b) => b - a);
  const season = saison === 'tout' ? null : (saison ?? current);
  const hasSolo = board ? club.roster.some((name) => soloAccountOf(board, name) !== null) : false;
  const account = hasSolo ? chosenAccount : 'all';
  const players = board ? comparedPlayers(board, club.roster, club.me.duoPseudo, scope, account, season) : [];
  const anyMatch = players.some((player) => player.career.matches > 0);
  const choose = (next: string) =>
    void navigate({
      to: '.',
      search: (previous) => ({ ...previous, saison: next === 'tout' ? 'tout' : Number(next) }),
      resetScroll: false,
    });

  return (
    <TabPage back={<BackLink to="/">L’équipe</BackLink>} kicker="La team en chiffres" title="Stats">
      <div className="flex animate-rise flex-col gap-6 px-5 pt-6 [animation-delay:.06s] lg:gap-8 lg:px-0 lg:pt-0">
        <div className="flex flex-wrap gap-2">
          <FilterSelect
            label="Saison"
            options={[
              ...seasons.map((number) => ({
                value: String(number),
                label: `Saison ${number}${number === current ? ' (en cours)' : ''}`,
              })),
              { value: 'tout', label: 'Toutes les saisons' },
            ]}
            value={season === null ? 'tout' : String(season)}
            onChange={choose}
          />
          <FilterSelect label="Mode" options={scopes} value={scope} onChange={setScope} />
          {hasSolo && <FilterSelect label="Compte" options={accounts} value={account} onChange={setAccount} />}
        </div>
        {!board && (
          <BoardPending error={error} className="flex flex-col gap-3">
            <Skeleton className="h-[200px] rounded-[22px]" />
            <Skeleton className="h-[300px] rounded-[22px]" />
          </BoardPending>
        )}
        {board && !anyMatch && (
          <p className="m-0 text-[15px] text-t2">
            {modeWords[scope]} {season === null ? 'au compteur' : `en saison ${season}`}. Le kickoff attend.
          </p>
        )}
        {board && anyMatch && (
          <>
            <WinRates players={players} />
            <section aria-label="Le détail" className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {statsOf(scope).map((stat) => (
                <StatCard key={stat.label} stat={stat} players={players} />
              ))}
            </section>
          </>
        )}
      </div>
    </TabPage>
  );
}

/** A player's name with their colour, and TOI for the member. */
function PlayerName({ player, className }: { player: ComparedPlayer; className?: string }) {
  return (
    <span className={cn('flex min-w-0 items-center gap-1.5', className)}>
      <i
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full"
        style={{ background: `rgb(${rankLightRgb(player.tier)})` }}
      />
      <span className="truncate">{player.name}</span>
      {player.me && <Badge variant="me">TOI</Badge>}
    </span>
  );
}

/** The share of wins, each player's in big, side by side: the stat that sums up all the others. */
function WinRates({ players }: { players: ComparedPlayer[] }) {
  const { lines, leaders } = ranked(winRate, players);
  return (
    <Card variant="glass" role="region" aria-label={winRate.label} className="gap-5 p-5 lg:p-6">
      <span className="label-caps">{winRate.label}</span>
      {/* On a phone, one line per player, the share at the right; on a computer, the players side by side. */}
      <ol className="m-0 flex list-none flex-col gap-4 p-0 lg:grid lg:grid-cols-[repeat(auto-fit,minmax(160px,1fr))] lg:gap-4">
        {lines.map((line) => (
          <li
            key={line.player.name}
            className="flex min-w-0 items-end justify-between gap-3 lg:flex-col-reverse lg:items-start lg:justify-end lg:gap-2"
          >
            <span className="flex min-w-0 flex-col gap-1 lg:contents">
              <PlayerName player={line.player} className="font-semibold text-[15px] lg:order-3 lg:text-[14px]" />
              <span className="text-[13px] text-t3 lg:order-1">
                {line.player.career.matches === 0 ? (
                  'Pas de match'
                ) : (
                  <>
                    <span className="text-win">{formatNumber(line.player.career.wins)} W</span> ·{' '}
                    <span className="text-cost-strong">{formatNumber(line.player.career.losses)} L</span>
                  </>
                )}
              </span>
            </span>
            <b
              className={cn(
                'num shrink-0 text-[40px] [line-height:.85] lg:order-2 lg:text-[56px]',
                leaders.includes(line) ? 'text-t1' : 'text-t2',
                line.value === null && 'text-t3',
              )}
            >
              {formatted(line.value, winRate.format)}
            </b>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** One stat: the leader's figure in big, then every player's bar against it. */
function StatCard({ stat, players }: { stat: Stat; players: ComparedPlayer[] }) {
  const { lines, leaders } = ranked(stat, players);
  const [leader] = leaders;
  return (
    <Card variant="glass" role="region" aria-label={stat.label} className="gap-4 p-5">
      <span className="label-caps">{stat.label}</span>
      <div className="flex min-w-0 items-end justify-between gap-3">
        <b className={cn('num text-[40px] [line-height:.85]', !leader && 'text-t3')}>
          {formatted(leader?.value ?? null, stat.format)}
        </b>
        <span className="min-w-0 truncate pb-0.5 text-[14px] text-t2">
          {leaders.length > 1 ? 'Égalité' : leader ? leader.player.name : 'Personne'}
        </span>
      </div>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {lines.map((line) => (
          <Bar key={line.player.name} line={line} format={stat.format} />
        ))}
      </ol>
    </Card>
  );
}

function Bar({ line, format }: { line: RankedLine; format: StatFormat }) {
  return (
    <li className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-3 text-[13px] text-t2">
        <PlayerName player={line.player} />
        <span className={cn('num text-[15px]', line.value === null ? 'text-t3' : 'text-t1')}>
          {formatted(line.value, format)}
        </span>
      </span>
      <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-white/6">
        <i
          className="block h-full origin-left animate-grow rounded-full"
          style={{ width: `${line.share * 100}%`, background: `rgb(${rankLightRgb(line.player.tier)})` }}
        />
      </span>
    </li>
  );
}
