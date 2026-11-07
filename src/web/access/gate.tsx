import { cn } from 'cn';
import type { ReactNode } from 'react';
import { EpicNotice, RocketLeagueLogo } from '../brand/epic-notice';
import { Input } from '../components/ui/input';

// The screens before the club: signing in, the first visit, the club out of reach. They share a slightly lighter
// black, a blue glow from the top, and the Rocket League mark with Epic's notice at the foot.

export function GatePage({
  children,
  glow = 'radial-gradient(120% 70% at 50% -10%,rgba(40,90,170,.32),rgba(6,6,7,0) 70%)',
  glowHeight = 460,
  className,
}: {
  children: ReactNode;
  glow?: string;
  glowHeight?: number;
  className?: string;
}) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-gate text-gate-text">
      <div aria-hidden="true" className="absolute inset-x-0 top-0" style={{ height: glowHeight, background: glow }} />
      <main className={cn('relative flex flex-1 flex-col px-6 lg:justify-center lg:px-5 lg:pt-16 lg:pb-24', className)}>
        {children}
      </main>
      <footer className="relative flex flex-col items-center gap-1 px-6 pt-6 pb-[34px] lg:absolute lg:inset-x-0 lg:bottom-0 lg:gap-5 lg:px-5 lg:pb-8">
        <RocketLeagueLogo />
        <EpicNotice />
      </footer>
    </div>
  );
}

/** The small capitals above a title. */
export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('text-[11px] font-bold tracking-[.1em] text-gate-muted', className)}>{children}</span>;
}

export function GateTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1
      className={cn('m-0 font-display font-extrabold tracking-[-.01em] [font-stretch:80%] [line-height:1]', className)}
    >
      {children}
    </h1>
  );
}

export function GateLead({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('m-0 text-[15px] text-gate-soft [line-height:1.45] lg:[line-height:1.5]', className)}>
      {children}
    </p>
  );
}

export function GateField({ className, ...props }: React.ComponentProps<typeof Input>) {
  return (
    <Input
      className={cn(
        'h-[54px] rounded-[14px] border-white/12 bg-gate-field px-4 font-medium text-[17px] text-gate-text shadow-none placeholder:text-[#6f7178] focus-visible:border-gate-focus focus-visible:ring-[3px] focus-visible:ring-gate-focus/25 md:text-[17px] dark:bg-gate-field',
        className,
      )}
      {...props}
    />
  );
}

export function GateLabel({ children, htmlFor }: { children: ReactNode; htmlFor: string }) {
  return (
    <label htmlFor={htmlFor} className="text-[13px] font-semibold text-gate-soft">
      {children}
    </label>
  );
}

/** A message under a form: blue for news, red for a problem. */
export function GateMessage({ tone, children }: { tone: 'info' | 'error'; children: ReactNode }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'm-0 rounded-xl px-3.5 py-3 text-[13px] leading-[1.4]',
        tone === 'info' ? 'bg-gate-focus/10 text-[#c9dcff]' : 'bg-[#ff453a]/12 text-[#ffb4ae]',
      )}
    >
      {children}
    </p>
  );
}

export const networkError = (error: unknown): string =>
  error instanceof TypeError ? 'Connexion Internet indisponible. Réessaie dans un instant.' : (error as Error).message;
