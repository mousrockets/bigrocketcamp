import { cn } from 'cn';
import { useState } from 'react';
import { dailyRecap, formatNumber, parisDay, pushupCredit } from '../../lib/domain';
import { useBoardState } from '../board/board-context';
import { lastPlaceRulesOf, shiftDay, weekStart } from '../board/model';
import { readStorage, writeStorage } from '../board/storage';
import { useClub } from '../club';
import { BackLink, Note, PageHeader } from '../components/club/page';
import { PlayerAvatar } from '../components/club/player-avatar';
import { Segmented } from '../components/club/segmented';
import { Skeleton } from '../components/ui/skeleton';
import { monthOf } from './challenge';

// The week's podium of effort since Monday, or the month's provisional MMR podium.

type Mode = 'effort' | 'mmr';
const modeItems: { value: Mode; label: string }[] = [
  { value: 'effort', label: 'Efforts' },
  { value: 'mmr', label: 'MMR 2v2' },
];
const heights = { 1: 'h-[200px]', 2: 'h-[140px]', 3: 'h-[90px]' } as Record<number, string>;

export function PodiumPage() {
  const { roster } = useClub();
  const { data, me } = useBoardState();
  const [mode, setMode] = useState<Mode>(() => (readStorage('rl-podium') === 'mmr' ? 'mmr' : 'effort'));
  const choose = (next: Mode) => {
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
  const debtor = [...weekly].sort((a, b) => b.generated - a.generated)[0];
  const month = data?.monthly?.current;
  const mmr = roster
    .map((name, index) => ({ name, index, mmr: month?.rows.find((row) => row.player === name)?.mmr ?? null }))
    .sort((a, b) => (b.mmr ?? -1) - (a.mmr ?? -1));
  const ranked =
    mode === 'mmr'
      ? mmr.map((p) => ({ name: p.name, index: p.index, value: p.mmr !== null ? formatNumber(p.mmr) : '—' }))
      : effort.map((p) => ({ name: p.name, index: p.index, value: formatNumber(p.effort) }));
  // Second, first, third: the winner stands in the middle.
  const steps = [ranked[1], ranked[0], ranked[2]].filter((step) => step !== undefined);
  const missingMmr = mode === 'mmr' && mmr.some((p) => p.mmr === null);
  const best = effort[0];
  const line =
    mode === 'mmr'
      ? mmr[0]?.mmr != null
        ? `${mmr[0].name} a le meilleur MMR 2v2 reçu ce mois.`
        : 'Les MMR du mois restent à relever.'
      : `${best && best.effort > 0 ? `${best.name} mène la semaine avec ${formatNumber(best.effort)} équivalents pompes.` : 'Personne n’a encore bougé cette semaine.'}${debtor && debtor.generated > 0 ? ` Le plus de pompes générées : ${debtor.name}, ${debtor.generated}.` : ''}`;

  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-[-20%] top-[180px] h-[420px] bg-[radial-gradient(closest-side,rgb(61_139_255/0.2),transparent)]"
      />
      <PageHeader
        className="relative"
        back={<BackLink to="/defi" label="Retour au défi" />}
        kicker={mode === 'mmr' ? `2v2 classé · ${month ? monthOf(month.month) : 'ce mois'}` : 'Depuis lundi'}
        title={mode === 'mmr' ? 'Le podium MMR' : 'Podium de la semaine'}
      />
      <div className="relative flex flex-col gap-6 lg:max-w-[560px]">
        <Segmented label="Classer par" items={modeItems} value={mode} onChange={choose} />
        {!data ? (
          <Skeleton className="h-[400px] rounded-card" />
        ) : missingMmr ? (
          <p className="text-sm text-muted-foreground">
            Il faut le MMR du mois de chaque joueur pour afficher le podium.
          </p>
        ) : (
          <ol aria-label="Podium" className="grid min-h-[400px] grid-cols-3 items-end gap-2">
            {steps.map((step) => {
              const rank = ranked.indexOf(step) + 1;
              return (
                <li key={step.name} className="flex min-w-0 flex-col items-center gap-2">
                  <PlayerAvatar
                    name={step.name}
                    me={step.name === me}
                    index={step.index}
                    className={rank === 1 ? 'size-14' : 'size-11'}
                  />
                  <b className="max-w-full truncate text-sm font-semibold">{step.name}</b>
                  <span className="font-numeral text-[30px] leading-none">{step.value}</span>
                  <div
                    className={cn(
                      'flex w-full origin-bottom animate-in justify-center rounded-t-xl pt-2.5 duration-700 slide-in-from-bottom-8 fade-in-0',
                      heights[rank],
                      rank === 1 ? 'bg-primary' : 'bg-secondary',
                    )}
                  >
                    <span
                      className={cn('font-numeral text-[40px] font-black', rank === 1 ? 'text-white' : 'text-faint')}
                    >
                      <span className="sr-only">Place </span>
                      {rank}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {data && (
          <div className="flex flex-col gap-3">
            <p className="text-sm leading-[1.45] text-pretty text-soft">{line}</p>
            <Note className="px-0">
              {mode === 'mmr'
                ? 'Classement provisoire : les boissons sont attribuées après la clôture.'
                : 'En équivalent pompes. Gainage et abdos comptent.'}
            </Note>
          </div>
        )}
      </div>
    </>
  );
}
