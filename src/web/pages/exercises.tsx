import { useMutation } from '@tanstack/react-query';
import { cn } from 'cn';
import { useState } from 'react';
import { toast } from 'sonner';
import { exerciseDescription, formatNumber, parisDay, pushupCredit } from '../../lib/domain';
import { useBoardState } from '../board/board-context';
import { vibrate } from '../board/feedback';
import { shiftDay, weekStart } from '../board/model';
import type { Exercise } from '../board/types';
import { useClub } from '../club';
import { BackLink, PageHeader, Panel } from '../components/club/page';
import { PlayerAvatar } from '../components/club/player-avatar';
import { Segmented } from '../components/club/segmented';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { useDeclare } from '../declare/declare-context';
import { reactToExercise } from '../writes';

// Every series, kept: reactions from the others, and an undo for its author within 24 hours.

const reactionEmojis = ['💪', '🔥', '😂'];
const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;
const PAGE = 40;
const clock = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
const dayName = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const shortDay = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short' });

function Reactions({ exercise }: { exercise: Exercise }) {
  const { data, refresh } = useBoardState();
  const send = useMutation({ mutationFn: reactToExercise }).mutateAsync;
  const react = async (emoji: string) => {
    try {
      await send({ exerciseId: exercise.id, emoji });
      vibrate(15);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <>
      {reactionEmojis.map((emoji) => {
        const reaction = data?.reactions?.find((x) => x.exercise_id === exercise.id && x.emoji === emoji);
        const count = reaction?.count ?? 0;
        return (
          <Button
            key={emoji}
            type="button"
            variant="outline"
            aria-pressed={!!reaction?.mine}
            aria-label={`Réagir ${emoji}${count ? `, ${count} réaction${count > 1 ? 's' : ''}` : ''}`}
            onClick={() => react(emoji)}
            className="h-[34px] min-w-11 gap-1.5 rounded-full border-input bg-secondary px-2.5 text-[13px] font-semibold aria-pressed:border-primary/50 aria-pressed:bg-primary/16 lg:h-8 dark:bg-secondary"
          >
            {emoji}
            {count > 0 && <span>{count}</span>}
          </Button>
        );
      })}
    </>
  );
}

export function ExercisesPage() {
  const { roster } = useClub();
  const { data, me } = useBoardState();
  const { undo } = useDeclare();
  const [player, setPlayer] = useState('all');
  const [shown, setShown] = useState(PAGE);
  const today = parisDay();
  const yesterday = shiftDay(today, -1);
  const monday = weekStart(today);
  const now = Date.now();

  const exercises = (data?.exercises ?? []).filter((e) => player === 'all' || e.player === player);
  const week = exercises.filter((e) => e.day >= monday && e.day <= today);
  const sum = (type: string) =>
    week.filter((e) => (e.type ?? 'pushups') === type).reduce((total, e) => total + e.count, 0);
  const visible = exercises.slice(0, shown);
  const groups = new Map<string, Exercise[]>();
  for (const exercise of visible) groups.set(exercise.day, [...(groups.get(exercise.day) ?? []), exercise]);
  const label = (day: string) =>
    day === today ? 'Aujourd’hui' : day === yesterday ? 'Hier' : dayName.format(new Date(`${day}T12:00:00Z`));
  const shortLabel = (day: string) =>
    day === today ? 'Auj.' : day === yesterday ? 'Hier' : shortDay.format(new Date(`${day}T12:00:00Z`));
  const canUndo = (e: Exercise) => e.mine && now - Date.parse(e.created) < UNDO_WINDOW_MS;
  const playerItems = [
    { value: 'all', label: 'Tout le club' },
    ...roster.map((name) => ({ value: name, label: name })),
  ];
  const playerIndex = (name: string) => roster.indexOf(name);

  return (
    <>
      <PageHeader
        back={<BackLink to="/profil" label="Retour au profil" />}
        kicker="Toutes les séries"
        title="Exercices"
        actions={
          <div className="no-scrollbar max-w-full overflow-x-auto max-lg:-mx-4 max-lg:w-[100vw] max-lg:px-4">
            <Segmented
              label="Joueur"
              items={playerItems}
              value={player}
              onChange={(next) => {
                setPlayer(next);
                setShown(PAGE);
              }}
              size="sm"
              className="w-max min-w-full lg:min-w-0"
            />
          </div>
        }
      />
      <p className="px-1 text-[13px] leading-[1.45] text-muted-foreground lg:px-0 lg:text-sm">
        Toutes les séries sont conservées. Leur auteur peut annuler une erreur dans les 24 heures.
      </p>
      {!data ? (
        <Skeleton className="h-[400px] rounded-card" />
      ) : (
        <>
          <Panel aria-label="Totaux de la semaine" className="grid grid-cols-2 lg:flex lg:flex-row">
            {[
              ['Pompes · semaine', formatNumber(sum('pushups')), ''],
              ['Gainage', formatNumber(sum('plank') / 60), ' min'],
              ['Abdos', formatNumber(sum('crunches')), ''],
              ['Équiv. pompes', formatNumber(week.reduce((total, e) => total + pushupCredit(e), 0)), ''],
            ].map(([title, value, unit], index) => (
              <div
                key={title}
                className={cn(
                  'flex flex-1 flex-col gap-1.5 px-4 py-3.5 lg:px-5 lg:py-[18px]',
                  index % 2 === 1 && 'border-l border-border',
                  index >= 2 && 'max-lg:border-t lg:border-l',
                )}
              >
                <span className="kicker">{title}</span>
                <b className={cn('font-numeral text-4xl leading-[0.9] lg:text-5xl', index === 3 && 'text-link')}>
                  {value}
                  {unit && <span className="text-lg text-muted-foreground lg:text-[22px]">{unit}</span>}
                </b>
              </div>
            ))}
          </Panel>
          {!exercises.length && (
            <p className="px-1 text-sm text-muted-foreground">Aucun exercice enregistré pour l’instant.</p>
          )}
          <div className="flex flex-col gap-3.5 lg:hidden">
            {[...groups].map(([day, items]) => (
              <section key={day} aria-label={label(day)} className="flex flex-col gap-3.5">
                <h2 className="px-1 pt-2 text-[13px] font-bold first-letter:uppercase">{label(day)}</h2>
                {items.map((e) => (
                  <article
                    key={e.id}
                    className={cn(
                      'flex flex-col gap-2.5 rounded-[20px] border border-border bg-card px-4 py-3.5',
                      e.player === me && 'border-primary/30',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex flex-col gap-0.5">
                        <b className="text-[15px] font-semibold">
                          {e.player} · {exerciseDescription(e)}
                        </b>
                        <small className="text-xs text-muted-foreground">
                          {clock.format(new Date(e.created))}
                          {e.player === me ? ' · toi' : ''}
                        </small>
                      </span>
                      <b className="font-numeral text-2xl text-link">−{formatNumber(pushupCredit(e))}</b>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Reactions exercise={e} />
                      {canUndo(e) && (
                        <Button
                          variant="ghost"
                          onClick={() => undo(e, true)}
                          className="ml-auto min-h-11 px-1 text-[13px] font-semibold text-destructive hover:bg-transparent hover:text-destructive"
                        >
                          Annuler
                        </Button>
                      )}
                    </div>
                  </article>
                ))}
              </section>
            ))}
          </div>
          {exercises.length > 0 && (
            <Panel aria-label="Historique" className="hidden lg:flex">
              <div className="overflow-x-auto">
                <Table className="text-sm tabular-nums">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      {['Quand', 'Joueur', 'Exercice', 'Équiv.', 'Réactions'].map((title) => (
                        <TableHead
                          key={title}
                          scope="col"
                          className={cn(
                            'kicker h-auto px-4 py-3 tracking-[0.08em]',
                            title === 'Équiv.' && 'text-right',
                          )}
                        >
                          {title}
                        </TableHead>
                      ))}
                      <TableHead scope="col" className="h-auto px-4 py-3">
                        <span className="sr-only">Action</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((e) => (
                      <TableRow key={e.id} className={cn(e.player === me && 'bg-primary/5')}>
                        <TableCell className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                          {shortLabel(e.day)} {clock.format(new Date(e.created))}
                        </TableCell>
                        <TableCell className="px-4 py-2.5">
                          <span className="flex items-center gap-2">
                            <PlayerAvatar
                              name={e.player}
                              me={e.player === me}
                              index={playerIndex(e.player)}
                              className="size-[30px]"
                            />
                            {e.player}
                          </span>
                        </TableCell>
                        <TableCell className="px-4 py-2.5">{exerciseDescription(e)}</TableCell>
                        <TableCell className="px-4 py-2.5 text-right">
                          <b className="font-numeral text-xl text-link">−{formatNumber(pushupCredit(e))}</b>
                        </TableCell>
                        <TableCell className="px-4 py-2.5">
                          <div className="flex gap-1.5">
                            <Reactions exercise={e} />
                          </div>
                        </TableCell>
                        <TableCell className="px-4 py-2.5">
                          {canUndo(e) && (
                            <Button
                              variant="ghost"
                              onClick={() => undo(e, true)}
                              className="min-h-11 text-[13px] font-semibold text-destructive hover:bg-transparent hover:text-destructive"
                            >
                              Annuler
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Panel>
          )}
          {exercises.length > shown && (
            <Button
              variant="outline"
              onClick={() => setShown((n) => n + PAGE)}
              className="h-11 self-center rounded-[14px] px-5"
            >
              Voir les séries plus anciennes
            </Button>
          )}
        </>
      )}
    </>
  );
}
