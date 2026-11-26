import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { cn } from 'cn';
import {
  Bomb,
  Crosshair,
  DoorOpen,
  Dumbbell,
  Eye,
  Flag,
  Ghost,
  Goal,
  type LucideIcon,
  Moon,
  Rocket,
  ShieldCheck,
  Target,
  Timer,
  TrendingDown,
  Trophy,
  Zap,
} from 'lucide-react';
import { type CSSProperties, type ReactNode, useState } from 'react';
import { formatNumber } from '../../lib/format';
import { seasonAt } from '../../lib/season';
import { useBoardState } from '../board';
import { useClub } from '../club';
import { BackLink } from '../components/back-link';
import { BoardPending } from '../components/board-pending';
import { FilterSelect } from '../components/filter-select';
import { SegmentedControl } from '../components/segmented-control';
import { TabPage } from '../components/tab-page';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { seasonMmrQuery } from '../queries';
import { type CareerAccount, type CareerScope, soloAccountOf } from './career';
import {
  bestOf,
  type ComparedPlayer,
  comparedPlayers,
  keyStats,
  type PeakGap,
  type Prize,
  prizes,
  type RankedLine,
  ranked,
  type Stat,
  type StatFormat,
  seasonsPlayed,
  type TableMode,
  type TableStat,
  tableSections,
  tableStats,
} from './comparison';
import { tilt, untilt } from './player-card';
import { rankLightRgb, rankRgb } from './stats';

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

const tableModes = [
  { value: 'perMatch', label: 'Par match' },
  { value: 'total', label: 'Total' },
] as const satisfies readonly { value: TableMode; label: string }[];

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
  // The game sends ball speeds in km/h, and distances in Unreal units: centimetres.
  if (format === 'speed') return `${formatNumber(Math.round(value))}\u00a0km/h`;
  if (format === 'distance') return `${formatNumber(Math.round(value / 10) / 10)}\u00a0m`;
  if (format === 'seconds') return `${formatNumber(Math.round(value * 10) / 10)}\u00a0s`;
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
  // Per match first: the players did not all play as many matches.
  const [tableMode, setTableMode] = useState<TableMode>('perMatch');
  const current = seasonAt(new Date().toISOString());
  // The ratings come apart from the board: until they arrive, the peaks wait and the rest shows.
  const stats = useQuery(seasonMmrQuery).data;
  const seasonMmr = stats?.seasons ?? [];
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
        {board && season !== null && <SeasonPeaks players={players} season={season} />}
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
              <PrizeShelf players={players} />
            </Section>
            <Section kicker="Tout le détail" title="Le tableau">
              <span className="w-full max-w-[260px]">
                <SegmentedControl
                  label="Chiffres du tableau"
                  options={tableModes}
                  value={tableMode}
                  onChange={setTableMode}
                />
              </span>
              <StatsTable stats={tableStats(scope, tableMode, players, stats?.statfeedLabels)} players={players} />
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

/** A player's pseudo, and TOI for the member. Their rank shows in the peaks, not again by every name. */
function PlayerName({ player, className }: { player: ComparedPlayer; className?: string }) {
  return (
    <span className={cn('flex min-w-0 items-center gap-1.5', className)}>
      <span className="truncate">{player.shown}</span>
      {player.me && <Badge variant="me">TOI</Badge>}
    </span>
  );
}

/** The gap between the season's peak and the peak all time, which ranks the players. */
const gapStat: Stat = {
  label: 'Écart au peak all time',
  format: 'mmr',
  value: (player) => player.peakGap?.gap ?? null,
};

/** The podium's steps: the first in the middle and highest, the second on the left, the third on the right. */
const podiumSteps = {
  1: { column: 'col-start-2', pedestal: 'h-14 lg:h-16' },
  2: { column: 'col-start-1', pedestal: 'h-9 lg:h-10' },
  3: { column: 'col-start-3', pedestal: 'h-5 lg:h-6' },
} as const;

/**
 * « Au plus près de son peak all time »: the podium of the solo accounts whose peak of the season came closest to
 * their peak all time. Each step is a player card: the gap reads first, then the player under their rank, then the
 * two peaks it comes from. Levels differ: the club compares the gaps, not the peaks. Whoever is not on it follows.
 */
