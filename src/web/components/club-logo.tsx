import { cn } from 'cn';
import { useContext } from 'react';
import { ClubLogoContext } from '../club';

/** The club's uploaded logo, or Big Rocket Camp's own mark when it has none. Size it with `className`. */
export function ClubLogo({ className }: { className?: string }) {
  const logo = useContext(ClubLogoContext);
  const tile = 'flex shrink-0 items-center justify-center overflow-hidden';
  if (logo) return <img className={cn(tile, 'object-cover', className)} src={logo} alt="" aria-hidden="true" />;
  return (
    <span
      aria-hidden="true"
      className={cn(tile, 'bg-gate-text font-display font-black text-gate [font-stretch:75%]', className)}
    >
      BRC
    </span>
  );
}
