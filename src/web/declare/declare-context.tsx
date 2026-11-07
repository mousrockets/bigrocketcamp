import { useMutation } from '@tanstack/react-query';
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { exerciseDescription, exerciseEffect, exerciseTypes, parisDay, validateExercise } from '../../lib/domain';
import { useBoardState } from '../board/board-context';
import { playJingle, speak, vibrate } from '../board/feedback';
import { savedLine, statsOf } from '../board/model';
import { readStorage, removeStorage, writeStorage } from '../board/storage';
import type { Declaration, ExerciseType } from '../board/types';
import { useClub } from '../club';
import { loadedCommit, useDeployedVersion } from '../version';
import { declareExercise, undoExercise } from '../writes';
import { Celebration, type CelebrationData } from './celebration';
import { DeclareSheet } from './declare-sheet';

// Declaring an exercise, from anywhere in the app: the sheet, the celebration, the undo, and the reload to a
// newer version, which never loses what the member is typing or sending.

export interface DeclareForm {
  player: string;
  type: ExerciseType;
  /** Repetitions, or minutes for the plank. */
  count: number;
}

interface DeclareValue {
  openDeclare: (player?: string) => void;
  /** Cancels one of the member's own series, asking first when `ask`. */
  undo: (exercise: Declaration, ask: boolean) => Promise<void>;
}

const DeclareContext = createContext<DeclareValue | null>(null);

export function useDeclare(): DeclareValue {
  const value = useContext(DeclareContext);
  if (!value) throw new Error('useDeclare needs the DeclareProvider.');
  return value;
}

const UNDO_DELAY_MS = 10_000;
// How long a visible page must stay untouched before it reloads to a newer version.
const idleBeforeReload = 30_000;
const pendingKey = 'rl-pending';
// The sheet survives a reload to a newer version: sessionStorage lasts as long as the tab.
const draftKey = 'rl-draft';
type Draft = DeclareForm & { playerTouched: boolean; open: boolean };

const defaultCount = (type: ExerciseType) => (type === 'plank' ? 1 : type === 'crunches' ? 20 : 15);

function saveDraft(draft: Draft) {
  try {
    sessionStorage.setItem(draftKey, JSON.stringify(draft));
  } catch {
    // Without storage, the reload starts from a fresh sheet.
  }
}

function takeDraft(roster: readonly string[]): Draft | null {
  try {
    const stored = sessionStorage.getItem(draftKey);
    sessionStorage.removeItem(draftKey);
    const draft = stored ? (JSON.parse(stored) as Partial<Draft>) : null;
    if (!draft || !roster.includes(draft.player ?? '') || !exerciseTypes.includes(draft.type as ExerciseType)) {
      return null;
    }
    return {
      player: draft.player as string,
      type: draft.type as ExerciseType,
      count: typeof draft.count === 'number' ? draft.count : Number.NaN,
      playerTouched: draft.playerTouched === true,
      open: draft.open === true,
    };
  } catch {
    return null;
  }
}

