import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '../components/ui/carousel';
import { type CardPlayer, PlayerCard } from './player-card';
import { rankRgb } from './stats';
import { useNow } from './use-now';

/**
 * On a phone, one card at a time, centred, the next ones peeking; on a computer, the cards side by side from the
 * left. Embla reads these breakpoints itself.
 */
const carouselOptions = {
  align: 'center',
  containScroll: false,
  breakpoints: { '(min-width: 64rem)': { align: 'start', containScroll: 'trimSnaps' } },
} as const;

const roundButton =
  "static size-9 translate-y-0 border-line bg-transparent text-t2 hover:border-white/18 hover:text-t1 [&_svg:not([class*='size-'])]:size-3.5";

/** One card per player, side by side: swiped one at a time on a phone, all in view on a computer. */
export function TeamCarousel({ players }: { players: CardPlayer[] }) {
  const [api, setApi] = useState<CarouselApi>();
  const [active, setActive] = useState(0);
  const now = useNow(60_000);
  const current = players[active] ?? players[0];

  useEffect(() => {
    if (!api) return;
    const follow = () => setActive(api.selectedScrollSnap());
    follow();
    api.on('select', follow).on('reInit', follow);
    return () => {
      api.off('select', follow).off('reInit', follow);
    };
  }, [api]);

  return (
    <Carousel
      setApi={setApi}
      opts={carouselOptions}
      aria-label="La team"
      className="flex animate-rise flex-col gap-4 [animation-delay:.12s] lg:gap-5"
    >
      <div className="flex items-baseline justify-between gap-3 px-5 lg:items-center lg:px-0">
        <span className="contents lg:flex lg:items-baseline lg:gap-4">
          <h2 className="title-display text-[22px]">La team</h2>
          <Link to="/matchs" className="font-medium text-[13px] text-link">
            Bilan du jour
          </Link>
        </span>
        <span className="hidden gap-2 lg:flex">
          <CarouselPrevious aria-label="Carte précédente" className={roundButton} />
          <CarouselNext aria-label="Carte suivante" className={roundButton} />
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

      <CarouselContent className="ml-0 gap-3 pt-1 pb-2 lg:gap-4 lg:px-0.5 lg:pb-3">
        {players.map((player, index) => (
          <CarouselItem
            key={player.name}
            aria-label={`${player.name}, ${player.duo.label.replace(' · ', ' ')}`}
            className="basis-[min(318px,calc(100vw-72px))] pl-0 lg:basis-[336px]"
          >
            <PlayerCard player={player} active={index === active} now={now} />
          </CarouselItem>
        ))}
      </CarouselContent>

      <div className="flex justify-center gap-1.5 lg:hidden">
        {players.map((player, index) => (
          <Button
            key={player.name}
            variant="ghost"
            aria-label={`Voir la carte de ${player.name}`}
            aria-current={index === active || undefined}
            onClick={() => api?.scrollTo(index)}
            className="h-1.5 min-w-0 rounded-[3px] border-0 p-0 transition-[width,background-color] duration-500 ease-(--ease)"
            style={{
              width: index === active ? 18 : 6,
              background: index === active ? 'rgba(245,245,247,.9)' : 'rgba(245,245,247,.22)',
            }}
          />
        ))}
      </div>
    </Carousel>
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
