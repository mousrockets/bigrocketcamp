import { useMutation } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { defeatMessage } from '../../lib/defeat-message';
import { lastPlaceBonus, matchIndex, parisDay } from '../../lib/domain';
import { useBoard } from '../board-client';
import { useClub } from '../club';
import { closeIsDue } from '../monthly-mmr';
import { closeDueMonths } from '../writes';
import { badgeRules } from './badges';
import { playJingle, speak, vibrate } from './feedback';
import { lastPlaceRulesOf, statsOf, streaksOf } from './model';
import { readStorage, writeStorage } from './storage';
import type { BoardState, Result } from './types';

// One board for the whole app: every page reads it, and it stays up to date while the app is visible.

interface BoardValue {
  data: BoardState | null;
  error: string;
  /** Reads what changed now, after the member's own action. */
  refresh: () => Promise<BoardState | null>;
  /** The signed-in member's player, "TOI" on every screen. */
  me: string | null;
}

const BoardContext = createContext<BoardValue | null>(null);

export function useBoardState(): BoardValue {
  const value = useContext(BoardContext);
  if (!value) throw new Error('useBoardState needs the BoardProvider.');
  return value;
}

const isLossIn = (roster: readonly string[]) => (r: Result) =>
  r.kind === 'match' && !r.review_required && r.team !== r.winner && roster.includes(r.name);

/** Announces new defeats and newly earned badges, compared with what this device has already seen. */
function useAnnouncements(roster: readonly string[], data: BoardState | null) {
  const seenLosses = useRef<Set<string> | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new board can bring a new defeat or badge.
  useEffect(() => {
    if (!data) return;
    const losses = data.results.filter(isLossIn(roster));
    const keys = losses.map((r) => `${r.match_guid}:${r.player_id}`);
    const seen = seenLosses.current;
    if (seen) {
      const fresh = losses.filter((_, index) => !seen.has(keys[index] ?? ''));
      if (fresh.length) {
        const matches = matchIndex(data.results, data.matchRosters || []);
        const message = defeatMessage(
          fresh.map((r) => ({
            player: r.name,
            pushups: 5 + lastPlaceBonus(r, matches, roster, lastPlaceRulesOf(data)),
          })),
        );
        toast(message, { classNames: { toast: 'border-cost/40!' } });
        playJingle('loss');
        speak(message, 700);
        vibrate([30, 60, 30]);
      }
    }
    seenLosses.current = new Set(keys);

    const streaks = streaksOf(roster, data, parisDay());
    const earned = statsOf(roster, data).flatMap((stats) =>
      badgeRules
        .filter((rule) => rule.earned(stats, streaks.get(stats.name) ?? { current: 0, best: 0 }))
        .map((badge) => ({ key: `${stats.name}:${badge.id}`, player: stats.name, badge })),
    );
    const stored = readStorage('rl-badges');
    if (stored !== null) {
      const known = new Set<string>(JSON.parse(stored));
      const unlocked = earned.find((entry) => !known.has(entry.key));
      if (unlocked) {
        toast.success(`Badge débloqué : ${unlocked.badge.emoji} ${unlocked.badge.label} pour ${unlocked.player}`);
        playJingle('badge');
      }
    }
    writeStorage('rl-badges', JSON.stringify(earned.map((entry) => entry.key)));
  }, [data]);
}

/** Asks the API to close a finished month while the app is open, as soon as one is due. */
function useMonthClosing(data: BoardState | null, refresh: () => Promise<unknown>) {
  const latest = useRef(data);
  latest.current = data;
  const closeMonths = useMutation({ mutationFn: closeDueMonths }).mutateAsync;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the polling must not restart on every refresh.
  useEffect(() => {
    let active = true;
    let running = false;
    const closeDue = async () => {
      const monthly = latest.current?.monthly;
      if (!active || running || document.hidden || !monthly || !closeIsDue(monthly)) return;
      running = true;
      try {
        if ((await closeMonths()) && active) await refresh();
      } catch {
        // The next tick retries; the server also closes the month.
      } finally {
        running = false;
      }
    };
    closeDue();
    const timer = setInterval(closeDue, 60_000);
    document.addEventListener('visibilitychange', closeDue);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', closeDue);
    };
  }, []);
}

export function BoardProvider({ children }: { children: ReactNode }) {
  const { roster, me: profile } = useClub();
  const [data, setData] = useState<BoardState | null>(null);
  const [error, setError] = useState('');
  const refresh = useBoard<BoardState>(roster, setData, setError);
  useAnnouncements(roster, data);
  useMonthClosing(data, refresh);
  const me = profile.duoPseudo && roster.includes(profile.duoPseudo) ? profile.duoPseudo : (data?.me ?? null);
  return <BoardContext value={{ data, error, refresh, me }}>{children}</BoardContext>;
}
