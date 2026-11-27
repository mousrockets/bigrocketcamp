import { useMutation } from '@tanstack/react-query';
import { cn } from 'cn';
import { Square, Zap } from 'lucide-react';
import { type CSSProperties, useState } from 'react';
import type { PlaySession } from '../../lib/contract';
import { formatAge, formatNumber, formatSigned } from '../../lib/format';
import { type Board, useBoardState } from '../board';
import { type Club, useClub } from '../club';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { useNow } from '../hooks/use-now';
import { highestTier, latest, rankLightRgb, rankRgb } from '../team/stats';
import { playSessionAction } from '../writes';

// The play sessions, in Matchs, above the last session: the member starts one when they play, above all where no
// collector sees their matches, and the rank source then reads every account of theirs, duo and solo, every two
// minutes. The whole club sees each session live; the goal shown is each account's peak all time.

/** One account of a player in session: its rating as last read, its best ever, and its rating when it started. */
interface SessionAccount {
  kind: 'Duo' | 'Solo';
  mmr: number | null;
  best: number | null;
  /** The rank of the best: the colour of its figure. */
  bestTier: number | null;
  start: number | null;
}

/** What a session shows of a player. */
interface SessionPlayer {
  name: string;
  /** Their highest rank's tier: the colour of their session. */
  tier: number | null;
  me: boolean;
  /** Their session under way, if any. */
  session: PlaySession | null;
  /** Their solo account first, when the rank source found it, then their duo one. */
  accounts: SessionAccount[];
  /** When one of their accounts was last read; null when never. */
  readAt: string | null;
  /** They play on a computer, where the collector sees every match. */
  pc: boolean;
}

