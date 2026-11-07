import { cn } from 'cn';
import { count } from '../../lib/format';
import { ClubLogo } from '../brand/club-logo';
import { useClub } from '../club';

/** The club's logo and name, with the game it plays and how many play: atop L'équipe on a phone, the sidebar on a computer. */
export function ClubBadge({ className }: { className?: string }) {
  const { name, players } = useClub();
  return (
    <span className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <ClubLogo className="size-[30px] rounded-[8px] bg-t1 font-extrabold text-[12px] text-black" />
      <span className="flex min-w-0 flex-col gap-0.5 lg:gap-[3px]">
        <b className="font-semibold text-[15px] tracking-[-.01em] [line-height:1] lg:text-[14px] lg:tracking-normal">
          {name}
        </b>
        <span className="flex items-center gap-1.5 text-[11px] text-t3">
          <img
            src="/rocket-league/logo.svg"
            alt="Rocket League"
            width={26}
            height={13}
            className="shrink-0 opacity-70"
          />
          <span>{count(players.length, 'joueur')}</span>
        </span>
      </span>
    </span>
  );
}