function SeasonPeaks({ players, season }: { players: ComparedPlayer[]; season: number }) {
  const { lines } = ranked(gapStat, players);
  const climbers = lines.filter((line) => line.player.peakGap);
  const unread = lines.filter((line) => !line.player.peakGap).map((line) => line.player.soloShown);
  return (
    <section aria-label="Au plus près de son peak all time" className="flex flex-col gap-4">
      <span className="flex flex-col gap-1.5">
        <span className="label-caps">Saison {season} · peak solo</span>
        <h2 className="title-display text-[24px] [line-height:normal]">Au plus près de son peak all time</h2>
      </span>
      <ol className="m-0 grid list-none grid-cols-3 items-end gap-2 p-0 lg:mx-auto lg:w-full lg:max-w-[760px] lg:gap-5">
        {climbers.slice(0, 3).map((line, index) => (
          <PodiumCard key={line.player.name} line={line} step={(index + 1) as 1 | 2 | 3} />
        ))}
      </ol>
      {climbers.length > 3 && (
        <ol className="m-0 flex list-none flex-col gap-1 p-0">
          {climbers.slice(3).map(({ player, place }) => (
            <li
              key={player.name}
              className={cn('flex items-center gap-3 py-1.5 text-[14px] text-t2', player.me && mineClass)}
            >
              <Place place={place} mine={player.me} />
              <PlayerName player={{ ...player, shown: player.soloShown }} className="flex-1" />
              <b className="num text-[17px] text-t1">{formatted(player.peakGap?.gap ?? null, 'mmr')}</b>
            </li>
          ))}
        </ol>
      )}
      {unread.length > 0 && (
        <p className="m-0 text-[12px] text-t3 [line-height:1.45]">
          Compte solo pas encore relevé cette saison : {new Intl.ListFormat('fr').format(unread)}.
        </p>
      )}
    </section>
  );
}

/** One step of the podium: a player card in their rank's colour, standing on its pedestal. */
function PodiumCard({ line, step }: { line: RankedLine; step: 1 | 2 | 3 }) {
  const { player, place } = line;
  const gap = player.peakGap as PeakGap;
  const rgb = rankRgb(gap.tier);
  const first = step === 1;
  const reached = gap.gap === 0;
  return (
    <li className={cn('row-start-1 flex min-w-0 animate-rise flex-col gap-2', podiumSteps[step].column)}>
      <div
        onPointerMove={tilt}
        onPointerLeave={untilt}
        style={{ '--rank': rgb, '--rank-light': rankLightRgb(gap.tier) } as CSSProperties}
        className={cn(
          'player-card flex flex-col items-center gap-3 px-2.5 pt-4 pb-3.5 text-center lg:gap-4 lg:px-4 lg:pt-6 lg:pb-5',
          player.me && 'shadow-[inset_0_0_0_1px_rgba(255,255,255,.32)]',
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
              reached ? 'text-win' : 'text-t1',
            )}
          >
            {formatted(gap.gap, 'mmr')}
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
        <span className="relative z-4 flex min-w-0 max-w-full flex-col items-center gap-1">
          <span className="flex min-w-0 max-w-full flex-col items-center gap-1 lg:flex-row">
            <b className="line-clamp-2 break-all font-semibold text-[13px] [line-height:1.2] lg:text-[15px]">
              {player.soloShown}
            </b>
            {player.me && <Badge variant="tag">TOI</Badge>}
          </span>
          <span className="flex w-full flex-col gap-0.5 text-[11px] lg:flex-row lg:justify-center lg:gap-3 lg:text-[12px]">
            <span className="flex justify-between gap-1.5 lg:justify-center">
              <span className="text-t3">Saison</span>
              <span className={cn('num', reached ? 'text-t1' : 'text-t2')}>{formatNumber(gap.peak)}</span>
            </span>
            <span className="flex justify-between gap-1.5 lg:justify-center">
              <span className="text-t3">All time</span>
              <span className="num text-t2">{formatNumber(gap.allTime)}</span>
            </span>
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
        <span className={cn('num text-[15px] lg:text-[17px]', player.me ? medals[place ?? 0] : 'text-t3')}>
          {place}
        </span>
      </div>
      <span className="sr-only">Place {place}</span>
    </li>
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
      <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
        {lines.map((line) => (
          <Bar key={line.player.name} line={line} format={stat.format} />
        ))}
      </ol>
    </Card>
  );
}

/** The member's place wears a medal's colour on the podium. */
const medals: Record<number, string> = { 1: 'text-medal-1', 2: 'text-medal-2', 3: 'text-medal-3' };

/**
 * A player's place in a ranking. The member's in big, in its medal's colour on the podium: what the eye finds first;
 * the others' small and quiet.
 */
