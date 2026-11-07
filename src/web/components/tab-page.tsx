import { cn } from 'cn';
import type { ReactNode } from 'react';
import { epicNotice } from './epic-notice';

// The frame of a tab: the blue light from the top, the header with its small capitals and big title, and Epic's
// notice at the foot. On a phone the content runs the full width and leaves room for the tab bar; on a computer it
// sits in a 1060 px column, 56 px between blocks.

export function TabPage({
  kicker,
  title,
  aside,
  children,
}: {
  /** The small capitals above the title, often the day. */
  kicker: ReactNode;
  title: string;
  /** What sits at the right of the header, like « Direct ». */
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="relative flex min-h-dvh flex-col pt-[max(60px,calc(env(safe-area-inset-top)+12px))] pb-[120px] lg:px-[clamp(20px,5vw,72px)] lg:pt-11 lg:pb-16">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[360px] bg-[radial-gradient(90%_60%_at_50%_-12%,rgba(70,120,220,.16),rgba(0,0,0,0)_70%)] lg:h-[440px] lg:bg-[radial-gradient(60%_70%_at_30%_-15%,rgba(70,120,220,.13),rgba(0,0,0,0)_70%)]"
      />
      <div className="relative flex w-full flex-col lg:mx-auto lg:max-w-[1060px] lg:gap-14">
        <header className="flex animate-rise items-end justify-between gap-4 px-5 pt-2 lg:p-0">
          <span className="flex flex-col gap-1.5">
            <span className="label-caps">{kicker}</span>
            <h1 className="title-display text-[36px] [line-height:1] lg:text-[40px]">{title}</h1>
          </span>
          {aside && <span className="flex items-center gap-[18px] pb-1 text-[13px] text-t2">{aside}</span>}
        </header>
        {children}
        <TabNotice />
      </div>
    </main>
  );
}

/** Epic's notice at the foot of a tab: centred on a phone, left on a computer. */
export function TabNotice({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        'mx-6 mt-10 mb-0 text-center text-[11px] text-t3 [line-height:1.5] lg:m-0 lg:text-left lg:[line-height:normal]',
        className,
      )}
    >
      {epicNotice}
    </p>
  );
}
