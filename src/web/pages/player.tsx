import { cn } from 'cn';
import { formatNumber, parisDay } from '../../lib/domain';
import { badgeRules } from '../board/badges';
import { useBoardState } from '../board/board-context';
import { statsOf, streaksOf } from '../board/model';
import type { DoublesRank, SeasonPeak, SoloRank } from '../board/types';
import { playerPlatform, useClub } from '../club';
import { BackLink, PageGlow, Panel } from '../components/club/page';
import { PlayerAvatar } from '../components/club/player-avatar';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { useDeclare } from '../declare/declare-context';

// One player: their ranks, results, debt and badges — what the old board's cards showed.

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

function RankIcon({ tier, className }: { tier: number | null; className?: string }) {
  if (tier == null) return <span aria-hidden="true" className={cn('rounded-2xl bg-secondary', className)} />;
  // Epic's rank icons, shown as they are.
  return (
    <img
      src={`/rocket-league/ranks/${tier}.png`}
      alt=""
      width={64}
      height={64}
      className={cn('object-contain', className)}
    />
  );
}

function peakLine(peak: SeasonPeak | null | undefined) {
  return peak ? `Pic de saison : ${peak.label} · ${formatNumber(peak.mmr)}` : '';
}

function DuoRank({ rank }: { rank: DoublesRank | undefined }) {
  const details = [
    peakLine(rank?.peak),
    rank?.matchesPlayed != null
      ? `${formatNumber(rank.matchesPlayed)} ${rank.matchesPlayed > 1 ? 'matchs classés' : 'match classé'}`
      : '',
    rank?.fetchedAt
      ? `${rank.status !== 'ready' ? 'Dernière valeur connue · ' : 'Relevé le '}${readAt.format(new Date(rank.fetchedAt))}`
      : '',
    rank?.status === 'unavailable' ? 'Actualisation du classement indisponible.' : '',
  ].filter(Boolean);
  return (
    <Panel aria-label="Rang 2v2" className="grid grid-cols-[64px_1fr_auto] items-center gap-3.5 p-4">
      <RankIcon tier={rank?.tier ?? null} className="size-16" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="kicker">2v2 classé · compte duo</span>
        <b className="font-display text-[22px] leading-tight">{rank?.label || 'Classement non reçu'}</b>
        {details.map((line) => (
          <small key={line} className="text-xs text-muted-foreground">
            {line}
          </small>
        ))}
      </div>
      <b className="font-numeral text-4xl">{rank?.mmr != null ? formatNumber(rank.mmr) : '—'}</b>
    </Panel>
  );
}

function Solo({ rank }: { rank: SoloRank }) {
  const notFound = rank.status === 'not_found' || rank.status === 'needs_player_id';
  const problem = rank.status === 'ready' ? null : (soloProblems[rank.status] ?? soloProblems.waiting);
  return (
    <Panel aria-label="Compte solo" className="gap-1 px-4 py-3">
      <div className="flex items-center justify-between gap-3 text-[13px] text-soft">
        <span className="flex items-center gap-2">
          {!notFound && <RankIcon tier={rank.tier} className="size-6" />}
          Compte solo · {notFound ? 'introuvable' : rank.label}
        </span>
        <b className="font-numeral text-xl text-foreground">
          {rank.mmr != null && !notFound ? formatNumber(rank.mmr) : '—'}
        </b>
      </div>
      {[
        !notFound ? peakLine(rank.peak) : '',
        problem ?? '',
        rank.fetchedAt && rank.mmr != null && !notFound
          ? `${rank.status !== 'ready' ? 'Dernière valeur connue · ' : 'Relevé le '}${readAt.format(new Date(rank.fetchedAt))}`
          : '',
      ]
        .filter(Boolean)
        .map((line) => (
          <small key={line} className="text-xs text-muted-foreground">
            {line}
          </small>
        ))}
    </Panel>
  );
}

