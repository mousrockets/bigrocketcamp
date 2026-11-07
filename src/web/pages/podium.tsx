import { cn } from 'cn';
import { useState } from 'react';
import { dailyRecap, formatNumber, parisDay, pushupCredit } from '../../lib/domain';
import { useBoardState } from '../board/board-context';
import { lastPlaceRulesOf, shiftDay, weekStart } from '../board/model';
import { readStorage, writeStorage } from '../board/storage';
import { useClub } from '../club';
import { BackLink, PageHeader } from '../components/club/page';
import { PlayerAvatar } from '../components/club/player-avatar';
import { Segmented } from '../components/club/segmented';
import { Skeleton } from '../components/ui/skeleton';
import { monthOf } from './challenge-copy';

// The week's podium of effort since Monday, or the month's provisional MMR podium: a page on a phone, a card of
// the challenge on a wide screen.

export type PodiumMode = 'effort' | 'mmr';

type Step = { name: string; index: number; value: string };

/** Both podiums, the one the member last chose, and the design's words around them. */
export function usePodium() {
  const { roster } = useClub();
  const { data, me } = useBoardState();
  const [mode, setMode] = useState<PodiumMode>(() => (readStorage('rl-podium') === 'mmr' ? 'mmr' : 'effort'));
  const choose = (next: PodiumMode) => {
    setMode(next);
    writeStorage('rl-podium', next);
  };
  const today = parisDay();
  const monday = weekStart(today);
  const days: string[] = [];
  for (let day = monday; day <= today; day = shiftDay(day, 1)) days.push(day);
  const rules = lastPlaceRulesOf(data);
  const recaps = data ? days.map((day) => dailyRecap(roster, data.results, day, data.matchRosters || [], rules)) : [];
  const weekly = roster.map((name, index) => ({
    name,
    index,
    effort: (data?.exercises ?? [])
      .filter((e) => e.player === name && e.day >= monday && e.day <= today)
      .reduce((sum, e) => sum + pushupCredit(e), 0),
    generated: recaps.reduce((sum, r) => sum + (r.players.find((p) => p.name === name)?.generated ?? 0), 0),
  }));
  const effort = [...weekly].sort((a, b) => b.effort - a.effort);
  // The red lantern of the week: the one whose defeats generated the most pushups.
  const debtor = [...weekly].sort((a, b) => b.generated - a.generated)[0];
  const month = data?.monthly?.current;
  const mmr = roster
    .map((name, index) => ({ name, index, mmr: month?.rows.find((row) => row.player === name)?.mmr ?? null }))
    .sort((a, b) => (b.mmr ?? -1) - (a.mmr ?? -1));
  const ranked: Step[] =
    mode === 'mmr'
      ? mmr.map((p) => ({ name: p.name, index: p.index, value: p.mmr !== null ? formatNumber(p.mmr) : '—' }))
      : effort.map((p) => ({ name: p.name, index: p.index, value: formatNumber(p.effort) }));
  const missingMmr = mode === 'mmr' && mmr.some((p) => p.mmr === null);
  const best = effort[0];
  const leader = best && best.effort > 0 ? `${best.name} mène la semaine.` : 'Personne n’a encore bougé cette semaine.';
  const lantern = debtor && debtor.generated > 0 ? debtor.name : null;
  const first = mmr[0];
  const last = mmr.length > 1 ? mmr[mmr.length - 1] : undefined;
  const tournee = last?.mmr != null ? `${last.name} sent déjà l’odeur de la tournée.` : '';
  return {
    ready: !!data,
    me,
    mode,
    choose,
    ranked,
    missingMmr,
    kicker: mode === 'mmr' ? `2v2 classé · ${month ? monthOf(month.month) : 'ce mois'}` : 'Depuis lundi',
    title: mode === 'mmr' ? 'Le podium MMR' : 'Les bras d’or',
    /** The phone's sentence under the podium. */
    line:
      mode === 'mmr'
        ? first?.mmr != null
          ? `${first.name} plane.${tournee ? ` ${tournee}` : ''}`
          : 'Les MMR du mois restent à relever.'
        : `${leader}${lantern ? ` Lanterne rouge : ${lantern}, qui a surtout généré des pompes.` : ''}`,
    /** The wide screen's shorter sentence above it. */
    shortLine:
      mode === 'mmr'
        ? tournee || 'Les MMR du mois restent à relever.'
        : `${leader}${lantern ? ` Lanterne rouge : ${lantern}.` : ''}`,
    note:
      mode === 'mmr'
        ? 'Provisoire : les boissons se décident à la clôture.'
        : 'En équivalent pompes. Gainage et abdos comptent.',
  };
}

