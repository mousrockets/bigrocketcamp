import { Link } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '../components/ui/button';
import { type CardPlayer, PlayerCard } from './player-card';
import { rankRgb } from './stats';
import { useNow } from './use-now';

/** One card per player, side by side: swiped one at a time on a phone, all in view on a computer. */
export function TeamCarousel({ players }: { players: CardPlayer[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const now = useNow(60_000);
  const current = players[active] ?? players[0];

  /** The distance from one card to the next: a card and the gap after it. */
  const step = () => {
    const element = track.current;
    const card = element?.firstElementChild as HTMLElement | null;
    if (!element || !card) return 0;
    return card.offsetWidth + Number.parseFloat(getComputedStyle(element).columnGap || '0');
  };
  const scrollTo = (index: number) => track.current?.scrollTo({ left: index * step(), behavior: 'smooth' });
  const scrollBy = (cards: number) => track.current?.scrollBy({ left: cards * step(), behavior: 'smooth' });

  return (
    <section aria-label="La team" className="flex animate-rise flex-col gap-4 [animation-delay:.12s] lg:gap-5">
      <div className="flex items-baseline justify-between gap-3 px-5 lg:items-center lg:px-0">
        <span className="contents lg:flex lg:items-baseline lg:gap-4">
          <h2 className="title-display text-[22px]">La team</h2>
          <Link to="/matchs" className="font-medium text-[13px] text-link">
            Bilan du jour
          </Link>
        </span>
        <span className="hidden gap-2 lg:flex">
          <Button variant="line" size="round" aria-label="Carte précédente" onClick={() => scrollBy(-1)}>
            <ChevronLeft strokeWidth={2} />
          </Button>
          <Button variant="line" size="round" aria-label="Carte suivante" onClick={() => scrollBy(1)}>
            <ChevronRight strokeWidth={2} />
          </Button>
        </span>
      </div>

      {/* Coloured light behind the cards: the player's colour, then their duo rank's. */}
      <div aria-hidden="true" className="relative h-0">
        {current && (
          <span className="lg:hidden">
            <Glow left="4%" top={150} size={240} rgb={rankRgb(current.tier)} alpha={0.34} />
            <Glow left="40%" top={300} size={220} rgb={rankRgb(current.duo.tier)} alpha={0.3} />
          </span>
        )}
        <span className="hidden lg:inline">
          {players.map((player, index) => (
            <span key={player.name}>
              <Glow left={`${index * 352 + 20}px`} top={140} size={220} rgb={rankRgb(player.tier)} alpha={0.3} />
              <Glow left={`${index * 352 + 130}px`} top={300} size={190} rgb={rankRgb(player.duo.tier)} alpha={0.26} />
            </span>
          ))}
        </span>
      </div>

      <div
        ref={track}
        onScroll={(event) => {
          const distance = step();
          if (distance) setActive(Math.round(event.currentTarget.scrollLeft / distance));
        }}
        className="relative flex snap-x snap-mandatory gap-3 overflow-x-auto px-[calc((100%-var(--cw))/2)] pt-1 pb-2 [--cw:min(318px,calc(100vw-72px))] [scrollbar-width:none] lg:gap-4 lg:px-0.5 lg:pb-3 lg:[--cw:336px] [&::-webkit-scrollbar]:hidden"
      >
        {players.map((player, index) => (
          <PlayerCard key={player.name} player={player} active={index === active} now={now} />
        ))}
      </div>

      <div className="flex justify-center gap-1.5 lg:hidden">
        {players.map((player, index) => (
          <button
            key={player.name}
            type="button"
            aria-label={`Voir la carte de ${player.name}`}
            aria-current={index === active || undefined}
            onClick={() => {
              scrollTo(index);
              setActive(index);
            }}
            className="h-1.5 rounded-[3px] border-0 p-0 transition-[width,background-color] duration-500 ease-(--ease)"
            style={{
              width: index === active ? 18 : 6,
              background: index === active ? 'rgba(245,245,247,.9)' : 'rgba(245,245,247,.22)',
            }}
          />
        ))}
      </div>
    </section>
  );
}

function Glow({
  left,
  top,
  size,
  rgb,
  alpha,
}: {
  left: string;
  top: number;
  size: number;
  rgb: string;
  alpha: number;
}) {
  return (
    <i
      className="pointer-events-none absolute rounded-full blur-[56px] transition-[background-color] duration-1000 ease-(--ease)"
      style={{ left, top, width: size, height: size, background: `rgba(${rgb},${alpha})` }}
    />
  );
}
