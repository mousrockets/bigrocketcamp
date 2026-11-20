import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from 'cn';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { parisDay } from '../../lib/days';
import { completedBy, type SoundId } from '../../lib/sounds';
import { networkError } from '../api';
import { playerStats, useBoardState } from '../board';
import { useClub } from '../club';
import { sheetClass, sheetOverlayClass } from '../components/info-sheet';
import { type SoundPlayer, soundPlayer } from '../components/sound-player';
import { Dialog, DialogContent } from '../components/ui/dialog';
import { useSounds } from '../hooks/use-sounds';
import { soundCollectionsQuery } from '../queries';
import { debtOf } from '../team/stats';
import { declareExercise, drawSoundBadge, undoExercise } from '../writes';
import { Celebration, type Payment, type Prize } from './celebration';
import { DeclareSheet, type Series } from './declare-sheet';
import { playJingle } from './jingle';
import { apiCount } from './quantities';

// Declaring a series, over whatever tab is open: a sheet from the bottom on a phone, a window on a computer; once
// sent, the celebration fills the screen, and the series can be taken back for ten seconds. A series that clears the
// debt draws a sound badge, which plays as soon as the API answers.

export function DeclareFlow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const club = useClub();
  const { board, refresh } = useBoardState();
  const me = club.me.duoPseudo ?? '';
  const stats = board ? playerStats(board, club.roster).find((player) => player.name === me) : undefined;
  const debt = debtOf(stats ?? { due: 0, done: 0 });
  const [sent, setSent] = useState<{ id: string; payment: Payment } | null>(null);
  const [prize, setPrize] = useState<(Prize & { id: string }) | null>(null);
  const queryClient = useQueryClient();
  const sheet = useRef<HTMLDivElement>(null);
  const [sounds] = useSounds();
  const declare = useMutation({ mutationFn: declareExercise });
  const undo = useMutation({ mutationFn: undoExercise });
  const unsent = useRef<{ key: string; id: string } | null>(null);

  const close = () => {
    setSent(null);
    setPrize(null);
    unsent.current = null;
    declare.reset();
    undo.reset();
    onClose();
  };

  async function drawPrize(id: string, player: SoundPlayer | null) {
    try {
      const { sound, unlocked } = await drawSoundBadge(id);
      if (!sound) throw new Error('Unknown sound.');
      setPrize({ id, sound, unlocked, playing: Boolean(player) });
      player?.play(sound, () => setPrize((shown) => shown && { ...shown, playing: false }));
      if (unlocked) void showCompletion(id, sound);
      else void queryClient.invalidateQueries({ queryKey: soundCollectionsQuery.queryKey });
    } catch {
      // No badge this time, offline or refused: the debt is still cleared, and the jingle says so.
      if (player) playJingle('cleared');
    }
  }

  /** A new badge may complete its family, or the whole collection: the collection read again says so. */
  async function showCompletion(id: string, sound: SoundId) {
    const collections = await queryClient.fetchQuery({ ...soundCollectionsQuery, staleTime: 0 }).catch(() => null);
    const mine = collections?.find((collection) => collection.player === me)?.badges ?? [];
    const won = new Set(mine.flatMap((badge) => (badge.sound ? [badge.sound] : [])));
    if (!won.has(sound)) return;
    const completes = completedBy(sound, won);
    setPrize((shown) => (shown?.id === id ? { ...shown, completes } : shown));
  }

  async function send(series: Series) {
    const exercise = { player: me, type: series.type, count: apiCount(series.type, series.amount), day: parisDay() };
    // The same series sent again after a failure keeps its id: if the first one did arrive, it never counts twice.
    const key = JSON.stringify(exercise);
    const id = unsent.current?.key === key ? unsent.current.id : crypto.randomUUID();
    unsent.current = { key, id };
    // Made during the tap, the only moment a phone lets the page start a sound.
    const player = sounds ? soundPlayer() : null;
    try {
      await declare.mutateAsync({ id, ...exercise });
    } catch (error) {
      toast.error(networkError(error));
      return;
    }
    unsent.current = null;
    const after = Math.max(0, debt.left - series.pushups);
    // Only the series that pays back the last pushups wins a badge: a series without debt wins nothing.
    if (debt.left > 0 && after === 0) void drawPrize(id, player);
    else if (sounds) playJingle(after === 0 ? 'cleared' : 'series');
    setSent({
      id,
      payment: {
        before: debt.left,
        after,
        pushups: series.pushups,
        owed: debt.owed,
      },
    });
    void refresh();
  }

  async function takeBack() {
    if (!sent) return;
    try {
      await undo.mutateAsync(sent.id);
    } catch (error) {
      toast.error(networkError(error));
      return;
    }
    void refresh();
    // Its badge goes with it.
    void queryClient.invalidateQueries({ queryKey: soundCollectionsQuery.queryKey });
    toast('Série annulée. Pas vu, pas pris.');
    close();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent
        showCloseButton={false}
        ref={sheet}
        // Focus goes to the sheet itself: no ring on its close button after a tap, and Tab still moves inside.
        initialFocus={sheet}
        aria-label={sent ? 'Série validée' : 'Déclarer un exercice'}
        overlayClassName={cn(sheetOverlayClass, sent && 'bg-black')}
        className={cn(
          'gap-0 p-0 text-[16px] text-t1 ring-0 [line-height:normal]',
          sent
            ? 'inset-0 top-0 left-0 max-w-none translate-x-0 translate-y-0 rounded-none bg-black sm:max-w-none'
            : sheetClass,
        )}
      >
        {sent ? (
          <Celebration
            payment={sent.payment}
            prize={prize?.id === sent.id ? prize : null}
            onContinue={close}
            onUndo={takeBack}
            undoing={undo.isPending}
          />
        ) : (
          <DeclareSheet debt={debt} sending={declare.isPending} onDeclare={send} />
        )}
      </DialogContent>
    </Dialog>
  );
}
