import { cn } from 'cn';
import { formatNumber, parisDay } from '../../lib/domain';
import { badgeRules } from '../board/badges';
import { useBoardState } from '../board/board-context';
import { statsOf, streaksOf, tierOf } from '../board/model';
import type { BoardState, DoublesRank, PlayerStats, SeasonPeak, SoloRank, Streak } from '../board/types';
import { playerPlatform, useClub } from '../club';
import { Odometer } from '../components/club/odometer';
import { BackLink, PageGlow, Panel } from '../components/club/page';
import { PlayerAvatar } from '../components/club/player-avatar';
import { Skeleton } from '../components/ui/skeleton';
import { useDeclare } from '../declare/declare-context';

// One player: their ranks, results, debt and badges. A phone stacks them under the player's name; a wide screen
// sets them out as the design's desktop card, a row of three blocks and the badges.

const readAt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/** What keeps a solo account from showing a fresh rank, said so the player knows what to do. */
const soloProblems: Record<string, string> = {
  waiting: 'En attente du prochain relevé.',
  not_found: 'Aucun compte Epic n’a exactement ce nom : pseudo solo à vérifier dans le profil.',
  needs_player_id:
    'Aucun compte Epic n’a ce nom. Sur console, le pseudo solo doit être le nom d’affichage Epic du compte lié à Epic.',
  lookup_unavailable: 'Recherche du compte indisponible pour l’instant : nouvel essai demain.',
  read_failed: 'Le jeu n’a pas répondu pour ce compte lors du dernier relevé.',
};

const mmrOf = (mmr: number | null | undefined) => (mmr != null ? formatNumber(mmr) : '—');

function RankIcon({ tier, className }: { tier: number | null; className?: string }) {
  if (tier == null) return <span aria-hidden="true" className={cn('rounded-2xl bg-secondary', className)} />;
  // Epic's rank icons, shown as they are.
  return (
    <img
      src={`/rocket-league/ranks/${tier}.png`}
      alt=""
      width={72}
      height={72}
      className={cn('object-contain', className)}
    />
  );
}

/** When a rank was not refreshed: since when its figure dates, or that the source is down. */
function staleLines(rank: { status: string; fetchedAt: string | null } | undefined) {
  if (!rank || rank.status === 'ready') return [];
  return [
    rank.fetchedAt ? `Dernière valeur connue · ${readAt.format(new Date(rank.fetchedAt))}` : '',
    rank.status === 'unavailable' ? 'Actualisation du classement indisponible.' : '',
  ].filter(Boolean);
}

function soloState(solo: SoloRank) {
  const notFound = solo.status === 'not_found' || solo.status === 'needs_player_id';
  const problem = solo.status === 'ready' ? null : (soloProblems[solo.status] ?? soloProblems.waiting);
  return { notFound, problem };
}

const peakText = (peak: SeasonPeak | null | undefined) =>
  peak ? `${tierOf(peak.label)} · ${formatNumber(peak.mmr)}` : '';

function Lines({ lines }: { lines: string[] }) {
  return lines.map((line) => (
    <small key={line} className="text-xs text-muted-foreground">
      {line}
    </small>
  ));
}

/**
 * The line under the name, in the club's joking tone: the club's best rating who still owes push-ups gets the
 * design's line; anyone else keeps their streak.
 */
function taglineOf(name: string, data: BoardState | null, owed: number, streak: Streak) {
  const ranks = data?.doublesRanks ?? [];
  const mine = ranks.find((rank) => rank.player === name)?.mmr;
  const best = mine != null && ranks.every((rank) => rank.mmr == null || rank.mmr <= mine);
  if (best && owed > 0) return 'le patron du MMR, pas encore celui des pompes';
  return streak.current > 0
    ? `série de ${streak.current} jour${streak.current > 1 ? 's' : ''}`
    : 'pas de série en cours';
}

