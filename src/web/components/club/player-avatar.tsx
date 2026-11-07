import { cn } from 'cn';
import { useClub } from '../../club';
import { playerInitials } from '../../players';
import { Avatar, AvatarFallback } from '../ui/avatar';

// Initials on a disc, as the design draws them: blue for the signed-in member, then navy and grey in turn for the
// other players of the roster, in roster order.
const tones = ['bg-[#1d2f4d] text-[#a9cbff]', 'bg-[#2a2b31] text-[#d6d7dc]'];

export function PlayerAvatar({
  name,
  me = false,
  index = 0,
  className,
}: {
  name: string;
  me?: boolean;
  /** For a name outside the roster: its place in the list it stands in. */
  index?: number;
  className?: string;
}) {
  const { roster, me: member } = useClub();
  const others = roster.filter((player) => player !== member.duoPseudo);
  const place = others.indexOf(name);
  return (
    <Avatar aria-hidden="true" className={cn('size-9 after:hidden', className)}>
      <AvatarFallback
        className={cn(
          'text-[13px] font-bold',
          me ? 'bg-primary text-primary-foreground' : tones[Math.abs(place >= 0 ? place : index) % tones.length],
        )}
      >
        {playerInitials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
