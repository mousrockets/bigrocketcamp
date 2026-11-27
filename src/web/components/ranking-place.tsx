import { cn } from 'cn';

/** The member's place wears a medal's colour on a podium. */
export const medals: Record<number, string> = { 1: 'text-medal-1', 2: 'text-medal-2', 3: 'text-medal-3' };

/** The member's own line in a ranking, set apart in a soft capsule, as a selected row would be. */
export const mineClass = '-mx-3 rounded-[14px] bg-white/7 px-3 shadow-[inset_0_0_0_.5px_rgba(255,255,255,.1)]';

/**
 * A player's place in a ranking. The member's in big, in its medal's colour on the podium: what the eye finds first;
 * the others' small and quiet.
 */
export function Place({ place, mine }: { place: number | null; mine: boolean }) {
  return (
    <span
      className={cn(
        'num w-5 text-center [line-height:1]',
        mine ? ['text-[22px]', (place && medals[place]) ?? 'text-t1'] : 'text-[13px] text-t3',
      )}
    >
      {place ?? '–'}
    </span>
  );
}
