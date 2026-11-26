import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { cn } from 'cn';
import { type ReactNode, useState } from 'react';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { seasonMmrQuery } from '../queries';
import { type CareerAccount, type CareerScope, soloAccountOf } from './career';
import {
  allStats,
  bestOf,
  type ComparedPlayer,
  comparedPlayers,
  keyStats,
  type Prize,
  prizes,
  type RankedLine,
  ranked,
  type Stat,
  type StatFormat,
  seasonsPlayed,
} from './comparison';
import { rankLightRgb, splitRankLabel } from './stats';

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

function formatted(value: number | null, format: StatFormat): string {
  if (value === null) return '–';
  if (format === 'percent') return `${formatNumber(Math.round(value))} %`;
  // Two decimals: averages of a few matches are close, and one decimal would show a tie the bars deny.
  if (format === 'perMatch') return formatNumber(Math.round(value * 100) / 100);
  if (format === 'mmr') return value > 0 ? `+${formatNumber(value)}` : value < 0 ? `−${formatNumber(-value)}` : '0';
  return formatNumber(Math.round(value));
}

/**
 * The Stats page, opened from L'équipe: every player side by side over one season, or every season. The 2v2 peak
 * leads, as it tells a level; then the figures that say the most, the prizes, and every stat in a table.
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
  // The ratings come apart from the board: until they arrive, the peaks wait and the rest shows.
  const seasonMmr = useQuery(seasonMmrQuery).data ?? [];
  const played = board ? seasonsPlayed(board, seasonMmr, club.roster) : [];
  const seasons = [...new Set([...(current === null ? [] : [current]), ...played])].sort((a, b) => b - a);
  const season = saison === 'tout' ? null : (saison ?? current);
  const hasSolo = board ? club.roster.some((name) => soloAccountOf(board, name) !== null) : false;
  const account = hasSolo ? chosenAccount : 'all';
  const players = board
    ? comparedPlayers(board, seasonMmr, club.roster, club.me.duoPseudo, scope, account, season)
    : [];
  const anyMatch = players.some((player) => player.career.matches > 0);
  const choose = (next: string) =>
    void navigate({
      to: '.',
      search: (previous) => ({ ...previous, saison: next === 'tout' ? 'tout' : Number(next) }),
      resetScroll: false,
    });

  return (
    <TabPage back={<BackLink to="/">L’équipe</BackLink>} kicker="La team en chiffres" title="Stats">
      <div className="flex animate-rise flex-col gap-10 px-5 pt-6 [animation-delay:.06s] lg:gap-14 lg:px-0 lg:pt-0">
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
            <Skeleton className="h-[220px] rounded-[22px]" />
            <Skeleton className="h-[300px] rounded-[22px]" />
          </BoardPending>
        )}
        {board && <Peaks players={players} season={season} showAccount={hasSolo && account === 'all'} />}
        {board && !anyMatch && (
          <p className="m-0 -mt-4 text-[15px] text-t2">
            {modeWords[scope]} {season === null ? 'au compteur' : `en saison ${season}`}. Le kickoff attend.
          </p>
        )}
        {board && anyMatch && (
          <>
            <Section kicker="L’essentiel" title="Les chiffres clés">
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                {keyStats.map((stat) => (
                  <StatCard key={stat.label} stat={stat} players={players} />
                ))}
              </div>
            </Section>
            <Section kicker="Les prix" title="Et le trophée revient à…">
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                {prizes.map((prize) => (
                  <StatCard key={prize.prize} stat={prize} players={players} />
                ))}
              </div>
            </Section>
            <Section kicker="Tout le détail" title="Le tableau">
              <StatsTable stats={allStats(scope)} players={players} />
            </Section>
          </>
        )}
      </div>
    </TabPage>
  );
}

/** A block of the page, after the tabs' model: small capitals, then a title. */
function Section({ kicker, title, children }: { kicker: string; title: string; children: ReactNode }) {
  return (
    <section aria-label={kicker} className="flex flex-col gap-[18px]">
      <span className="flex flex-col gap-1.5">
        <span className="label-caps">{kicker}</span>
        <h2 className="title-display text-[24px] [line-height:normal]">{title}</h2>
      </span>
      {children}
    </section>
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
      <span className="truncate">{player.shown}</span>
      {player.me && <Badge variant="me">TOI</Badge>}
    </span>
  );
}

/**
 * The highest 2v2 rating of each player over the period, with its rank, and what the period brought from its first
 * rating to its last: a level, where a share of wins only tells a streak.
 */
