import { Link } from '@tanstack/react-router';
import { cn } from 'cn';
import { useRef, useState } from 'react';
import { formatDayMonth } from '../../lib/format';
import { InfoSheet } from '../components/info-sheet';
import { mineClass, Place } from '../components/ranking-place';
import { Card } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { type ComparedPlayer, keyStats, type ProsSlug, type Stat } from './comparison';
import { closestPro, firstPro, type Pro, proAverage, pros, prosReadOn } from './pros';
import { formatted, gapOf, PlayerName } from './stat-parts';
import { rankRgb } from './stats';

/** Whom the member measures against: one pro, or all of them on average. */
const average = 'moyenne';
const targets = [
  { value: average, label: 'La moyenne des pros' },
  ...pros.map((pro) => ({ value: pro.name, label: pro.name })),
];

/** When and where the figures were read, which every view of them says. */
export const prosSource = `Ranked 2v2, relevé sur RL Tracker le ${formatDayMonth(prosReadOn)} ${prosReadOn.slice(0, 4)}. Ces chiffres ne bougent plus.`;

interface Line {
  key: string;
  value: number;
  player?: ComparedPlayer;
  pro?: Pro;
}

/**
 * « Face aux pros », opened from a key figure: the member's figure against a pro's, Zen's first, what it takes to
 * reach it, then the club and the pros in one ranking. The pros play Ranked 2v2: with other modes chosen, the sheet
 * says so and offers the 2v2 alone.
 */
export function ProsSheet({
  slug,
  players,
  onlyDoubles,
  onClose,
}: {
  slug: ProsSlug | undefined;
  players: ComparedPlayer[];
  onlyDoubles: boolean;
  onClose: () => void;
}) {
  // The sheet keeps its stat while it closes, so that it does not empty on its way out.
  const last = useRef(slug);
  if (slug) last.current = slug;
  const stat = keyStats.find((key) => key.pros?.slug === last.current);
  const [target, setTarget] = useState(firstPro);
  return (
    <InfoSheet
      open={slug !== undefined}
      onClose={onClose}
      title="Face aux pros"
      description={stat ? `${stat.label}, toi contre l’élite du 2v2.` : ''}
    >
      {stat?.pros && (
        <ProsComparison
          stat={stat}
          figure={stat.pros.figure}
          players={players}
          onlyDoubles={onlyDoubles}
          target={target}
          onTarget={setTarget}
        />
      )}
    </InfoSheet>
  );
}

