import { cn } from 'cn';
import { formatWhen } from '../../lib/format';
import { useNow } from '../hooks/use-now';

/**
 * The collector sends each match once it ends, and a match lasts about seven minutes: a match received within the
 * last quarter of an hour means someone is playing.
 */
const liveWindow = 15 * 60_000;

export const isLive = (lastReceived: string | null, now: number): boolean =>
  lastReceived !== null && now - Date.parse(lastReceived) < liveWindow;

/** "Actualisé à 19 h 42": when the last match came in. */
export const receptionLabel = (lastReceived: string | null, now: number): string =>
  lastReceived === null ? 'En attente du premier match' : `Actualisé ${formatWhen(lastReceived, now)}`;

/**
 * "Direct", with a red dot that breathes, while someone plays and their collector sends matches. With `reception`,
 * beside it, or alone on a phone once nobody plays, when the last match came in.
 */
export function LiveStatus({ lastReceived, reception = true }: { lastReceived: string | null; reception?: boolean }) {
  const now = useNow(30_000);
  const live = isLive(lastReceived, now);
  return (
    <>
      {live && (
        <span className="flex items-center gap-1.5 font-medium text-[12px] lg:font-normal lg:text-[13px]">
          <i aria-hidden="true" className="size-1.5 animate-breathe rounded-full bg-[#ff453a]" />
          Direct
        </span>
      )}
      {reception && (
        <span className={cn('text-[12px] lg:inline lg:text-[13px]', live && 'hidden')}>
          {receptionLabel(lastReceived, now)}
        </span>
      )}
    </>
  );
}
