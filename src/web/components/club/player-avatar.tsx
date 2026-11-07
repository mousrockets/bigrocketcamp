import { cn } from 'cn';
import { playerInitials } from '../../players';
import { Avatar, AvatarFallback } from '../ui/avatar';

// Initials on a disc: blue for the signed-in member, two quiet tones for the others, by roster position.
const tones = ['bg-[#1d2f4d] text-[#a9cbff]', 'bg-[#2a2b31] text-[#d6d7dc]'];

export function PlayerAvatar({
  name,
  me = false,
  index = 0,
  className,
}: {
  name: string;
  me?: boolean;
  /** The player's place in the roster: neighbours get different tones. */
  index?: number;
  className?: string;
}) {
  return (
    <Avatar aria-hidden="true" className={cn('size-9 after:hidden', className)}>
      <AvatarFallback
        className={cn(
          'text-[13px] font-bold',
          me ? 'bg-primary text-primary-foreground' : tones[Math.abs(index) % tones.length],
        )}
      >
        {playerInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