function ProsComparison({
  stat,
  figure,
  players,
  onlyDoubles,
  target,
  onTarget,
}: {
  stat: Stat;
  figure: (pro: Pro) => number;
  players: ComparedPlayer[];
  onlyDoubles: boolean;
  target: string;
  onTarget: (target: string) => void;
}) {
  const me = players.find((player) => player.me);
  const mine = me ? stat.value(me) : null;
  const chosen = pros.find((pro) => pro.name === target);
  const theirs = chosen ? figure(chosen) : proAverage(figure);
  const who = chosen ? chosen.name : 'la moyenne des pros';
  return (
    <>
      {!onlyDoubles && (
        <p className="m-0 text-[14px] text-t2">
          Tes chiffres mélangent d’autres modes que le 2v2 ranked des pros.{' '}
          <Link to="." search={(previous) => ({ ...previous, mode: '2v2' })} resetScroll={false} className="text-link">
            Voir le 2v2 seul
          </Link>
        </p>
      )}
      <Card variant="tile" className="grid grid-cols-2 gap-4 p-5">
        <span className="flex min-w-0 flex-col gap-2">
          <span className="label-caps flex h-5 items-center">Toi</span>
          <b className={cn('num text-[40px] [line-height:.85]', mine === null && 'text-t3')}>
            {formatted(mine, stat.format)}
          </b>
        </span>
        <span className="flex min-w-0 flex-col gap-2">
          <Select items={targets} value={target} onValueChange={(value) => value !== null && onTarget(value)}>
            <SelectTrigger
              aria-label="Pro comparé"
              className="label-caps h-5 w-fit max-w-full border-0 bg-transparent p-0 text-medal-1 dark:bg-transparent dark:hover:bg-transparent"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {targets.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <b className="num text-[40px] text-medal-1 [line-height:.85]">{formatted(theirs, stat.format)}</b>
        </span>
        <p className="col-span-2 m-0 text-[15px] text-t1">{verdict(stat, mine, theirs, who, figure)}</p>
      </Card>
      <section aria-label="Le classement" className="flex flex-col gap-2">
        <span className="label-caps px-1">Le club au milieu des pros</span>
        <Card variant="glass" className="gap-0 p-4">
          <Ranking stat={stat} figure={figure} players={players} target={chosen?.name} />
        </Card>
      </section>
      <p className="m-0 px-1 text-[11px] text-t3 [line-height:1.5]">{prosSource}</p>
    </>
  );
}

/** What it takes to reach the pro, or a bow when the member is past them, then the pro closest to the member. */
function verdict(stat: Stat, mine: number | null, theirs: number, who: string, figure: (pro: Pro) => number): string {
  if (mine === null) return 'Pas encore de chiffre pour toi ici. Joue, et on compare.';
  const twin = closestPro(mine, figure);
  const closest = `Le pro le plus proche de toi : ${twin.name}, à ${formatted(figure(twin), stat.format)}.`;
  if (mine >= theirs) return `Tu fais mieux que ${who}. Capture d’écran, vite. ${closest}`;
  return `Il te manque ${gapOf(theirs, mine, stat.format)} pour égaler ${who}. ${closest}`;
}

/** The club's players and the pros in one ranking, the best first: the member in their capsule, the pro chosen in gold. */
function Ranking({
  stat,
  figure,
  players,
  target,
}: {
  stat: Stat;
  figure: (pro: Pro) => number;
  players: ComparedPlayer[];
  target: string | undefined;
}) {
  const lines: Line[] = [
    ...pros.map((pro) => ({ key: `pro-${pro.name}`, value: figure(pro), pro })),
    ...players.flatMap((player) => {
      const value = stat.value(player);
      return value === null ? [] : [{ key: `club-${player.name}`, value, player }];
    }),
  ].sort((a, b) => b.value - a.value);
  const top = Math.max(...lines.map((line) => line.value), 0);
  return (
    <ol className="m-0 flex list-none flex-col gap-1 p-0">
      {lines.map((line, index) => {
        const mine = line.player?.me ?? false;
        const gold = line.pro !== undefined && line.pro.name === target;
        return (
          <li
            key={line.key}
            className={cn('grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 py-1', mine && mineClass)}
          >
            <Place place={index + 1} mine={mine} />
            <span className="flex min-w-0 flex-col gap-1">
              <span
                className={cn(
                  'flex items-baseline justify-between gap-3',
                  mine ? 'text-[15px] text-t1' : 'text-[13px]',
                  line.pro ? (gold ? 'text-medal-1' : 'text-t3') : !mine && 'text-t2',
                )}
              >
                {line.player ? (
                  <span className="flex min-w-0 items-center gap-2">
                    <i
                      aria-hidden="true"
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: `rgb(${rankRgb(line.player.tier)})` }}
                    />
                    <PlayerName player={line.player} className={cn(mine && 'font-semibold')} />
                  </span>
                ) : (
                  <span className={cn('truncate', gold && 'font-semibold')}>{line.pro?.name}</span>
                )}
                <span className={cn('num', mine ? 'text-[17px]' : 'text-[15px]')}>
                  {formatted(line.value, stat.format)}
                </span>
              </span>
              <span aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-white/6">
                <i
                  className={cn(
                    'block h-full origin-left animate-grow rounded-full',
                    mine ? 'bg-t1' : gold ? 'bg-medal-1' : line.pro ? 'bg-white/20' : 'bg-white/45',
                  )}
                  style={{ width: `${top === 0 ? 0 : (line.value / top) * 100}%` }}
                />
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