const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function DeclareProvider({ children }: { children: ReactNode }) {
  const { roster } = useClub();
  const { data, refresh, me } = useBoardState();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<DeclareForm>({ player: me ?? roster[0] ?? '', type: 'pushups', count: 15 });
  const [pending, setPending] = useState<Declaration | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [celebration, setCelebration] = useState<CelebrationData | null>(null);
  const [undoable, setUndoable] = useState<Declaration | null>(null);
  const submissionInFlight = useRef(false);
  const playerTouched = useRef(false);
  const sendExercise = useMutation({ mutationFn: declareExercise }).mutateAsync;
  const cancelExercise = useMutation({ mutationFn: undoExercise }).mutateAsync;

  const draft = useRef<Draft | null>(null);
  draft.current = { ...form, playerTouched: playerTouched.current, open };
  const reloadKeeping = () => {
    if (draft.current) saveDraft(draft.current);
    location.reload();
  };

  // Restores a sheet kept across a reload, or a declaration that never reached the server.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once, on the first render.
  useEffect(() => {
    const kept = takeDraft(roster);
    if (kept) {
      setForm({ player: kept.player, type: kept.type, count: kept.count });
      playerTouched.current = kept.playerTouched;
      setOpen(kept.open);
    }
    try {
      const stored = readStorage(pendingKey);
      if (stored) {
        const restored = validateExercise(roster, JSON.parse(stored)) as Declaration;
        setPending(restored);
        setForm({
          player: restored.player,
          type: restored.type,
          count: restored.type === 'plank' ? restored.count / 60 : restored.count,
        });
        playerTouched.current = true;
        setOpen(true);
      }
    } catch {
      // An invalid stored declaration is ignored: the server could never accept it.
    }
  }, []);

  // The member's own player, once known, unless they picked another one.
  useEffect(() => {
    if (me && !playerTouched.current && !pending) setForm((current) => ({ ...current, player: me }));
  }, [me, pending]);

  // An installed app can stay open for days: reload after a long pause to run the latest published version.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKeeping reads refs only.
  useEffect(() => {
    let hiddenAt = 0;
    const onVisible = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        return;
      }
      if (isStandalone() && hiddenAt && Date.now() - hiddenAt > 300_000 && !submissionInFlight.current) {
        reloadKeeping();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // A newer version answers: reload once the page is hidden, or untouched for 30 s, keeping the sheet as it is.
  // A declaration being sent, still undoable or being celebrated holds the page.
  const deployed = useDeployedVersion();
  const outdated = deployed !== null && deployed.commit !== loadedCommit;
  const reloadHeld = busy || undoable !== null || celebration !== null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKeeping reads refs only.
  useEffect(() => {
    if (!outdated || reloadHeld) return;
    let timer = 0;
    const reloadWhenIdle = () => {
      clearTimeout(timer);
      timer = window.setTimeout(reloadIfSafe, document.hidden ? 0 : idleBeforeReload);
    };
    function reloadIfSafe() {
      if (submissionInFlight.current) {
        timer = window.setTimeout(reloadIfSafe, idleBeforeReload);
        return;
      }
      reloadKeeping();
    }
    const activity = ['pointerdown', 'keydown', 'input', 'wheel', 'touchstart'] as const;
    for (const event of activity) window.addEventListener(event, reloadWhenIdle, { passive: true });
    document.addEventListener('visibilitychange', reloadWhenIdle);
    reloadWhenIdle();
    return () => {
      clearTimeout(timer);
      for (const event of activity) window.removeEventListener(event, reloadWhenIdle);
      document.removeEventListener('visibilitychange', reloadWhenIdle);
    };
  }, [outdated, reloadHeld]);

  function openDeclare(player?: string) {
    if (player && !pending && !busy) {
      playerTouched.current = player !== me;
      setForm((current) => ({ ...current, player }));
    }
    setError('');
    setOpen(true);
  }

  function changeForm(next: Partial<DeclareForm>) {
    if (next.player !== undefined) playerTouched.current = true;
    if (next.type !== undefined && next.count === undefined) next.count = defaultCount(next.type);
    setForm((current) => ({ ...current, ...next }));
  }

  async function submit() {
    if (submissionInFlight.current) return;
    submissionInFlight.current = true;
    setBusy(true);
    setError('');
    setUndoable(null);
    try {
      // The same id is resent until the server confirms, so a retry never counts twice.
      const payload: Declaration = pending || {
        id: crypto.randomUUID(),
        player: form.player,
        type: form.type,
        count: form.type === 'plank' ? Math.round(form.count * 60) : form.count,
        day: parisDay(),
      };
      setPending(payload);
      const before = data ? statsOf(roster, data).find((line) => line.name === payload.player) : undefined;
      // A storage restriction must not prevent saving the exercise on the server.
      writeStorage(pendingKey, JSON.stringify(payload));
      await sendExercise(payload);
      setPending(null);
      removeStorage(pendingKey);
      setOpen(false);
      setUndoable(payload);
      setTimeout(() => setUndoable((current) => (current?.id === payload.id ? null : current)), UNDO_DELAY_MS);
      const state = await refresh();
      const after = state ? statsOf(roster, state).find((line) => line.name === payload.player) : undefined;
      const remaining = after?.remaining ?? exerciseEffect(before?.remaining ?? 0, payload).remaining;
      setCelebration({
        declaration: payload,
        before: before?.remaining ?? remaining,
        after: remaining,
        done: after?.done ?? before?.done ?? 0,
        due: after?.due ?? before?.due ?? 0,
        mine: payload.player === me,
      });
      const finished = remaining === 0;
      playJingle(finished ? 'finish' : 'cheer');
      speak(savedLine(payload.type, payload.count));
      vibrate(finished ? [60, 40, 120] : 50);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      submissionInFlight.current = false;
      setBusy(false);
    }
  }

  async function undo(exercise: Declaration, ask: boolean) {
    if (ask && !window.confirm(`Annuler la série « ${exerciseDescription(exercise)} » de ${exercise.player} ?`)) return;
    try {
      await cancelExercise(exercise.id);
      setUndoable(null);
      setCelebration(null);
      toast(`Série annulée : ${exerciseDescription(exercise)} pour ${exercise.player}.`);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const debt = data
    ? (statsOf(roster, data).find((line) => line.name === (pending?.player ?? form.player))?.remaining ?? 0)
    : null;

  return (
    <DeclareContext value={{ openDeclare, undo }}>
      {children}
      <DeclareSheet
        open={open}
        onOpenChange={setOpen}
        form={form}
        onChange={changeForm}
        roster={roster}
        me={me}
        debt={debt}
        pending={pending}
        busy={busy}
        error={error}
        onSubmit={submit}
      />
      {celebration && (
        <Celebration
          data={celebration}
          undoable={undoable?.id === celebration.declaration.id}
          onUndo={() => undo(celebration.declaration, false)}
          onClose={() => setCelebration(null)}
        />
      )}
    </DeclareContext>
  );
}
