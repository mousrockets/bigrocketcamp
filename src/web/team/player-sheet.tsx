import { cn } from 'cn';
import { useState } from 'react';
import { formatNumber } from '../../lib/format';
import { useBoardState } from '../board';
import { InfoSheet } from '../components/info-sheet';
import { SegmentedControl } from '../components/segmented-control';
import { SoundCollection } from '../components/sound-badge';
import { Card } from '../components/ui/card';
import { type Career, careerOf } from './career';

type Scope = 'ranked' | 'tournament';

const scopes = [
  { value: 'ranked', label: 'Ranked' },
  { value: 'tournament', label: 'Tournoi' },
] as const satisfies readonly { value: Scope; label: string }[];

/**
 * The sheet of a player's card: what they did in the ranked matches the club received of them, and apart, in the
 * tournament ones.
 */
export function PlayerSheet({ name, onClose }: { name: string | null; onClose: () => void }) {
  const { board } = useBoardState();
  const [scope, setScope] = useState<Scope>('ranked');
  const career = board && name ? careerOf(board, name, scope) : null;
  const close = () => {
    setScope('ranked');
    onClose();
  };
  return (
    <InfoSheet
      open={name !== null}
      onClose={close}
      title={name ?? ''}
      description={scope === 'ranked' ? 'Ses stats en ranked.' : 'Ses stats en tournoi.'}
    >
      <SegmentedControl label="Matchs comptés" options={scopes} value={scope} onChange={setScope} />
      {career &&
        (career.matches === 0 ? (
          <p className="m-0 text-[15px] text-t2">
            {scope === 'ranked'
              ? 'Pas encore un match ranked au compteur. Le kickoff attend.'
              : 'Pas encore un tournoi au compteur. Le bracket attend.'}
          </p>
        ) : scope === 'ranked' ? (
          <RankedStats career={career} />
        ) : (
          <TournamentStats career={career} />
        ))}
      {name && <SoundCollection player={name} />}
    </InfoSheet>
  );
}

function Played({ career, label }: { career: Career; label: string }) {
  return (
    <section aria-label={label} className="flex items-end justify-between gap-3">
      <span className="flex flex-col gap-1.5">
        <span className="label-caps">{label}</span>
        <span className="text-[14px] text-t2">
          <span className="text-win">{formatNumber(career.wins)} W</span> ·{' '}
          <span className="text-cost-strong">{formatNumber(career.losses)} L</span> ·{' '}
          {Math.round((career.wins / career.matches) * 100)} % de victoires
        </span>
      </span>
      <b className="num text-[52px] [line-height:.8]">{formatNumber(career.matches)}</b>
    </section>
  );
}

function Tile({ label, value, tone, detail }: { label: string; value: number | null; tone?: string; detail?: string }) {
  return (
    <Card variant="tile">
      <b
        className={cn('num text-[30px] [line-height:.85]', value === null || (tone && value === 0) ? 'text-t3' : tone)}
      >
        {value === null ? '–' : formatNumber(value)}
      </b>
      <span className="label-caps text-[10px]">{label}</span>
      {detail && <span className="text-[12px] text-t3">{detail}</span>}
    </Card>
  );
}

function RankedStats({ career }: { career: Career }) {
  return (
    <>
      <Played career={career} label="Matchs ranked" />
      <section aria-label="Streaks" className="grid grid-cols-2 gap-2">
        <Tile label="Win streak max" value={career.winStreak} tone="text-win" />
        <Tile label="Lose streak max" value={career.lossStreak} tone="text-cost-strong" />
      </section>
      <section aria-label="Statistiques" className="grid grid-cols-2 gap-2">
        <Tile label="Buts" value={career.goals} />
        <Tile label="Passes D" value={career.assists} />
        <Tile label="Arrêts" value={career.saves} />
        <Tile label="MVP" value={career.mvps} />
        <Tile label="Démos" value={career.demos} />
        <Tile label="Poteaux" value={career.crossbarHits} />
      </section>
      {(career.demos === null || career.crossbarHits === null) && (
        <p className="m-0 text-[12px] text-t3">Démos et poteaux se comptent dès la mise à jour du collecteur.</p>
      )}
    </>
  );
}

/** « 1,5 / match »: one decimal is enough to compare. */
const perMatch = (total: number, matches: number) => `${formatNumber(Math.round((total / matches) * 10) / 10)} / match`;

function TournamentStats({ career }: { career: Career }) {
  return (
    <>
      <Played career={career} label="Matchs de tournoi" />
      <section aria-label="Palmarès" className="grid grid-cols-2 gap-2">
        <Tile label="Tournois gagnés" value={career.tournamentsWon} tone="text-win" />
        <Tile label="MVP" value={career.mvps} />
      </section>
      <section aria-label="Statistiques" className="grid grid-cols-3 gap-2">
        <Tile label="Buts" value={career.goals} detail={perMatch(career.goals, career.matches)} />
        <Tile label="Passes D" value={career.assists} detail={perMatch(career.assists, career.matches)} />
        <Tile label="Arrêts" value={career.saves} detail={perMatch(career.saves, career.matches)} />
      </section>
    </>
  );
}
