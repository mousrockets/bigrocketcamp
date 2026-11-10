import { formatNumber } from '../../lib/format';
import { useBoardState } from '../board';
import { InfoSheet } from '../components/info-sheet';
import { Card } from '../components/ui/card';
import { careerOf } from './career';

/** The sheet of a player's card: every match the club received of them, and what they did in it. */
export function PlayerSheet({ name, onClose }: { name: string | null; onClose: () => void }) {
  const { board } = useBoardState();
  const career = board && name ? careerOf(board, name) : null;
  return (
    <InfoSheet
      open={name !== null}
      onClose={onClose}
      title={name ?? ''}
      description="Ses stats, tous matchs confondus."
    >
      {career &&
        (career.matches === 0 ? (
          <p className="m-0 text-[15px] text-t2">Pas encore un match au compteur. Le kickoff attend.</p>
        ) : (
          <>
            <section aria-label="Matchs joués" className="flex items-end justify-between gap-3">
              <span className="flex flex-col gap-1.5">
                <span className="label-caps">Matchs joués</span>
                <span className="text-[14px] text-t2">
                  <span className="text-win">{formatNumber(career.wins)} W</span> ·{' '}
                  <span className="text-cost-strong">{formatNumber(career.losses)} L</span> ·{' '}
                  {Math.round((career.wins / career.matches) * 100)} % de victoires
                </span>
              </span>
              <b className="num text-[52px] [line-height:.8]">{formatNumber(career.matches)}</b>
            </section>
            <section aria-label="Statistiques" className="grid grid-cols-2 gap-2">
              {(
                [
                  ['Buts', career.goals],
                  ['Passes D', career.assists],
                  ['Arrêts', career.saves],
                  ['MVP', career.mvps],
                ] as const
              ).map(([label, value]) => (
                <Card key={label} variant="tile">
                  <b className="num text-[30px] [line-height:.85]">{formatNumber(value)}</b>
                  <span className="label-caps text-[10px]">{label}</span>
                </Card>
              ))}
            </section>
          </>
        ))}
    </InfoSheet>
  );
}
