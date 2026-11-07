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
import { BackLink, PageHeader, PageStack, Panel } from '../components/club/page';
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
const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The design's .rb: a pill per emoji, blue once you reacted; `wide` writes "💪 2" as the table does. */
function Reactions({ exercise, wide = false }: { exercise: Exercise; wide?: boolean }) {
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
            className={cn(
              'min-w-11 gap-[5px] rounded-full border-foreground/10 bg-secondary px-2.5 text-[13px] font-semibold aria-pressed:border-primary/50 aria-pressed:bg-primary/16 dark:bg-secondary',
              wide ? 'h-8' : 'h-[34px]',
            )}
          >
            {wide ? `${emoji}${count > 0 ? ` ${count}` : ''}` : emoji}
            {!wide && count > 0 && <span>{count}</span>}
          </Button>
        );
      })}
    </>
  );
}

function Undo({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      className={cn(
        'h-auto min-h-11 border-0 text-[13px] font-semibold text-destructive hover:bg-transparent hover:text-destructive',
        className,
      )}
    >
      Annuler
    </Button>
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
    day === today ? 'Auj.' : day === yesterday ? 'Hier' : capitalized(shortDay.format(new Date(`${day}T12:00:00Z`)));
  const canUndo = (e: Exercise) => e.mine && now - Date.parse(e.created) < UNDO_WINDOW_MS;
  const playerItems = [
    { value: 'all', label: 'Tout le club' },
    ...roster.map((name) => ({ value: name, label: name })),
  ];
  const playerIndex = (name: string) => roster.indexOf(name);
  const filter = (
    <Segmented
      label="Joueur"
      items={playerItems}
      value={player}
      onChange={(next) => {
        setPlayer(next);
        setShown(PAGE);
      }}
      layout="header"
      className="w-max min-w-full lg:min-w-0 lg:flex-wrap"
    />
  );
  // The phone's design has neither the filter nor the week's totals: they wait under the list there.
  const totals = data && (
    <Panel aria-label="Totaux de la semaine" className="grid grid-cols-2 lg:flex lg:flex-row lg:flex-wrap">
      {[
        ['Pompes · semaine', formatNumber(sum('pushups')), ''],
        ['Gainage', formatNumber(sum('plank') / 60), ' min'],
        ['Abdos', formatNumber(sum('crunches')), ''],
        ['Équiv. pompes', formatNumber(week.reduce((total, e) => total + pushupCredit(e), 0)), ''],
      ].map(([title, value, unit], index) => (
        <div
          key={title}
          className={cn(
            'flex flex-col gap-1.5 px-4 py-3.5 lg:flex-[1_1_200px] lg:px-5 lg:py-[18px]',
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
  );

  return (
    <PageStack>
      <PageHeader
        back={<BackLink to="/profil" label="Retour au profil" />}
        kicker="Toutes les séries"
        title="Exercices"
        actions={<div className="hidden lg:block">{filter}</div>}
      />
      <p className="mx-1 text-[13px] leading-[1.45] text-muted-foreground lg:mx-0 lg:text-sm lg:leading-[normal]">
        Chaque goutte de sueur est gravée ici. Une erreur ? Son auteur a 24 h pour l’annuler.
      </p>
      {!data ? (
        <Skeleton className="h-[400px] rounded-card" />
      ) : (
        <>
          <div className="hidden lg:contents">{totals}</div>
          {!exercises.length && (
            <p className="px-1 text-sm text-muted-foreground">Aucun exercice enregistré pour l’instant.</p>
          )}
          {[...groups].map(([day, items]) => (
            <section key={day} aria-label={label(day)} className="flex flex-col gap-3 lg:hidden">
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
                    {canUndo(e) && <Undo onClick={() => undo(e, true)} className="ml-auto px-1" />}
                  </div>
                </article>
              ))}
            </section>
          ))}
          {exercises.length > 0 && (
            <Panel aria-label="Historique" className="hidden overflow-hidden lg:flex">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {['Quand', 'Joueur', 'Exercice', 'Équiv.', 'Réactions'].map((title) => (
                      <TableHead key={title} scope="col" className={cn(title === 'Équiv.' && 'text-right')}>
                        {title}
                      </TableHead>
                    ))}
                    <TableHead scope="col">
                      <span className="sr-only">Action</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((e) => (
                    <TableRow key={e.id} className={cn(e.player === me && 'bg-primary/5')}>
                      <TableCell className="py-2.5 text-muted-foreground">
                        {shortLabel(e.day)} {clock.format(new Date(e.created))}
                      </TableCell>
                      <TableCell className="py-2.5">
                        <span className="flex items-center gap-2">
                          <PlayerAvatar
                            name={e.player}
                            me={e.player === me}
                            index={playerIndex(e.player)}
                            className="size-[30px] [&_[data-slot=avatar-fallback]]:text-[11px]"
                          />
                          {e.player}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5">{exerciseDescription(e)}</TableCell>
                      <TableCell className="py-2.5 text-right">
                        <b className="font-numeral text-xl text-link">−{formatNumber(pushupCredit(e))}</b>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <div className="flex gap-1.5">
                          <Reactions exercise={e} wide />
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5">
                        {canUndo(e) && <Undo onClick={() => undo(e, true)} className="px-1.5 py-px" />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
          <div className="flex flex-col gap-3 lg:hidden">
            <div className="no-scrollbar -mx-4 overflow-x-auto px-4">{filter}</div>
            {totals}
          </div>
        </>
      )}
    </PageStack>
  );
}