function Peaks({
  players,
  season,
  showAccount,
}: {
  players: ComparedPlayer[];
  season: number | null;
  /** Both accounts count: each line says which one climbed highest. */
  showAccount: boolean;
}) {
  const lines = [...players].sort((a, b) => (b.mmr?.peak.mmr ?? -1) - (a.mmr?.peak.mmr ?? -1));
  const [top] = lines;
  return (
    <Card variant="glass" role="region" aria-label="Peak 2v2" className="gap-5 p-5 lg:p-6">
      <span className="label-caps">
        {season === null ? 'Peak 2v2 · toutes saisons' : `Peak 2v2 · saison ${season}`}
      </span>
      <ol className="m-0 flex list-none flex-col gap-4 p-0 lg:grid lg:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] lg:gap-6">
        {lines.map((player) => {
          const mmr = player.mmr;
          const rank = mmr ? splitRankLabel(mmr.peak.label) : null;
          return (
            <li key={player.name} className="flex min-w-0 items-center gap-3">
              <img
                src={`/rocket-league/ranks/${mmr?.peak.tier ?? 0}.png`}
                alt=""
                className="size-11 shrink-0 object-contain lg:size-14"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <PlayerName player={player} className="font-semibold text-[15px]" />
                <span className="truncate text-[13px] text-t3">
                  {rank
                    ? [rank.rank, rank.division, showAccount && `compte ${mmr?.account}`].filter(Boolean).join(' · ')
                    : 'Pas encore relevé'}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <b
                  className={cn(
                    'num text-[32px] [line-height:.85] lg:text-[40px]',
                    !mmr ? 'text-t3' : player === top ? 'text-t1' : 'text-t2',
                  )}
                >
                  {mmr ? formatNumber(mmr.peak.mmr) : '–'}
                </b>
                {mmr && (
                  <span
                    className={cn(
                      'num text-[14px]',
                      mmr.gained > 0 ? 'text-win' : mmr.gained < 0 ? 'text-cost-strong' : 'text-t3',
                    )}
                    title="Du premier MMR relevé de la saison au dernier"
                  >
                    {formatted(mmr.gained, 'mmr')} MMR
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/** One stat, or a prize: the leader's figure in big, then every player's bar against it. */
function StatCard({ stat, players }: { stat: Stat | Prize; players: ComparedPlayer[] }) {
  const { lines, leaders } = ranked(stat, players);
  const [leader] = leaders;
  const prize = 'prize' in stat ? stat.prize : null;
  return (
    <Card variant="glass" role="region" aria-label={prize ?? stat.label} className="gap-4 p-5">
      <span className="flex flex-col gap-1">
        <span className="label-caps">{stat.label}</span>
        {prize && <h3 className="title-display text-[20px] [line-height:1.1]">{prize}</h3>}
      </span>
      <div className="flex min-w-0 items-end justify-between gap-3">
        <b className={cn('num text-[40px] [line-height:.85]', !leader && 'text-t3')}>
          {formatted(leader?.value ?? null, stat.format)}
        </b>
        <span className="min-w-0 truncate pb-0.5 text-[14px] text-t2">
          {leaders.length > 1 ? 'Égalité' : leader ? leader.player.shown : 'Personne'}
        </span>
      </div>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {lines.map((line) => (
          <Bar key={line.player.name} line={line} format={stat.format} leading={leaders.includes(line)} />
        ))}
      </ol>
    </Card>
  );
}

/** A player's bar: the leader's in white, the others' in grey; the player's colour stays on the dot by their name. */
function Bar({ line, format, leading }: { line: RankedLine; format: StatFormat; leading: boolean }) {
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
          className={cn('block h-full origin-left animate-grow rounded-full', leading ? 'bg-t1' : 'bg-white/28')}
          style={{ width: `${line.share * 100}%` }}
        />
      </span>
    </li>
  );
}

/** Every stat, one line each, one column per player, the best figure of each line lit. */
function StatsTable({ stats, players }: { stats: Stat[]; players: ComparedPlayer[] }) {
  const lowest = new Intl.ListFormat('fr', { type: 'conjunction' }).format(
    stats.filter((stat) => stat.lowerIsBetter).map((stat) => stat.label.toLowerCase()),
  );
  return (
    <>
      <Card variant="glass" className="gap-0 py-1">
        <Table className="text-[14px]">
          <TableHeader>
            <TableRow className="border-line hover:bg-transparent">
              <TableHead className="sticky left-0 z-1 bg-card pl-4 font-normal text-t3 lg:pl-5">
                <span className="sr-only">Stat</span>
              </TableHead>
              {players.map((player) => (
                <TableHead key={player.name} className="min-w-24 text-right last:pr-4 lg:last:pr-5">
                  <PlayerName player={player} className="justify-end font-semibold text-[13px] text-t1" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.map((stat) => {
              const best = bestOf(stat, players);
              return (
                <TableRow key={stat.label} className="border-line hover:bg-white/3">
                  <TableHead scope="row" className="sticky left-0 z-1 bg-card pl-4 font-normal text-t2 lg:pl-5">
                    {stat.label}
                  </TableHead>
                  {players.map((player) => {
                    const value = stat.value(player);
                    return (
                      <TableCell
                        key={player.name}
                        className={cn(
                          'num text-right text-[15px] last:pr-4 lg:last:pr-5',
                          value === null ? 'text-t3' : value === best ? 'text-win' : 'text-t1',
                        )}
                      >
                        {formatted(value, stat.format)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      <p className="m-0 -mt-2 px-1 text-[12px] text-t3 [line-height:1.45]">
        <span className="text-win">En vert</span>, le meilleur de chaque ligne : le plus bas pour {lowest}.
      </p>
    </>
  );
}