const phoneHeights: Record<number, string> = { 1: 'h-[200px]', 2: 'h-[140px]', 3: 'h-[90px]' };
const cardHeights: Record<number, string> = { 1: 'h-[170px]', 2: 'h-[120px]', 3: 'h-[80px]' };
const greyAvatar = '[&_[data-slot=avatar-fallback]]:bg-[#2a2b31] [&_[data-slot=avatar-fallback]]:text-[#d6d7dc]';

/**
 * The three steps, the winner in the middle. On the phone's page, with each player's disc; in the wide screen's
 * card, smaller and without.
 */
export function PodiumSteps({
  ranked,
  me,
  size,
  className,
}: {
  ranked: Step[];
  me: string | null;
  size: 'page' | 'card';
  className?: string;
}) {
  const page = size === 'page';
  // Second, first, third.
  const steps = [ranked[1], ranked[0], ranked[2]].filter((step) => step !== undefined);
  return (
    <ol aria-label="Podium" className={cn('grid grid-cols-3 items-end gap-2', className)}>
      {steps.map((step) => {
        const rank = ranked.indexOf(step) + 1;
        return (
          <li key={step.name} className={cn('flex min-w-0 flex-col items-center', page ? 'gap-2' : 'gap-1.5')}>
            {page && (
              <PlayerAvatar
                name={step.name}
                me={step.name === me}
                index={step.index}
                className={cn(
                  '[&_[data-slot=avatar-fallback]]:text-sm',
                  rank === 1 ? 'size-14' : 'size-11',
                  step.name !== me && greyAvatar,
                )}
              />
            )}
            <b className={cn('max-w-full truncate font-semibold', page ? 'text-sm' : 'text-[13px]')}>{step.name}</b>
            <span className={cn('font-numeral', page ? 'text-[30px] leading-none' : 'text-[26px]')}>{step.value}</span>
            <div
              className={cn(
                'flex w-full animate-rise justify-center rounded-t-[12px] pt-2.5',
                rank === 3 && '[animation-delay:.1s]',
                (page ? phoneHeights : cardHeights)[rank],
                rank === 1 ? 'bg-primary' : page ? 'bg-secondary dark:bg-[#1a1b20]' : 'bg-surface',
              )}
            >
              <span
                className={cn(
                  'font-numeral font-black',
                  page ? 'text-[40px]' : 'text-4xl',
                  rank === 1 ? 'text-white' : 'text-faint dark:text-[#55575e]',
                )}
              >
                <span className="sr-only">Place </span>
                {rank}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const pageModes = [
  { value: 'effort', label: 'Efforts' },
  { value: 'mmr', label: 'MMR 2v2' },
] as const;

export function PodiumPage() {
  const podium = usePodium();
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-[calc(-20vw-16px)] top-[122px] h-[420px] bg-[radial-gradient(closest-side,rgb(61_139_255/0.2),transparent)] lg:inset-x-[-20%] lg:top-[180px]"
      />
      <PageHeader
        className="relative"
        back={<BackLink to="/defi" label="Retour au défi" />}
        kicker={podium.kicker}
        title={podium.title}
      />
      <div className="relative mt-1 flex flex-col lg:max-w-[560px]">
        <Segmented
          label="Classer par"
          items={pageModes}
          value={podium.mode}
          onChange={podium.choose}
          className="[&_[data-slot=toggle-group-item]]:h-[38px]"
        />
        {!podium.ready ? (
          <Skeleton className="mt-[34px] h-[400px] rounded-card" />
        ) : podium.missingMmr ? (
          <p className="mt-[34px] text-sm text-muted-foreground">
            Il faut le MMR du mois de chaque joueur pour afficher le podium.
          </p>
        ) : (
          <PodiumSteps ranked={podium.ranked} me={podium.me} size="page" className="mt-[34px] h-[400px]" />
        )}
        {podium.ready && (
          <div className="mt-6 px-1">
            <p className="min-h-[52px] text-sm leading-[1.45] text-pretty text-soft">{podium.line}</p>
            <p className="text-xs text-muted-foreground">{podium.note}</p>
          </div>
        )}
      </div>
    </>
  );
}