function Place({ place, mine }: { place: number | null; mine: boolean }) {
  return (
    <span
      className={cn(
        'num w-5 text-center [line-height:1]',
        mine ? ['text-[22px]', (place && medals[place]) ?? 'text-t1'] : 'text-[13px] text-t3',
      )}
    >
      {place ?? '–'}
    </span>
  );
}

/** The member's own line, set apart in a soft capsule, as a selected row would be. */
const mineClass = '-mx-3 rounded-[14px] bg-white/7 px-3 shadow-[inset_0_0_0_.5px_rgba(255,255,255,.1)]';

/**
 * A player's line in a stat: their place, pseudo and figure, then their bar. The member's stands out in a capsule,
 * their bar in white; the others' stay grey.
 */
function Bar({ line, format }: { line: RankedLine; format: StatFormat }) {
  const mine = line.player.me;
  return (
    <li className={cn('grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 py-1.5', mine && mineClass)}>
      <Place place={line.place} mine={line.player.me} />
      <span className="flex min-w-0 flex-col gap-1.5">
        <span
          className={cn(
            'flex items-baseline justify-between gap-3',
            mine ? 'text-[15px] text-t1' : 'text-[13px] text-t2',
          )}
        >
          <PlayerName player={line.player} className={cn(mine && 'font-semibold')} />
          <span
            className={cn(
              'num',
              mine ? 'text-[17px]' : 'text-[15px]',
              line.value === null ? 'text-t3' : mine ? 'text-t1' : 'text-t2',
            )}
          >
            {formatted(line.value, format)}
          </span>
        </span>
        <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-white/6">
          <i
            className={cn('block h-full origin-left animate-grow rounded-full', mine ? 'bg-t1' : 'bg-white/40')}
            style={{ width: `${line.share * 100}%` }}
          />
        </span>
      </span>
    </li>
  );
}

/** Each prize's picture, drawn from its stat. */
const prizeIcons: Record<string, LucideIcon> = {
  'Le démolisseur': Bomb,
  'L’abonné aux montants': Goal,
  'Le roi des prolongations': Timer,
  'Clean sheet': ShieldCheck,
  'Le noctambule': Moon,
  'Rage quit': DoorOpen,
  'Les bras d’acier': Dumbbell,
  'La chute': TrendingDown,
  'Le canonnier': Zap,
  'Le bolide': Rocket,
  'Le sniper': Crosshair,
  'L’œil de lynx': Eye,
  'Le roi du kickoff': Flag,
  'Le punching-ball': Target,
  'Le traître': Ghost,
};

/** What the member lacks to take a prize from its leader, in the prize's own unit. */
function gapOf(leader: number | null, mine: number, format: StatFormat): string {
  const gap = Math.max(0, (leader ?? 0) - mine);
  if (format === 'percent') return `${formatNumber(Math.round(gap))} point${Math.round(gap) >= 2 ? 's' : ''}`;
  if (format === 'perMatch') return `${formatted(gap, format)} par match`;
  return formatted(gap, format);
}

/** A player's bar in a trophy: their pseudo and figure, then their bar against the leader's; the member's in white. */
function PrizeLine({ line, format }: { line: RankedLine; format: StatFormat }) {
  const mine = line.player.me;
  return (
    <li className="flex flex-col gap-1">
      <span
        className={cn('flex min-w-0 items-baseline justify-between gap-2 text-[12px]', mine ? 'text-t1' : 'text-t2')}
      >
        <span className={cn('min-w-0 truncate', mine && 'font-semibold')}>{line.player.shown}</span>
        <span className={cn('num shrink-0 text-[13px]', line.value === null && 'text-t3')}>
          {formatted(line.value, format)}
        </span>
      </span>
      <span aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-white/6">
        <i
          className={cn('block h-full origin-left animate-grow rounded-full', mine ? 'bg-t1' : 'bg-white/40')}
          style={{ width: `${line.share * 100}%` }}
        />
      </span>
    </li>
  );
}

/**
 * The prizes as a trophy shelf: small tiles, the member's own trophies first and in gold, each with every player's
 * bar, the leader first, and what the member lacks to take it. A prize nobody can win yet (a stat no collector sent)
 * waits.
 */
