import { useNavigate, useSearch } from '@tanstack/react-router';
import { cn } from 'cn';
import { ChevronLeft, ChevronRight, Pause, Play, X } from 'lucide-react';
import { type CSSProperties, type PointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { parisMonth, shiftMonth } from '../../lib/days';
import { count, formatLongMonth, formatNumber, formatOfMonth, formatPlace, plural } from '../../lib/format';
import { type Board, useBoardState } from '../board';
import { useClub, useClubName } from '../club';
import { EpicNotice } from '../components/epic-notice';
import { Button } from '../components/ui/button';
import { Dialog, DialogClose, DialogContent } from '../components/ui/dialog';
import { playJingle } from '../declare/jingle';
import { useMediaQuery } from '../hooks/use-media-query';
import { useNow } from '../hooks/use-now';
import { useSounds } from '../hooks/use-sounds';
import { rankStep } from '../team/ladder';
import { rankLightRgb, rankRgb } from '../team/stats';
import { useNameOf } from './monthly-challenge';
import { hasRecap, type Leader, type MonthRecap, monthRecap, tierOf } from './recap';

// The monthly recap, told like a story over whatever tab is open (`?recap=2026-10`): full screen on a phone, a 9:16
// card on a computer. It opens by itself the first time a member opens the app in a new month, once per device, and
// Défis replays any month gone by. A tap on the right moves on, on the left goes back, a held press pauses, a swipe
// down closes; the arrows and Escape do the same on a keyboard.

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The last month this device opened by itself, for each member: strictly what keeps it from opening twice. */
const seenKey = 'rl-recap';

function readSeen(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(seenKey) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function markSeen(memberId: string, month: string) {
  try {
    localStorage.setItem(seenKey, JSON.stringify({ ...readSeen(), [memberId]: month }));
  } catch {
    // Private windows refuse storage: the recap opens again on the next visit.
  }
}

export function MonthlyRecap() {
  const club = useClub();
  const { board } = useBoardState();
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const current = parisMonth(useNow(60_000));
  const asked = typeof search.recap === 'string' && monthPattern.test(search.recap) ? search.recap : null;
  const month = asked && asked < current ? asked : null;
  const sheetOpen = Boolean(search.recap || search.declarer || search.ranks || search.regles);

  // A new month: last month's recap opens once, if anything happened in it.
  useEffect(() => {
    if (!board || sheetOpen) return;
    const previous = shiftMonth(current, -1);
    if (readSeen()[club.me.id] === previous || !hasRecap(board, club.roster, previous)) return;
    markSeen(club.me.id, previous);
    void navigate({
      to: '.',
      search: (before: Record<string, unknown>) => ({ ...before, recap: previous }),
      replace: true,
      resetScroll: false,
    });
  }, [board, sheetOpen, current, club.me.id, club.roster, navigate]);

  const close = () =>
    void navigate({
      to: '.',
      search: (before: Record<string, unknown>) => ({ ...before, recap: undefined }),
      resetScroll: false,
    });
  const recap = useMemo(
    () => (board && month ? monthRecap(board, club.roster, club.me.duoPseudo, month) : null),
    [board, month, club.roster, club.me.duoPseudo],
  );

  return (
    <Dialog open={Boolean(recap)} onOpenChange={(next) => !next && close()}>
      {recap && board && <RecapDialog key={recap.month} recap={recap} board={board} onClose={close} />}
    </Dialog>
  );
}

interface Slide {
  id: string;
  /** The backdrop's colour: a variable of styles.css, or a player's rank. */
  tint: string;
  seconds: number;
  content: ReactNode;
}

function RecapDialog({ recap, board, onClose }: { recap: MonthRecap; board: Board; onClose: () => void }) {
  const popup = useRef<HTMLDivElement>(null);
  const me = useClub().me.duoPseudo;
  const slides = useSlides(recap, board, me);
  const [index, setIndex] = useState(0);
  /** Each move restarts the slide's bar, even back to the same slide. */
  const [round, setRound] = useState(0);
  const [direction, setDirection] = useState(1);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const [drag, setDrag] = useState(0);
  const still = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [sounds] = useSounds();
  const gesture = useRef<{ x: number; y: number; held: boolean; hold: number; pulled: number } | null>(null);
  const swallowClick = useRef(false);
  const last = slides.length - 1;

  const go = (delta: number) => {
    const next = index + delta;
    if (next > last) return onClose();
    setDirection(delta < 0 ? -1 : 1);
    setIndex(Math.max(0, next));
    setRound((value) => value + 1);
    if (next === last && sounds) playJingle('cleared');
  };
  const restart = () => {
    setDirection(-1);
    setIndex(0);
    setRound((value) => value + 1);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    swallowClick.current = false;
    const start = { x: event.clientX, y: event.clientY, held: false, hold: 0, pulled: 0 };
    start.hold = window.setTimeout(() => {
      start.held = true;
      setHeld(true);
    }, 220);
    gesture.current = start;
  };
  const onPointerMove = (event: PointerEvent) => {
    const start = gesture.current;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) clearTimeout(start.hold);
    start.pulled = dy > 0 && dy > Math.abs(dx) ? dy : 0;
    setDrag(start.pulled);
  };
  const onPointerUp = () => {
    const start = gesture.current;
    if (!start) return;
    clearTimeout(start.hold);
    gesture.current = null;
    setHeld(false);
    setDrag(0);
    if (start.pulled > 120) return onClose();
    // A press held or a finger dragged is not a tap: the slide stays.
    if (start.pulled > 10 || start.held) swallowClick.current = true;
  };
  const tap = (delta: number) => () => {
    if (swallowClick.current) {
      swallowClick.current = false;
      return;
    }
    go(delta);
  };

  const stopped = paused || held;
  const slide = slides[index] as Slide;

  return (
    <DialogContent
      ref={popup}
      initialFocus={popup}
      showCloseButton={false}
      aria-label={`Récap ${formatOfMonth(recap.month)}`}
      overlayClassName="bg-black lg:bg-black/80 lg:backdrop-blur-[10px] supports-backdrop-filter:lg:backdrop-blur-[10px]"
      className="inset-0 top-0 left-0 block h-dvh w-full max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none bg-black p-0 text-[16px] text-t1 ring-0 [line-height:normal] sm:max-w-none lg:inset-auto lg:top-1/2 lg:left-1/2 lg:aspect-[9/16] lg:h-[min(90dvh,880px)] lg:w-auto lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[34px] lg:shadow-[inset_0_0_0_.5px_rgba(255,255,255,.12),0_40px_120px_rgba(0,0,0,.7)]"
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') go(1);
        else if (event.key === 'ArrowLeft') go(-1);
        else return;
        event.preventDefault();
      }}
    >
      <div
        className="recap-stage relative flex h-full flex-col overflow-hidden bg-black transition-[transform,opacity] duration-300 ease-(--ease)"
        data-paused={stopped || undefined}
        style={
          drag
            ? { transform: `translateY(${drag}px) scale(${1 - Math.min(drag, 400) / 2000})`, opacity: 1 - drag / 900 }
            : undefined
        }
      >
        {slides.map((candidate, position) => (
          <i
            key={candidate.id}
            aria-hidden="true"
            className="recap-backdrop"
            data-active={position === index || undefined}
            style={{ '--recap-tint': candidate.tint } as CSSProperties}
          />
        ))}

        <div
          className="absolute inset-0 z-10 flex touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <Button
            variant="ghost"
            aria-label="Slide précédente"
            onClick={tap(-1)}
            className="group h-full w-1/3 justify-start rounded-none bg-transparent pl-3 hover:bg-transparent focus-visible:ring-inset active:not-aria-[haspopup]:translate-y-0 dark:hover:bg-transparent"
          >
            <ChevronLeft
              aria-hidden="true"
              className="hidden size-7 text-t2 opacity-0 transition-opacity group-hover:opacity-100 lg:block"
            />
          </Button>
          <Button
            variant="ghost"
            aria-label="Slide suivante"
            onClick={tap(1)}
            className="group h-full flex-1 justify-end rounded-none bg-transparent pr-3 hover:bg-transparent focus-visible:ring-inset active:not-aria-[haspopup]:translate-y-0 dark:hover:bg-transparent"
          >
            <ChevronRight
              aria-hidden="true"
              className="hidden size-7 text-t2 opacity-0 transition-opacity group-hover:opacity-100 lg:block"
            />
          </Button>
        </div>

        <header className="relative z-30 flex flex-col gap-3 px-3 pt-[max(12px,env(safe-area-inset-top))] lg:px-4 lg:pt-4">
          <div aria-hidden="true" className="flex gap-1">
            {slides.map((candidate, position) => (
              <i key={candidate.id} className="recap-bar">
                <b
                  key={position === index ? `now-${round}` : candidate.id}
                  data-state={position < index ? 'done' : position === index ? 'now' : 'next'}
                  data-still={still || undefined}
                  style={
                    position === index ? ({ '--recap-duration': `${candidate.seconds}s` } as CSSProperties) : undefined
                  }
                  onAnimationEnd={position === index && !still && position < last ? () => go(1) : undefined}
                />
              </i>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="label-caps text-t2">Récap · {formatLongMonth(recap.month)}</span>
            <span className="flex gap-2">
              <Button
                variant="soft"
                size="round"
                aria-label={stopped ? 'Reprendre' : 'Mettre en pause'}
                onClick={() => setPaused(!paused)}
              >
                {stopped ? <Play strokeWidth={2.4} /> : <Pause strokeWidth={2.4} />}
              </Button>
              <DialogClose render={<Button variant="soft" size="round" aria-label="Fermer le récap" />}>
                <X strokeWidth={2.4} />
              </DialogClose>
            </span>
          </div>
        </header>

        <div aria-live="polite" className="pointer-events-none relative z-20 flex min-h-0 flex-1 flex-col">
          <section
            key={`${slide.id}-${round}`}
            aria-roledescription="slide"
            aria-label={`${index + 1} sur ${slides.length}`}
            className="recap-slide flex min-h-0 flex-1 flex-col justify-center gap-5 px-7 pb-[max(36px,env(safe-area-inset-bottom))] lg:px-9"
            style={{ '--recap-from': `${direction * 36}px` } as CSSProperties}
          >
            {slide.id === 'outro' ? <Outro recap={recap} onReplay={restart} onClose={onClose} /> : slide.content}
          </section>
        </div>
      </div>
    </DialogContent>
  );
}

/** A slide's parts appear one after the other. */
function Reveal({ step, className, children }: { step: number; className?: string; children: ReactNode }) {
  return (
    <div className={cn('recap-reveal', className)} style={{ animationDelay: `${0.15 + step * 0.14}s` }}>
      {children}
    </div>
  );
}

function Kicker({ children }: { children: ReactNode }) {
  return (
    <Reveal step={0}>
      <span className="label-caps text-[12px] text-t2">{children}</span>
    </Reveal>
  );
}

/** The figure counting up to `value`, eased, once the slide has settled. */
function useCountUp(value: number, still: boolean): number {
  const [shown, setShown] = useState(still ? value : 0);
  useEffect(() => {
    if (still) {
      setShown(value);
      return;
    }
    let frame = 0;
    let start = 0;
    const step = (time: number) => {
      start ||= time;
      const progress = Math.min(1, (time - start) / 1100);
      setShown(progress < 1 ? Math.round(value * (1 - (1 - progress) ** 3)) : value);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    const timer = window.setTimeout(() => {
      frame = requestAnimationFrame(step);
    }, 450);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [value, still]);
  return shown;
}

/** The slide's one big number, and its unit under it. */
function Figure({ value, unit, prefix = '' }: { value: number; unit: string; prefix?: string }) {
  const still = useMediaQuery('(prefers-reduced-motion: reduce)');
  const shown = useCountUp(value, still);
  return (
    <div className="flex flex-col gap-2">
      <b
        className="recap-figure num text-[118px] tracking-[-.04em] [line-height:.82] lg:text-[128px]"
        style={{ animationDelay: '.3s' }}
      >
        {still ? (
          `${prefix}${formatNumber(value)}`
        ) : (
          <>
            <span aria-hidden="true">
              {prefix}
              {formatNumber(shown)}
            </span>
            <span className="sr-only">
              {prefix}
              {formatNumber(value)}
            </span>
          </>
        )}
      </b>
      <Reveal step={3}>
        <span className="font-semibold text-[17px] text-t2">{unit}</span>
      </Reveal>
    </div>
  );
}

/** The players named, each in their colour; a tie names them all. */
function Names({ board, players }: { board: Board; players: string[] }) {
  const nameOf = useNameOf();
  return (
    <span className="title-display text-[34px] [line-height:1.05]">
      {players.map((player, position) => (
        <span key={player}>
          {position > 0 && <span className="text-t2"> & </span>}
          <span className="recap-name" style={{ '--player': rankLightRgb(tierOf(board, player)) } as CSSProperties}>
            {nameOf(player)}
          </span>
        </span>
      ))}
    </span>
  );
}

const playerTint = (board: Board, leader: Leader | null) =>
  leader ? `rgb(${rankRgb(tierOf(board, leader.players[0] ?? ''))})` : 'var(--link)';

/** « Bob », « alice et bob »: players in a sentence. */
function useNamesInText() {
  const nameOf = useNameOf();
  return (players: string[]) => players.map(nameOf).join(' et ');
}

function useSlides(recap: MonthRecap, board: Board, me: string | null): Slide[] {
  const clubName = useClubName();
  const names = useNamesInText();
  const { club, mvp, debt, winStreak, lossStreak, climb, verdict, fun, mine } = recap;
  const of = formatOfMonth(recap.month);
  const slides: Slide[] = [
    {
      id: 'intro',
      tint: 'var(--link)',
      seconds: 4,
      content: (
        <>
          <Kicker>{clubName || 'Le récap du club'}</Kicker>
          <Reveal step={1}>
            <h2
              className="celebration-headline m-0 font-display font-black text-[64px] uppercase italic [font-stretch:72%] [line-height:.9] lg:text-[72px]"
              style={{ '--glint': 'var(--link)' } as CSSProperties}
            >
              Ton mois {of}
            </h2>
          </Reveal>
          <Reveal step={3}>
            <p className="m-0 text-[18px] text-t2 [line-height:1.4]">
              {recap.active
                ? 'Des matchs, des pompes, de la mauvaise foi. On rembobine.'
                : 'Un mois tout calme. Trop calme.'}
            </p>
          </Reveal>
        </>
      ),
    },
  ];

  if (!recap.active) {
    slides.push({
      id: 'empty',
      tint: 'var(--t3)',
      seconds: 6,
      content: (
        <>
          <Kicker>Rien à signaler</Kicker>
          <Figure value={0} unit="match" />
          <Reveal step={4}>
            <p className="m-0 text-[17px] text-t2">Zéro match, zéro pompe. Les vacances, c’est sacré.</p>
          </Reveal>
        </>
      ),
    });
  } else {
    slides.push({
      id: 'club',
      tint: 'var(--link)',
      seconds: 6,
      content: (
        <>
          <Kicker>Le club {of}</Kicker>
          {club.matches > 0 ? (
            <Figure value={club.matches} unit={`${plural(club.matches, 'match', 'matchs')} joués`} />
          ) : (
            <Figure value={club.pushups} unit={`${plural(club.pushups, 'pompe')} rendues`} />
          )}
          <Reveal step={4} className="flex flex-col gap-1.5 text-[17px] text-t2">
            {club.matches > 0 && (
              <span>
                <b className="text-win">{count(club.wins, 'victoire')}</b> · {count(club.losses, 'défaite')}
              </span>
            )}
            {club.matches > 0 && <span>{count(club.pushups, 'pompe')} rendues</span>}
            <span className="text-t3">
              {club.matches === 0
                ? 'Pas un match, mais les bras ont bossé.'
                : club.wins >= club.losses
                  ? 'Plus de victoires que de défaites. Le ladder tremble.'
                  : 'Plus de défaites que de victoires. Les pompes, elles, ont gagné.'}
            </span>
          </Reveal>
        </>
      ),
    });

    if (mvp || debt) {
      const tint = playerTint(board, mvp);
      slides.push({
        id: 'mvp',
        tint,
        seconds: 7,
        content: (
          <>
            <Confetti tint={tint} />
            <Kicker>Les bras d’or {of}</Kicker>
            <Reveal step={1}>
              {mvp ? (
                <Names board={board} players={mvp.players} />
              ) : (
                <span className="title-display text-[34px]">Personne</span>
              )}
            </Reveal>
            <Figure value={mvp?.value ?? 0} unit={plural(mvp?.value ?? 0, 'pompe')} />
            <Reveal step={4} className="text-[17px] text-t2 [line-height:1.4]">
              {mvp && mvp.players.length > 1 && <p className="m-0 mb-2 text-t1">À égalité parfaite. Respect.</p>}
              <p className="m-0">
                {debt
                  ? `Plus grosse ardoise : ${names(debt.players)}, ${count(debt.value, 'pompe')} à rendre. On croit fort en toi.`
                  : 'Personne ne doit une seule pompe. Ardoise propre pour tout le monde.'}
              </p>
            </Reveal>
          </>
        ),
      });
    }

    if (winStreak) {
      slides.push({
        id: 'streaks',
        tint: 'var(--win)',
        seconds: 6,
        content: (
          <>
            <Kicker>La plus belle streak</Kicker>
            <Reveal step={1}>
              <Names board={board} players={winStreak.players} />
            </Reveal>
            <Figure value={winStreak.value} unit={`${plural(winStreak.value, 'victoire')} d’affilée`} />
            {lossStreak && (
              <Reveal step={4}>
                <p className="m-0 text-[17px] text-t2 [line-height:1.4]">
                  Série noire : {names(lossStreak.players)}, {count(lossStreak.value, 'défaite')} de suite. Même les
                  pros ont des soirs sans.
                </p>
              </Reveal>
            )}
          </>
        ),
      });
    }

    if (climb) {
      const from = climb.from && rankStep(climb.from);
      const to = climb.to && rankStep(climb.to);
      const icon = climb.to ?? tierOf(board, climb.players[0] ?? '');
      slides.push({
        id: 'climb',
        tint: playerTint(board, climb),
        seconds: 7,
        content: (
          <>
            <Kicker>La meilleure grimpette</Kicker>
            <Reveal step={1}>
              <Names board={board} players={climb.players} />
            </Reveal>
            <Reveal step={2} className="flex items-center gap-3">
              {from && to && from.tier !== to.tier && (
                <>
                  <img
                    src={`/rocket-league/ranks/${from.tier}.png`}
                    alt={`Rank ${from.name}`}
                    width={56}
                    height={56}
                    className="size-14 object-contain opacity-70"
                  />
                  <ChevronRight aria-hidden="true" className="size-5 text-t3" />
                </>
              )}
              <img
                src={`/rocket-league/ranks/${icon ?? 0}.png`}
                alt={`Rank ${rankStep(icon ?? 0)?.name ?? 'non classé'}`}
                width={84}
                height={84}
                className="rank-up-icon size-[84px] object-contain"
                style={{ '--rank-light': rankLightRgb(icon) } as CSSProperties}
              />
            </Reveal>
            <Figure value={climb.value} prefix="+" unit="MMR gagnés au défi du mois" />
            {verdict && (
              <Reveal step={4}>
                <p className="m-0 text-[17px] text-t2 [line-height:1.4]">
                  {verdict.status === 'final' && verdict.payers.length > 0
                    ? `Dernier du défi : ${names(verdict.payers)}. Tournée générale !`
                    : verdict.status === 'tied'
                      ? 'Égalité tout en bas : personne ne paie sa tournée.'
                      : 'Un relevé manquait : personne ne paie sa tournée.'}
                </p>
              </Reveal>
            )}
            <EpicNotice className="mt-auto" />
          </>
        ),
      });
    }

    const facts = [
      { value: fun.demos ?? 0, unit: plural(fun.demos ?? 0, 'démo'), joke: 'Les auto-tamponneuses, c’est par ici.' },
      {
        value: fun.crossbars ?? 0,
        unit: plural(fun.crossbars ?? 0, 'barre transversale', 'barres transversales'),
        joke: 'Si près, si loin.',
      },
      { value: fun.overtimes, unit: plural(fun.overtimes, 'prolongation'), joke: 'Le cœur a tenu. Presque.' },
      { value: fun.forfeits, unit: 'FF', joke: 'Personne ne juge. Enfin, un peu.' },
    ].filter((fact) => fact.value > 0);
    const [top, ...others] = facts;
    if (top) {
      slides.push({
        id: 'fun',
        tint: 'var(--chart-4)',
        seconds: 6,
        content: (
          <>
            <Kicker>Le coin des stats</Kicker>
            <Figure value={top.value} unit={top.unit} />
            <Reveal step={4} className="flex flex-col gap-1.5 text-[17px] text-t2">
              <span className="text-t3">{top.joke}</span>
              {others.length > 0 && (
                <span>{others.map((fact) => `${formatNumber(fact.value)} ${fact.unit}`).join(' · ')}</span>
              )}
            </Reveal>
          </>
        ),
      });
    }

    if (mine) {
      slides.push({
        id: 'mine',
        tint: `rgb(${rankRgb(tierOf(board, me ?? ''))})`,
        seconds: 7,
        content: <Mine mine={mine} />,
      });
    }
  }

  slides.push({ id: 'outro', tint: 'var(--link)', seconds: 8, content: null });
  return slides;
}

function Mine({ mine }: { mine: NonNullable<MonthRecap['mine']> }) {
  return (
    <>
      <Kicker>Ton mois à toi</Kicker>
      <Figure value={mine.pushups} unit={`${plural(mine.pushups, 'pompe')} rendues`} />
      <Reveal step={4} className="flex flex-col gap-1.5 text-[17px] text-t2">
        {mine.matches > 0 && (
          <span>
            {count(mine.matches, 'match', 'matchs')} · {count(mine.wins, 'victoire')} · {count(mine.goals, 'but')}
          </span>
        )}
        {mine.mvps > 0 && <span>{formatNumber(mine.mvps)} fois MVP</span>}
        <span className="text-t3">
          {mine.place === 1
            ? 'Premier du club aux pompes. Les bras d’or, c’est toi.'
            : `${formatPlace(mine.place)} du club aux pompes.`}
        </span>
      </Reveal>
    </>
  );
}

const jokes = [
  'Rendez-vous le mois prochain. D’ici là : pas de FF.',
  'Le récap est fini. Les pompes, non.',
  'What a save! Enfin, what a month.',
  'Calculated. Ou presque.',
];

function Outro({ recap, onReplay, onClose }: { recap: MonthRecap; onReplay: () => void; onClose: () => void }) {
  return (
    <>
      <Boost />
      <Reveal step={0}>
        <h2
          className="celebration-headline m-0 font-display font-black text-[120px] uppercase italic [font-stretch:72%] [line-height:.85]"
          style={{ '--glint': 'var(--win)' } as CSSProperties}
        >
          GG
        </h2>
      </Reveal>
      <Reveal step={2}>
        <p className="m-0 text-balance text-[19px] text-t2 [line-height:1.4]">
          {jokes[Number(recap.month.slice(5)) % jokes.length]}
        </p>
      </Reveal>
      <Reveal step={3} className="pointer-events-auto mt-6 flex flex-col gap-1">
        <Button variant="cta" size="cta-xl" onClick={onClose}>
          Fermer
        </Button>
        <Button variant="quiet" size="quiet" onClick={onReplay}>
          Revoir le récap
        </Button>
      </Reveal>
    </>
  );
}

/** Confetti in the leader's colour and white, falling over the slide. */
function Confetti({ tint }: { tint: string }) {
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden motion-reduce:hidden">
      {Array.from({ length: 26 }, (_, piece) => (
        <i
          // biome-ignore lint/suspicious/noArrayIndexKey: the confetti are fixed, the index is their identity.
          key={piece}
          className="recap-confetti"
          style={
            {
              left: `${(piece * 37) % 100}%`,
              background: piece % 3 === 0 ? 'var(--t1)' : tint,
              '--delay': `${0.4 + ((piece * 7) % 13) * 0.12}s`,
              '--fall': `${2.6 + (piece % 5) * 0.35}s`,
              '--sway': `${((piece * 23) % 60) - 30}px`,
              '--spin': `${360 + (piece % 4) * 180}deg`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** Boost trails rising behind the last slide. */
function Boost() {
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden motion-reduce:hidden">
      {Array.from({ length: 18 }, (_, trail) => (
        <i
          // biome-ignore lint/suspicious/noArrayIndexKey: the trails are fixed, the index is their identity.
          key={trail}
          className="recap-boost"
          style={
            {
              left: `${(trail * 41 + 7) % 100}%`,
              height: `${60 + ((trail * 17) % 70)}px`,
              '--delay': `${((trail * 5) % 11) * 0.18}s`,
              '--fall': `${1.8 + (trail % 4) * 0.3}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
