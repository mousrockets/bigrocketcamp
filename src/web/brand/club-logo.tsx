import { cn } from 'cn';
import { useContext } from 'react';
import { ClubLogoContext, useClubName } from '../club';

/** "Big Rocket Camp" gives "BRC": the first letter of the first three words. */
export function clubInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word[0]?.toLocaleUpperCase('fr'))
    .join('');
}

/** The club's uploaded logo, or its initials on a white tile when it has none. Size it with `className`. */
export function ClubLogo({ className }: { className?: string }) {
  const logo = useContext(ClubLogoContext);
  const initials = clubInitials(useClubName());
  const tile = 'flex shrink-0 items-center justify-center overflow-hidden';
  if (logo) return <img className={cn(tile, 'object-cover', className)} src={logo} alt="" aria-hidden="true" />;
  return (
    <span
      aria-hidden="true"
      className={cn(tile, 'bg-gate-text font-display font-black text-gate [font-stretch:75%]', className)}
    >
      {initials}
    </span>
  );
}
