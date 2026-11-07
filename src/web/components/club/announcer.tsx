import { useSyncExternalStore } from 'react';
import { Confetti } from './confetti';

// The broadcast lower third that announces a new defeat or a new badge over any page, for 2.6 seconds.

export type Announcement = { id: number; kind: 'loss' | 'badge'; text: string };

let current: Announcement | null = null;
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};

export function announce(kind: Announcement['kind'], text: string): void {
  const id = Date.now() + Math.random();
  current = { id, kind, text };
  emit();
  setTimeout(() => {
    if (current?.id === id) {
      current = null;
      emit();
    }
  }, 2600);
}

/** What is announced right now, if anything. */
export const currentAnnouncement = (): Announcement | null => current;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function Announcer() {
  const shown = useSyncExternalStore(subscribe, currentAnnouncement);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+12px)] z-[70] flex justify-center px-4"
    >
      {shown && (
        <div
          key={shown.id}
          className="flex max-w-[520px] items-stretch overflow-hidden rounded-[14px] border border-border bg-popover shadow-[0_18px_50px_rgb(0_0_0/0.45)] [animation:brc-banner_2.6s_cubic-bezier(.2,1.2,.4,1)_forwards]"
        >
          <span
            className={
              shown.kind === 'loss'
                ? 'flex items-center bg-cost px-3 font-display text-[13px] tracking-[0.08em] text-cost-foreground uppercase'
                : 'flex items-center bg-primary px-3 font-display text-[13px] tracking-[0.08em] text-primary-foreground uppercase'
            }
          >
            {shown.kind === 'loss' ? 'Défaite' : 'Badge'}
          </span>
          <p className="px-3.5 py-2.5 font-display text-[17px] leading-tight text-balance">{shown.text}</p>
        </div>
      )}
      {shown?.kind === 'badge' && <Confetti key={shown.id} amount={60} />}
    </div>
  );
}
