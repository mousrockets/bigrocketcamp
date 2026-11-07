import { useMutation } from '@tanstack/react-query';
import { cn } from 'cn';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { parisDay } from '../../lib/days';
import { playerStats, useBoardState } from '../board';
import { useClub } from '../club';
import { Dialog, DialogContent } from '../components/ui/dialog';
import { debtOf } from '../team/stats';
import { declareExercise, undoExercise } from '../writes';
import { Celebration, type Payment } from './celebration';
import { DeclareSheet, type Series } from './declare-sheet';
import { apiCount } from './quantities';

// Declaring a series, over whatever tab is open: a sheet from the bottom on a phone, a window on a computer; once
// sent, the celebration fills the screen, and the series can be taken back for ten seconds.

export function DeclareFlow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const club = useClub();
  const { board, refresh } = useBoardState();
  const me = club.me.duoPseudo ?? '';
  const stats = board ? playerStats(board, club.roster).find((player) => player.name === me) : undefined;
  const debt = debtOf(stats ?? { due: 0, done: 0 });
  const [sent, setSent] = useState<{ id: string; payment: Payment } | null>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const declare = useMutation({ mutationFn: declareExercise });
  const undo = useMutation({ mutationFn: undoExercise });

  const close = () => {
    setSent(null);
    declare.reset();
    undo.reset();
    onClose();
  };

  async function send(series: Series) {
    const id = crypto.randomUUID();
    try {
      await declare.mutateAsync({
        id,
        player: me,
        type: series.type,
        count: apiCount(series.type, series.amount),
        day: parisDay(),
      });
    } catch (error) {
      toast.error((error as Error).message);
      return;
    }
    setSent({
      id,
      payment: {
        before: debt.left,
        after: Math.max(0, debt.left - series.pushups),
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
      toast.error((error as Error).message);
      return;
    }
    void refresh();
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
        overlayClassName={cn(
          'bg-black/50 backdrop-blur-[6px] supports-backdrop-filter:backdrop-blur-[6px] lg:bg-black/55',
          sent && 'bg-black',
        )}
        className={cn(
          'gap-0 p-0 text-[16px] text-t1 ring-0 [line-height:normal]',
          sent
            ? 'inset-0 top-0 left-0 max-w-none translate-x-0 translate-y-0 rounded-none bg-black sm:max-w-none'
            : // A sheet from the bottom on a phone, a window in the middle on a computer.
              'top-auto bottom-0 left-0 flex max-w-none translate-x-0 translate-y-0 data-open:animate-sheet-in flex-col gap-[22px] rounded-t-[34px] rounded-b-none bg-[rgba(28,28,30,.9)] px-5 pt-2 pb-[34px] shadow-[inset_0_.5px_0_rgba(255,255,255,.14),0_-20px_60px_rgba(0,0,0,.5)] backdrop-blur-[40px] backdrop-saturate-[1.8] sm:max-w-none lg:top-1/2 lg:bottom-auto lg:left-1/2 lg:max-w-[440px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:data-open:animate-pop-in lg:rounded-[30px] lg:bg-[rgba(28,28,30,.88)] lg:px-7 lg:pt-[26px] lg:pb-7 lg:shadow-[inset_0_.5px_0_rgba(255,255,255,.16),0_0_0_.5px_rgba(255,255,255,.06),0_40px_100px_rgba(0,0,0,.6)]',
        )}
      >
        {sent ? (
          <Celebration payment={sent.payment} onContinue={close} onUndo={takeBack} undoing={undo.isPending} />
        ) : (
          <DeclareSheet debt={debt} sending={declare.isPending} onDeclare={send} />
        )}
      </DialogContent>
    </Dialog>
  );
}
