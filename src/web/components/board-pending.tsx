import type { ReactNode } from 'react';
import { Skeleton } from './ui/skeleton';

// What a tab shows until the club's results first arrive: why they are late, or the shape of what is coming. The
// shape fades in after a moment, so that a board read at once from the browser never flashes it.

export function BoardPending({
  error,
  className,
  children,
}: {
  error: string;
  className?: string;
  children: ReactNode;
}) {
  if (error) return <p className="m-0 px-5 pt-10 text-[15px] text-t2 lg:px-0 lg:pt-0">{error}</p>;
  return (
    <div role="status" aria-label="Les résultats arrivent" className="animate-rise [animation-delay:.3s]">
      <div aria-hidden="true" className={className}>
        {children}
      </div>
    </div>
  );
}

/** The small capitals and the title of a section, still to come. */
export function TitleSkeleton() {
  return (
    <span className="flex flex-col gap-2.5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-6 w-44" />
    </span>
  );
}