function PrizeShelf({ players }: { players: ComparedPlayer[] }) {
  const shelf = prizes
    .filter((prize) => players.some((player) => prize.value(player) !== null))
    .map((prize) => ({ prize, ...ranked(prize, players) }))
    .map((entry) => ({ ...entry, won: entry.leaders.some((line) => line.player.me) }))
    .sort((a, b) => Number(b.won) - Number(a.won));
  const won = shelf.filter((entry) => entry.won).length;
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 -mt-2 text-[15px] text-t2">
        {won === 0
          ? 'Aucun pour toi cette fois. La revanche est à un match.'
          : `Tu en remportes ${formatNumber(won)} sur ${formatNumber(shelf.length)}.`}
      </p>
      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-3 lg:grid-cols-4">
        {shelf.map(({ prize, lines, leaders, won: mine }) => {
          const Icon = prizeIcons[prize.prize] ?? Trophy;
          const [leader] = leaders;
          const me = lines.find((line) => line.player.me);
          return (
            <li
              key={prize.prize}
              className={cn(
                'relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-[20px] p-4',
                mine
                  ? 'bg-[radial-gradient(120%_90%_at_0%_0%,color-mix(in_oklab,var(--medal-1)_16%,transparent),transparent_65%),rgba(255,255,255,.05)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--medal-1)_45%,transparent)]'
                  : 'bg-white/4 shadow-[inset_0_0_0_.5px_rgba(255,255,255,.08)]',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-10 items-center justify-center rounded-full',
                  mine ? 'bg-medal-1/15 text-medal-1' : 'bg-white/7 text-t2',
                )}
              >
                <Icon size={20} />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <h3 className="title-display text-[18px] [line-height:1.1]">{prize.prize}</h3>
                <span className="text-[12px] text-t3 [line-height:1.3]">{prize.label}</span>
              </span>
              <ol aria-label={`Classement : ${prize.prize}`} className="m-0 mt-auto flex list-none flex-col gap-2 p-0">
                {lines.map((line) => (
                  <PrizeLine key={line.player.name} line={line} format={prize.format} />
                ))}
              </ol>
              <span className={cn('text-[12px] [line-height:1.3]', mine ? 'text-medal-1' : 'text-t2')}>
                {mine
                  ? 'Il est à toi.'
                  : leader && me?.value != null
                    ? `Il te manque ${gapOf(leader.value, me.value, prize.format)}.`
                    : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Every stat, part by part, one column per player, the member's tinted, the best figure of each line lit. Each part
 * says above it whether its figures read per match.
 */
function StatsTable({ stats, players }: { stats: TableStat[]; players: ComparedPlayer[] }) {
  const sections = tableSections
    .map((section) => ({ section, stats: stats.filter((stat) => stat.section === section) }))
    .filter(({ stats: lines }) => lines.length > 0);
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
                <TableHead
                  key={player.name}
                  className={cn('min-w-24 text-right last:pr-4 lg:last:pr-5', player.me && 'bg-white/6')}
                >
                  <PlayerName player={player} className="justify-end font-semibold text-[13px] text-t1" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          {sections.map(({ section, stats: lines }) => (
            <TableBody key={section}>
              <TableRow className="border-0 hover:bg-transparent">
                <TableHead
                  colSpan={players.length + 1}
                  scope="colgroup"
                  className="h-auto px-4 pt-6 pb-2 font-normal lg:px-5"
                >
                  <span className="label-caps">
                    {section}
                    {lines.some((line) => line.perMatch) && <span className="text-t3/70"> · par match</span>}
                  </span>
                </TableHead>
              </TableRow>
              {lines.map((stat) => {
                const best = bestOf(stat, players);
                return (
                  <TableRow key={stat.label} className="border-line hover:bg-white/3">
                    <TableHead scope="row" className="sticky left-0 z-1 bg-card pl-4 font-normal text-t2 lg:pl-5">
                      {stat.label}
                      {stat.lowerIsBetter && (
                        <span className="ml-1 text-t3" title="Le plus bas est le meilleur">
                          ↓
                        </span>
                      )}
                    </TableHead>
                    {players.map((player) => {
                      const value = stat.value(player);
                      return (
                        <TableCell
                          key={player.name}
                          className={cn(
                            'num text-right text-[15px] last:pr-4 lg:last:pr-5',
                            player.me && 'bg-white/6',
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
          ))}
        </Table>
      </Card>
      <p className="m-0 -mt-2 px-1 text-[12px] text-t3 [line-height:1.45]">
        <span className="text-win">En vert</span>, le meilleur de chaque ligne ; ↓ : le plus bas est le meilleur.
      </p>
    </>
  );
}
