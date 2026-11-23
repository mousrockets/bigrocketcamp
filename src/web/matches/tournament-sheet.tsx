import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { tournamentWinPushups } from '../../lib/domain';
import { formatNumber } from '../../lib/format';
import { networkError } from '../api';
import { useBoardState } from '../board';
import { InfoSheet } from '../components/info-sheet';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { changeTournamentWin } from '../writes';
import type { ReplayMatch } from './timeline';

/**
 * Declares, on its last match, a tournament the club won: the game never tells. Each club player who won that match
 * dodges 50 pushups; a declaration made by mistake is taken back the same way.
 */
export function TournamentSheet({ match, onClose }: { match: ReplayMatch | null; onClose: () => void }) {
  const { refresh } = useBoardState();
  const change = useMutation({ mutationFn: changeTournamentWin });
  const won = match?.tournament === 'won';
  const winners = match?.players.filter((player) => player.won) ?? [];
  const pushups = formatNumber(tournamentWinPushups);

  async function send() {
    if (!match) return;
    try {
      await change.mutateAsync({ matchGuid: match.guid, won: !won });
    } catch (error) {
      toast.error(networkError(error));
      return;
    }
    await refresh();
    toast(won ? 'Tournoi annulé. Les pompes reviennent.' : `GG ! ${pushups} pompes de moins pour les champions.`);
    onClose();
  }

  return (
    <InfoSheet
      open={match !== null && match.tournament !== null}
      onClose={onClose}
      title={won ? 'Tournoi gagné' : 'Tournoi gagné ?'}
      description={
        won
          ? 'Ce match a fini le tournoi. Respect.'
          : 'C’était la finale ? Les vainqueurs du club esquivent leurs pompes.'
      }
    >
      <Card variant="glass" className="gap-0 py-0">
        <ul className="m-0 list-none p-0">
          {winners.map((player) => (
            <li
              key={player.name}
              className="flex items-center justify-between gap-3 px-4 py-3 not-first:border-line not-first:border-t-[.5px]"
            >
              <b className="truncate font-semibold text-[15px]">{player.account}</b>
              <b className="num shrink-0 text-[16px] text-win">−{pushups}</b>
            </li>
          ))}
        </ul>
      </Card>
      {won ? (
        <Button variant="pill-danger" size="pill" className="self-center" disabled={change.isPending} onClick={send}>
          Ce n’était pas la finale
        </Button>
      ) : (
        <Button variant="cta" size="cta" disabled={change.isPending} onClick={send}>
          On a gagné le tournoi !
        </Button>
      )}
    </InfoSheet>
  );
}
