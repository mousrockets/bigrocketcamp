import { cn } from 'cn';
import { useState } from 'react';
import { formatNumber } from '../../lib/format';
import { useBoardState } from '../board';
import { InfoSheet } from '../components/info-sheet';
import { SegmentedControl } from '../components/segmented-control';
import { SoundCollection } from '../components/sound-badge';
import { Card } from '../components/ui/card';
import { type Career, type CareerAccount, type CareerScope, careerOf, soloAccountOf } from './career';

type Scope = Exclude<CareerScope, 'ranked'>;

const scopes = [
  { value: 'all', label: 'Tout' },
  { value: 'duel', label: '1v1' },
  { value: 'doubles', label: '2v2' },
  { value: 'standard', label: '3v3' },
  { value: 'tournament', label: 'Tournoi' },
] as const satisfies readonly { value: Scope; label: string }[];

const accounts = [
  { value: 'all', label: 'Tout' },
  { value: 'solo', label: 'Solo' },
  { value: 'duo', label: 'Duo' },
] as const satisfies readonly { value: CareerAccount; label: string }[];

/** How the sheet names the matches of each view. */
const views: Record<Scope, { played: string; description: string; empty: string }> = {
  all: {
    played: 'Matchs joués',
    description: 'tous modes confondus',
    empty: 'Pas encore un match au compteur. Le kickoff attend.',
  },
  duel: {
    played: 'Matchs ranked 1v1',
    description: 'en ranked 1v1',
    empty: 'Pas encore un 1v1 ranked au compteur. Personne à qui faire la passe.',
  },
  doubles: {
    played: 'Matchs ranked 2v2',
    description: 'en ranked 2v2',
    empty: 'Pas encore un 2v2 ranked au compteur. Le kickoff attend.',
  },
  standard: {
    played: 'Matchs ranked 3v3',
    description: 'en ranked 3v3',
    empty: 'Pas encore un 3v3 ranked au compteur. Faut trouver deux potes.',
  },
  tournament: {
    played: 'Matchs de tournoi',
    description: 'en tournoi',
    empty: 'Pas encore un tournoi au compteur. Le bracket attend.',
  },
};

const onAccount: Record<CareerAccount, string> = {
  all: '',
  solo: ', sur son compte solo',
  duo: ', sur son compte duo',
};

/**
 * The sheet of a player's card: what they did in the matches the club received of them, every mode together or one
 * at a time (each ranked playlist, the tournaments), on both their accounts or on one.
 */
export function PlayerSheet({ name, onClose }: { name: string | null; onClose: () => void }) {
  const { board } = useBoardState();
  const [scope, setScope] = useState<Scope>('all');
  const [chosenAccount, setAccount] = useState<CareerAccount>('all');
  // Without a solo account found, every match is on the duo one: no choice to make.
  const hasSolo = board && name ? soloAccountOf(board, name) !== null : false;
  const account = hasSolo ? chosenAccount : 'all';
  const career = board && name ? careerOf(board, name, scope, account) : null;
  const view = views[scope];
  const close = () => {
    setScope('all');
    setAccount('all');
    onClose();
  };
  return (
    <InfoSheet
      open={name !== null}
      onClose={close}
      title={name ?? ''}
      description={`Ses stats ${view.description}${onAccount[account]}.`}
    >
      <div className="flex flex-col gap-2">
        {hasSolo && <SegmentedControl label="Compte" options={accounts} value={account} onChange={setAccount} />}
        <SegmentedControl label="Mode" options={scopes} value={scope} onChange={setScope} />
      </div>
      {career &&
        (career.matches === 0 ? (
          <p className="m-0 text-[15px] text-t2">{view.empty}</p>
        ) : scope === 'tournament' ? (
          <TournamentStats career={career} />
        ) : (
          <MatchStats career={career} label={view.played} />
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

function MatchStats({ career, label }: { career: Career; label: string }) {
  return (
    <>
      <Played career={career} label={label} />
      <section aria-label="Streaks" className="grid grid-cols-2 gap-2">
        <Tile label="Win streak max" value={career.winStreak} tone="text-win" />
        <Tile label="Lose streak max" value={career.lossStreak} tone="text-cost-strong" />
      </section>
      <section aria-label="Statistiques" className="grid grid-cols-2 gap-2">
        <Tile label="Buts" value={career.goals} />
        <Tile label="Assists" value={career.assists} />
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
        <Tile label="Assists" value={career.assists} detail={perMatch(career.assists, career.matches)} />
        <Tile label="Arrêts" value={career.saves} detail={perMatch(career.saves, career.matches)} />
      </section>
    </>
  );
}