/** A session's length so far: « 12:04 », or « 1:12:04 » past an hour. */
function elapsed(startedAt: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  const [hours, minutes, rest] = [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60];
  const two = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${two(minutes)}:${two(rest)}` : `${minutes}:${two(rest)}`;
}

/** Every player's play session, as the board tells it at `now`: a session past its end is over. */
function sessionPlayers(board: Board, club: Club, now: number): SessionPlayer[] {
  return club.roster.map((name) => {
    const duo = board.doublesRanks?.find((rank) => rank.player === name) ?? null;
    const solo = duo?.solo ?? null;
    const soloRead = solo?.playerId && solo.status !== 'not_found' && solo.status !== 'needs_player_id';
    const session =
      board.playSessions.find((candidate) => candidate.player === name && Date.parse(candidate.endsAt) > now) ?? null;
    const duoAccount: SessionAccount = {
      kind: 'Duo',
      mmr: duo?.mmr ?? null,
      best: duo?.best ?? null,
      bestTier: duo?.bestRank?.tier ?? null,
      start: session?.startDuoMmr ?? null,
    };
    const accounts: SessionAccount[] = soloRead
      ? [
          {
            kind: 'Solo',
            mmr: solo.mmr,
            best: solo.best,
            bestTier: solo.bestRank?.tier ?? null,
            start: session?.startSoloMmr ?? null,
          },
          duoAccount,
        ]
      : [duoAccount];
    return {
      name,
      tier: highestTier(duo?.tier, soloRead ? solo.tier : null),
      me: name === club.me.duoPseudo,
      session,
      accounts,
      readAt: latest(duo?.fetchedAt, soloRead ? solo.fetchedAt : null),
      pc: club.players.some((player) => player.slot === name && player.platform === 'pc'),
    };
  });
}

/** The sessions going on, the member's first, then the member's way into theirs while none runs. */
export function PlaySessions({ board }: { board: Board }) {
  const club = useClub();
  // A session ends on its own: checked every half minute.
  const now = useNow(30_000);
  const players = sessionPlayers(board, club, now);
  const live = [...players.filter((player) => player.me), ...players.filter((player) => !player.me)].filter(
    (player) => player.session !== null,
  );
  const me = players.find((player) => player.me);
  return (
    <section aria-label="Sessions de jeu" className="flex flex-col gap-3 px-5 pt-8 lg:p-0">
      {live.length > 0 && (
        <div className="flex flex-col gap-3">
          {live.map((player) => (
            <LiveSession key={player.name} player={player} session={player.session as PlaySession} />
          ))}
        </div>
      )}
      {me && !me.session && <PlaySessionStart player={me} />}
    </section>
  );
}

function useSessionAction() {
  const { refresh } = useBoardState();
  return useMutation({
    mutationFn: playSessionAction,
    onSuccess: async (session) => {
      // A short buzz on a phone: the session is on.
      if (session) navigator.vibrate?.(24);
      await refresh();
    },
  });
}

/** The member's way into a session. */
function PlaySessionStart({ player }: { player: SessionPlayer }) {
  const action = useSessionAction();
  const [askPc, setAskPc] = useState(false);
  const start = () => action.mutate('start');
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="cta"
        size="cta"
        disabled={action.isPending}
        onClick={() => (player.pc ? setAskPc(true) : start())}
      >
        <Zap fill="currentColor" />
        {action.isPending ? 'Lancement…' : 'Lancer une session'}
      </Button>
      {action.error && <span className="text-[13px] text-destructive">{action.error.message}</span>}
      <AlertDialog open={askPc} onOpenChange={setAskPc}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Le collecteur fait mieux</AlertDialogTitle>
            <AlertDialogDescription>
              Sur PC, ouvre le collecteur : il voit chaque match et déclenche les relevés tout seul. Tu joues sans lui
              {'\u00a0'}? Lance la session quand même.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>J’ouvre le collecteur</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setAskPc(false);
                start();
              }}
            >
              Lancer quand même
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * A session under way: live, its length ticking, then each account of the player, its rating with what the session won
 * or lost, and how far its peak all time is, until it falls.
 */
function LiveSession({ player, session }: { player: SessionPlayer; session: PlaySession }) {
  const now = useNow(1000);
  const action = useSessionAction();
  const both = player.accounts.length > 1;
  return (
    <section
      aria-label={`Session de ${player.name}`}
      style={{ '--rank': rankRgb(player.tier), '--rank-light': rankLightRgb(player.tier) } as CSSProperties}
      className="session-panel relative flex flex-col gap-3 overflow-hidden rounded-[18px] p-3.5"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="label-caps flex items-center gap-2 text-destructive">
          <i aria-hidden="true" className="size-[7px] animate-live-ring rounded-full bg-destructive" />
          En session
        </span>
        <span className="num text-[15px] text-t1">{elapsed(session.startedAt, now)}</span>
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <b className="truncate font-semibold text-[15px]">{player.name}</b>
        {player.me && <Badge variant="tag">TOI</Badge>}
      </span>
      <ul className="m-0 flex list-none flex-col p-0">
        {player.accounts.map((account) => (
          <AccountProgress key={account.kind} account={account} player={player} />
        ))}
      </ul>
      <span className="flex items-center justify-between gap-2 text-[11px] text-t3">
        <span>{player.readAt ? `Relevé ${formatAge(player.readAt, now)}` : 'Premier relevé dans 2 min'}</span>
        {player.me && (
          <Button variant="pill" size="pill" disabled={action.isPending} onClick={() => action.mutate('stop')}>
            <Square fill="currentColor" />
            Terminer
          </Button>
        )}
      </span>
      {player.me && (
        <span className="border-line border-t-[.5px] pt-2.5 text-[11px] text-t3 text-pretty [line-height:1.45]">
          {both
            ? 'Pendant que tu joues, tes comptes solo et duo sont relevés toutes les 2 min'
            : 'Pendant que tu joues, ton compte est relevé toutes les 2 min'}
          {' : aucun peak ne t’échappe. La session s’arrête seule si ton MMR ne bouge plus pendant 30 min.'}
        </span>
      )}
    </section>
  );
}

/** One account in session: its rating, what the session won or lost, and the way to its peak all time. */
function AccountProgress({ account, player }: { account: SessionAccount; player: SessionPlayer }) {
  const { kind, mmr, best, bestTier, start } = account;
  const won = mmr !== null && start !== null ? mmr - start : null;
  const beaten = mmr !== null && best !== null && mmr >= best;
  const from = start ?? mmr;
  const toPeak =
    mmr !== null && best !== null && from !== null && best > from
      ? Math.min(100, Math.max(0, ((mmr - from) / (best - from)) * 100))
      : 0;
  const owner = player.me ? 'ton' : 'son';
  // The way to the peak reads in the colour of the peak's rank, as on the season's podium.
  const peakColour = { color: `rgb(${rankLightRgb(bestTier)})` };
  return (
    <li className="flex flex-col gap-1.5 py-2.5 first:pt-0 [&+&]:border-line [&+&]:border-t-[.5px]">
      <span className="flex items-baseline gap-2">
        <span className="label-caps w-9 shrink-0">{kind}</span>
        <b className="num text-[26px] [line-height:.9]">{mmr === null ? '–' : formatNumber(mmr)}</b>
        <span className="text-[12px] text-t3">MMR</span>
        {won !== null && won !== 0 && (
          <b className={cn('num ml-auto text-[18px]', won > 0 ? 'text-win' : 'text-t2')}>
            {formatSigned(won)}
            <span className="sr-only"> en {kind.toLowerCase()} depuis le début de la session</span>
          </b>
        )}
      </span>
      {best !== null && mmr !== null && (
        <span className="flex flex-col gap-1.5 pl-11">
          <span className={cn('text-[12px]', beaten ? 'font-semibold text-medal-1' : 'text-t2')}>
            {beaten ? (
              'Peak all time battu : '
            ) : (
              <>
                Encore{' '}
                <b className="num text-[14px]" style={peakColour}>
                  {formatNumber(best - mmr)}
                </b>{' '}
                MMR pour {owner} peak ·{' '}
              </>
            )}
            <b className="num text-[14px]" style={peakColour}>
              {formatNumber(best)}
            </b>
            {beaten && '. GG !'}
          </span>
          {!beaten && (
            <Progress
              value={toPeak}
              aria-label={`Vers le peak ${kind.toLowerCase()} de ${player.name}`}
              className="[&_[data-slot=progress-indicator]]:bg-medal-1 [&_[data-slot=progress-track]]:h-1.5 [&_[data-slot=progress-track]]:bg-white/8"
            />
          )}
        </span>
      )}
    </li>
  );
}