/** The badges, those won first; on a phone each name breaks before its last word, as in the design. */
function Badges({ stats, streak, wide }: { stats: PlayerStats; streak: Streak; wide?: boolean }) {
  const badges = badgeRules
    .map((badge) => ({ badge, earned: badge.earned(stats, streak) }))
    .sort((a, b) => Number(b.earned) - Number(a.earned));
  return (
    <ul
      className={cn(
        'grid',
        wide ? 'grid-cols-[repeat(auto-fit,minmax(110px,1fr))] gap-4' : 'grid-cols-3 gap-x-2 gap-y-3.5',
      )}
    >
      {badges.map(({ badge, earned }) => {
        const cut = badge.label.lastIndexOf(' ');
        return (
          <li
            key={badge.id}
            className={cn(
              'flex flex-col items-center text-center font-semibold text-soft',
              wide ? 'gap-2 text-xs' : 'gap-1.5 text-[11px]',
              !earned && 'opacity-35',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex items-center justify-center transition-colors duration-500',
                wide ? 'size-14 rounded-[18px]' : 'size-[52px] rounded-2xl',
                earned
                  ? badge.id === 'streak7'
                    ? 'bg-streak/14 text-streak'
                    : 'bg-primary/15 text-link'
                  : 'bg-secondary text-muted-foreground',
              )}
            >
              <badge.icon
                className={cn(
                  wide ? 'size-[26px]' : 'size-6',
                  earned && badge.id === 'streak7' && 'motion-safe:animate-flame',
                )}
              />
            </span>
            {wide ? (
              badge.label
            ) : (
              <span>
                {badge.label.slice(0, cut)}
                <br />
                {badge.label.slice(cut + 1)}
              </span>
            )}
            <span className="sr-only">{earned ? ' : obtenu' : ' : à débloquer'}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Owed({ owed, wide }: { owed: number; wide?: boolean }) {
  return (
    <span className="flex items-end gap-2">
      <b className={cn('font-numeral text-[64px] leading-[0.8] font-black', owed > 0 ? 'text-cost' : 'text-settled')}>
        <Odometer value={formatNumber(owed)} />
      </b>
      <span className={cn('text-[13px] text-soft', !wide && 'pb-0.5')}>
        {owed > 0 ? (
          <>
            pompes
            <br />à rendre
          </>
        ) : (
          'à jour'
        )}
      </span>
    </span>
  );
}

const results = (stats: PlayerStats) =>
  [
    ['Parties', stats.played, ''],
    ['Victoires', stats.wins, 'text-settled'],
    ['Défaites', stats.losses, ''],
  ] as const;

/** The way to declare for this player, which the design leaves out: a blue link under the badges. */
function DeclareFor({ name, me, className }: { name: string; me: string | null; className?: string }) {
  const { openDeclare } = useDeclare();
  return (
    <button
      type="button"
      onClick={() => openDeclare(name)}
      className={cn(
        'flex min-h-11 cursor-pointer items-center justify-between gap-2 px-1 py-3 text-left text-sm font-semibold text-link hover:text-link-hover',
        className,
      )}
    >
      Déclarer pour {name === me ? 'moi' : name}
      <span aria-hidden="true">→</span>
    </button>
  );
}

function PhoneCard({
  name,
  index,
  me,
  tagline,
  platform,
  rank,
  stats,
  streak,
}: {
  name: string;
  index: number;
  me: string | null;
  tagline: string;
  platform: string;
  rank: DoublesRank | undefined;
  stats: PlayerStats | undefined;
  streak: Streak;
}) {
  const solo = rank?.solo ? soloState(rank.solo) : null;
  return (
    <div className="contents lg:hidden">
      <PageGlow tone="violet" />
      <header className="relative flex h-11 items-center justify-between">
        <BackLink to="/" label="Retour au club" />
        <span className="kicker">Fiche joueur</span>
        <span className="w-11" />
      </header>
      <section aria-label="Identité" className="relative flex items-center gap-3.5 px-1 pt-1">
        <PlayerAvatar
          name={name}
          me={name === me}
          index={index}
          className="size-[72px] [&_[data-slot=avatar-fallback]]:font-heading [&_[data-slot=avatar-fallback]]:text-[26px] [&_[data-slot=avatar-fallback]]:font-black [&_[data-slot=avatar-fallback]]:[font-stretch:75%]"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-[30px] leading-none">{name}</h1>
          <span className="text-[13px] text-muted-foreground">{[platform, tagline].filter(Boolean).join(' · ')}</span>
        </div>
      </section>
      {!stats ? (
        <Skeleton className="relative h-[400px] rounded-card" />
      ) : (
        <>
          <Panel aria-label="Rang 2v2" className="relative grid grid-cols-[64px_1fr_auto] items-center gap-3.5 p-4">
            <RankIcon tier={rank?.tier ?? null} className="size-16" />
            <div className="flex min-w-0 flex-col gap-[3px]">
              <span className="kicker">2v2 classé · compte duo</span>
              <b className="font-display text-[22px]">{rank?.label ? tierOf(rank.label) : 'Classement non reçu'}</b>
              <Lines
                lines={[rank?.peak ? `Pic de saison : ${peakText(rank.peak)}` : '', ...staleLines(rank)].filter(
                  Boolean,
                )}
              />
            </div>
            <b className="font-numeral text-4xl">{mmrOf(rank?.mmr)}</b>
          </Panel>
          {rank?.solo && solo && (
            <Panel aria-label="Compte solo" className="relative gap-1 px-4 py-3">
              <div className="flex items-center justify-between text-[13px] text-soft">
                <span>Compte solo · {solo.notFound ? 'introuvable' : tierOf(rank.solo.label)}</span>
                <b className="font-numeral text-xl text-foreground">{solo.notFound ? '—' : mmrOf(rank.solo.mmr)}</b>
              </div>
              <Lines lines={[solo.problem ?? ''].filter(Boolean)} />
            </Panel>
          )}
          <Panel aria-label="Résultats" className="relative grid grid-cols-3">
            {results(stats).map(([label, value, tone], i) => (
              <div key={label} className={cn('flex flex-col gap-1 px-3 py-3.5', i === 1 && 'border-x border-border')}>
                <span className="kicker">{label}</span>
                <b className={cn('font-numeral text-4xl', tone)}>{stats.played ? value : '—'}</b>
              </div>
            ))}
          </Panel>
          {!stats.played && <p className="-mt-1 px-1 text-xs text-muted-foreground">En attente du Direct PC.</p>}
          <Panel aria-label="Dette et efforts" className="relative gap-3 p-4">
            <div className="flex items-end justify-between">
              <Owed owed={stats.remaining} />
              <span className="text-right text-xs text-muted-foreground">
                {formatNumber(stats.done)} réalisées
                <br />
                sur {formatNumber(stats.due)} dues
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
              <span>
                Pompes<b className="block font-numeral text-[22px] text-foreground">{formatNumber(stats.pushups)}</b>
              </span>
              <span>
                Gainage
                <b className="block font-numeral text-[22px] text-foreground">
                  {formatNumber(stats.plankSeconds / 60)} min
                </b>
              </span>
              <span>
                Abdos<b className="block font-numeral text-[22px] text-foreground">{formatNumber(stats.crunches)}</b>
              </span>
            </div>
          </Panel>
          <section aria-labelledby="badges-title" className="relative flex flex-col gap-2.5">
            <h2 id="badges-title" className="px-1 font-display text-xl">
              Badges
            </h2>
            <Badges stats={stats} streak={streak} />
          </section>
          <DeclareFor name={name} me={me} className="relative" />
        </>
      )}
    </div>
  );
}

function WideCard({
  name,
  index,
  me,
  tagline,
  platform,
  rank,
  stats,
  streak,
}: {
  name: string;
  index: number;
  me: string | null;
  tagline: string;
  platform: string;
  rank: DoublesRank | undefined;
  stats: PlayerStats | undefined;
  streak: Streak;
}) {
  const solo = rank?.solo ? soloState(rank.solo) : null;
  // The design leaves these boxes in content-box sizing: its bases do not count their padding and edge, which
  // these border-box ones add back (120 + 36 down a column, 120 + 40 along a row, 320 + 2 or + 42 for a card).
  const block = 'flex flex-col gap-1.5 px-5 py-[18px]';
  return (
    <div className="hidden lg:contents">
      <BackLink to="/" label="Retour au club" wide="L’équipe" />
      <Panel aria-label="Identité" className="relative flex-row flex-wrap items-center gap-6 p-7">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(70%_120%_at_0%_0%,rgb(150_90_230/0.25),rgb(17_17_20/0)_70%)]"
        />
        <PlayerAvatar
          name={name}
          me={name === me}
          index={index}
          className="relative size-24 [&_[data-slot=avatar-fallback]]:font-heading [&_[data-slot=avatar-fallback]]:text-[34px] [&_[data-slot=avatar-fallback]]:font-black [&_[data-slot=avatar-fallback]]:[font-stretch:75%]"
        />
        <div className="relative flex flex-[1_1_260px] flex-col gap-1.5">
          <span className="kicker">Fiche joueur</span>
          <h1 className="font-display text-[44px] leading-none">{name}</h1>
          <span className="text-sm text-muted-foreground">{[platform, tagline].filter(Boolean).join(' · ')}</span>
        </div>
        <div className="relative flex items-center gap-4">
          <RankIcon tier={rank?.tier ?? null} className="size-[72px]" />
          <span className="flex flex-col gap-0.5">
            <span className="kicker">2v2 · compte duo</span>
            <b className="font-display text-2xl">{rank?.label ? tierOf(rank.label) : 'Classement non reçu'}</b>
            <b className="font-numeral text-[34px] leading-[0.9]">{mmrOf(rank?.mmr)}</b>
          </span>
        </div>
      </Panel>
      {!stats ? (
        <Skeleton className="h-[314px] rounded-card" />
      ) : (
        <>
          <div className="flex flex-wrap gap-5">
            <Panel aria-label="Rangs" className="flex-[1_1_322px]">
              <div className={cn(block, 'flex-[1_1_156px]')}>
                <span className="kicker">Pic de saison</span>
                <b className="font-display text-[22px]">
                  {rank?.peak ? (
                    <>
                      {tierOf(rank.peak.label)} ·{' '}
                      <span className="font-numeral text-[26px]">{formatNumber(rank.peak.mmr)}</span>
                    </>
                  ) : (
                    '—'
                  )}
                </b>
                <Lines lines={staleLines(rank)} />
              </div>
              {rank?.solo && solo && (
                <div className={cn(block, 'flex-[1_1_156px] border-t border-border')}>
                  <span className="kicker">Compte solo</span>
                  <b className="font-display text-[22px]">
                    {solo.notFound ? (
                      'Introuvable'
                    ) : (
                      <>
                        {tierOf(rank.solo.label)} ·{' '}
                        <span className="font-numeral text-[26px]">{mmrOf(rank.solo.mmr)}</span>
                      </>
                    )}
                  </b>
                  <Lines
                    lines={[
                      !solo.notFound && rank.solo.peak ? `Pic de saison ${formatNumber(rank.solo.peak.mmr)}` : '',
                      solo.problem ?? '',
                    ].filter(Boolean)}
                  />
                </div>
              )}
            </Panel>
            <Panel aria-label="Résultats" className="flex-[1_1_322px] flex-row flex-wrap">
              {results(stats).map(([label, value, tone], i) => (
                <div key={label} className={cn(block, 'flex-[1_1_160px]', i > 0 && 'border-l border-border')}>
                  <span className="kicker">{label}</span>
                  <b className={cn('font-numeral text-5xl', tone)}>{stats.played ? value : '—'}</b>
                </div>
              ))}
            </Panel>
            <Panel aria-label="Dette" className="flex-[1_1_362px] gap-3 px-5 py-[18px]">
              <div className="flex items-end justify-between">
                <Owed owed={stats.remaining} wide />
                <span className="text-right text-xs text-muted-foreground">
                  {formatNumber(stats.done)} / {formatNumber(stats.due)}
                  <br />
                  réalisées
                </span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  Pompes <b className="text-foreground">{formatNumber(stats.pushups)}</b>
                </span>
                <span>
                  Gainage <b className="text-foreground">{formatNumber(stats.plankSeconds / 60)} min</b>
                </span>
                <span>
                  Abdos <b className="text-foreground">{formatNumber(stats.crunches)}</b>
                </span>
              </div>
            </Panel>
          </div>
          {!stats.played && <p className="-mt-3 text-xs text-muted-foreground">En attente du Direct PC.</p>}
          <Panel aria-labelledby="badges-title-wide" className="p-5">
            <h2 id="badges-title-wide" className="mb-4 font-display text-xl">
              Badges
            </h2>
            <Badges stats={stats} streak={streak} wide />
          </Panel>
          <DeclareFor name={name} me={me} className="-mt-3 self-start" />
        </>
      )}
    </div>
  );
}

export function PlayerPage({ position }: { position: string }) {
  const { roster, players } = useClub();
  const { data, me } = useBoardState();
  const index = Number(position) - 1;
  const name = roster[index];
  if (!name) {
    return (
      <>
        <BackLink to="/" label="Retour au club" wide="L’équipe" />
        <p className="text-sm text-muted-foreground">Ce joueur ne fait pas ou plus partie du club.</p>
      </>
    );
  }
  const stats = data ? statsOf(roster, data).find((line) => line.name === name) : undefined;
  const streak = data
    ? (streaksOf(roster, data, parisDay()).get(name) ?? { current: 0, best: 0 })
    : { current: 0, best: 0 };
  const card = {
    name,
    index,
    me,
    tagline: taglineOf(name, data, stats?.remaining ?? 0, streak),
    platform: playerPlatform(players, name),
    rank: data?.doublesRanks?.find((r) => r.player === name),
    stats,
    streak,
  };
  return (
    <>
      <PhoneCard {...card} />
      <WideCard {...card} />
    </>
  );
}