export function PlayerPage({ position }: { position: string }) {
  const { roster, players } = useClub();
  const { data, me } = useBoardState();
  const { openDeclare } = useDeclare();
  const index = Number(position) - 1;
  const name = roster[index];
  if (!name) {
    return (
      <>
        <BackLink to="/" label="Retour au club" />
        <p className="text-sm text-muted-foreground">Ce joueur ne fait pas ou plus partie du club.</p>
      </>
    );
  }
  const stats = data ? statsOf(roster, data).find((line) => line.name === name) : undefined;
  const streak = data
    ? (streaksOf(roster, data, parisDay()).get(name) ?? { current: 0, best: 0 })
    : { current: 0, best: 0 };
  const rank = data?.doublesRanks?.find((r) => r.player === name);
  const platform = playerPlatform(players, name);
  const tagline = [
    platform,
    streak.current > 0 ? `série de ${streak.current} jour${streak.current > 1 ? 's' : ''}` : 'pas de série en cours',
  ]
    .filter(Boolean)
    .join(' · ');
  const owed = stats?.remaining ?? 0;

  return (
    <>
      <PageGlow tone="violet" />
      <header className="relative flex h-11 items-center justify-between lg:hidden">
        <BackLink to="/" label="Retour au club" />
        <span className="kicker">Fiche joueur</span>
        <span className="w-11" />
      </header>
      <span className="kicker relative hidden lg:block">Fiche joueur</span>
      <section aria-label="Identité" className="relative flex items-center gap-3.5 px-1 pt-1 lg:px-0">
        <PlayerAvatar
          name={name}
          me={name === me}
          index={index}
          className="size-[72px] [&_[data-slot=avatar-fallback]]:font-heading [&_[data-slot=avatar-fallback]]:text-[26px] [&_[data-slot=avatar-fallback]]:font-black"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="truncate font-display text-[30px] leading-none lg:text-[40px]">{name}</h1>
          <span className="text-[13px] text-muted-foreground">{tagline}</span>
        </div>
        <Button
          variant="secondary"
          onClick={() => openDeclare(name)}
          className="ml-auto hidden h-11 rounded-[14px] px-4 lg:inline-flex"
        >
          Déclarer pour {name === me ? 'moi' : name}
        </Button>
      </section>
      {!data || !stats ? (
        <Skeleton className="h-[400px] rounded-card" />
      ) : (
        <div className="relative flex flex-col gap-3.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5">
          <div className="flex flex-col gap-3.5">
            <DuoRank rank={rank} />
            {rank?.solo && <Solo rank={rank.solo} />}
            <Panel aria-label="Résultats" className="grid grid-cols-3">
              {(
                [
                  ['Parties', stats.played, ''],
                  ['Victoires', stats.wins, 'text-settled'],
                  ['Défaites', stats.losses, ''],
                ] as const
              ).map(([label, value, tone], i) => (
                <div key={label} className={cn('flex flex-col gap-1 px-3 py-3.5', i === 1 && 'border-x border-border')}>
                  <span className="kicker">{label}</span>
                  <b className={cn('font-numeral text-4xl', tone)}>{stats.played ? value : '—'}</b>
                </div>
              ))}
            </Panel>
            {!stats.played && <p className="-mt-1 px-1 text-xs text-muted-foreground">En attente du Direct PC.</p>}
          </div>
          <div className="flex flex-col gap-3.5">
            <Panel aria-label="Dette et efforts" className="gap-3 p-4">
              <div className="flex items-end justify-between gap-3">
                <span className="flex items-end gap-2">
                  <b
                    className={cn(
                      'font-numeral text-[64px] leading-[0.8] font-black',
                      owed > 0 ? 'text-cost' : 'text-settled',
                    )}
                  >
                    {formatNumber(owed)}
                  </b>
                  <span className="pb-0.5 text-[13px] leading-tight text-soft">
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
            <section aria-labelledby="badges-title" className="flex flex-col gap-2.5">
              <h2 id="badges-title" className="px-1 font-display text-xl lg:px-0">
                Badges
              </h2>
              <ul className="grid grid-cols-3 gap-x-2 gap-y-3.5">
                {badgeRules.map((badge) => {
                  const earned = badge.earned(stats, streak);
                  return (
                    <li
                      key={badge.id}
                      className={cn(
                        'flex flex-col items-center gap-1.5 text-center text-[11px] font-semibold text-soft',
                        !earned && 'opacity-35',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'flex size-[52px] items-center justify-center rounded-2xl text-2xl',
                          earned
                            ? badge.id === 'streak7'
                              ? 'bg-streak/14'
                              : 'bg-primary/15'
                            : 'bg-secondary grayscale',
                        )}
                      >
                        {badge.emoji}
                      </span>
                      {badge.label}
                      <span className="sr-only">{earned ? ' : obtenu' : ' : à débloquer'}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
            <Button variant="secondary" onClick={() => openDeclare(name)} className="h-12 rounded-[14px] lg:hidden">
              Déclarer pour {name === me ? 'moi' : name}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
