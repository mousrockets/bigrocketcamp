import { Link } from '@tanstack/react-router';
import { cn } from 'cn';
import type { ComponentProps, ReactNode } from 'react';
import { epicNotice } from '../components/epic-notice';
import { Card } from '../components/ui/card';
import { Field, FieldError, FieldLabel } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { Item, ItemMedia } from '../components/ui/item';
import { BackChevron } from './icons';

// The pieces every Réglages screen is made of, after iOS Settings: grouped cards of rows, a title, a way back.

/** The blue glow at the top of every tab. */
function Glow() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-[360px] bg-[radial-gradient(90%_60%_at_50%_-12%,rgba(70,120,220,.16),rgba(0,0,0,0)_70%)] lg:h-[440px] lg:bg-[radial-gradient(60%_70%_at_30%_-15%,rgba(70,120,220,.13),rgba(0,0,0,0)_70%)]"
    />
  );
}

const pageClass = 'relative flex min-h-dvh flex-col pb-[120px] lg:px-[clamp(20px,5vw,72px)] lg:pt-11 lg:pb-16';
const wrapClass = 'relative flex w-full flex-col lg:mx-auto lg:max-w-[1060px] lg:gap-14';
const contentClass =
  'flex animate-rise flex-col gap-7 px-4 [animation-delay:.06s] lg:max-w-[640px] lg:gap-[30px] lg:px-0 lg:pt-0';

/** The Réglages tab itself: its title, its groups, then the version and Epic's notice among them. */
export function SettingsHomePage({ kicker, children }: { kicker: string; children: ReactNode }) {
  return (
    <main className={cn(pageClass, 'pt-[max(60px,calc(env(safe-area-inset-top)+12px))]')}>
      <Glow />
      <div className={wrapClass}>
        <header className="flex animate-rise items-end justify-between gap-4 px-5 pt-2 lg:p-0">
          <span className="flex flex-col gap-1.5">
            <span className="label-caps">{kicker}</span>
            <h1 className="title-display text-[36px] [line-height:1] lg:text-[40px]">Réglages</h1>
          </span>
        </header>
        <div className={cn(contentClass, 'pt-7')}>{children}</div>
      </div>
    </main>
  );
}

/** A screen opened from Réglages: the way back, a small kicker above its title, its groups, Epic's notice. */
export function SettingsPage({ kicker, title, children }: { kicker: string; title: string; children: ReactNode }) {
  return (
    <main className={cn(pageClass, 'pt-[max(40px,calc(env(safe-area-inset-top)-4px))]')}>
      <Glow />
      <div className={wrapClass}>
        <header className="flex animate-rise flex-col gap-1.5 px-5 pt-0 lg:p-0">
          <Link
            to="/reglages"
            className="-ml-3 mb-[-2px] inline-flex h-11 w-fit items-center gap-1.5 text-[17px] text-link hover:text-[#8fc0ff] lg:mb-2.5 lg:ml-0 lg:h-auto lg:text-[15px]"
          >
            <BackChevron />
            Réglages
          </Link>
          <span className="label-caps">{kicker}</span>
          <h1 className="title-display text-[34px] [line-height:1] lg:text-[40px]">{title}</h1>
        </header>
        <div className={cn(contentClass, 'pt-6')}>{children}</div>
        <p className="mx-6 mt-10 mb-0 text-center text-[11px] text-t3 [line-height:1.5] lg:m-0 lg:text-left lg:[line-height:normal]">
          {epicNotice}
        </p>
      </div>
    </main>
  );
}

/** A screen only the club's admins open. */
export function AdminsOnly({ title }: { title: string }) {
  return (
    <SettingsPage kicker="Réservé aux admins" title={title}>
      <Note className="px-1 text-[14px] text-t2">
        Cette page est réservée aux admins du club. Demande-leur un coup de main.
      </Note>
    </SettingsPage>
  );
}

/** A group of rows, with its small capitals above and its note below. */
export function SettingsGroup({ label, note, children }: { label?: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2" aria-label={label}>
      {label && <span className="label-caps px-4">{label}</span>}
      {children}
      {note}
    </section>
  );
}

/** Frosted glass, as on the players' cards but quieter. */
export const settingsCardClass =
  'rounded-[22px] bg-[linear-gradient(155deg,rgba(255,255,255,.08),rgba(255,255,255,.025)_45%,rgba(255,255,255,.04))] text-t1 shadow-[inset_0_1px_0_rgba(255,255,255,.12),inset_0_0_0_.5px_rgba(255,255,255,.07),0_20px_40px_-24px_rgba(0,0,0,.8)]';

export function SettingsCard({ className, ...props }: ComponentProps<typeof Card>) {
  return (
    <Card
      className={cn(settingsCardClass, 'gap-0 py-0 text-[16px] ring-0 [line-height:normal]', className)}
      {...props}
    />
  );
}

/** One row of a group; the line between two rows starts after the icon. */
export function SettingsRow({ className, render, ...props }: ComponentProps<typeof Item>) {
  return (
    <Item
      render={render}
      className={cn(
        'relative min-h-[52px] flex-nowrap gap-3 rounded-none border-0 px-4 py-0 text-[16px] text-t1 [line-height:normal]',
        "not-first:before:absolute not-first:before:top-0 not-first:before:right-0 not-first:before:left-[58px] not-first:before:h-[.5px] not-first:before:bg-line not-first:before:content-['']",
        render && 'w-full text-left transition-colors duration-200 hover:bg-white/4 active:bg-white/7',
        className,
      )}
      {...props}
    />
  );
}

/** The small glass tile that holds a row's icon. */
export function RowIcon({ children }: { children: ReactNode }) {
  return (
    <ItemMedia
      aria-hidden="true"
      className="size-[30px] translate-y-0 self-center rounded-[9px] bg-linear-to-b from-white/14 to-white/6 text-t1 shadow-[inset_0_.5px_0_rgba(255,255,255,.25)]"
    >
      {children}
    </ItemMedia>
  );
}

/** A row's words, cut with an ellipsis when too long. */
export function RowLabel({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cn('min-w-0 flex-1 truncate', className)}>{children}</span>;
}

/** A row's current value, after its label. */
export function RowValue({ children }: { children: ReactNode }) {
  return <span className="max-w-[46%] truncate text-[15px] text-t3">{children}</span>;
}

/** A field on one line, its label on the left and its value on the right; the line between two starts at the edge. */
export function FieldRow({
  id,
  label,
  invalid,
  children,
}: {
  id?: string;
  label: string;
  invalid?: boolean;
  children: ReactNode;
}) {
  return (
    <Field
      orientation="horizontal"
      data-invalid={invalid || undefined}
      className="relative min-h-[52px] gap-3 px-4 data-[invalid=true]:text-t1 not-first:before:absolute not-first:before:top-0 not-first:before:right-0 not-first:before:left-4 not-first:before:h-[.5px] not-first:before:bg-line not-first:before:content-['']"
    >
      <FieldLabel
        htmlFor={id}
        className="w-[116px] flex-none! font-normal text-[16px] text-t1 [line-height:normal] group-data-[disabled=true]/field:opacity-100"
      >
        {label}
      </FieldLabel>
      {children}
    </Field>
  );
}

/** The input of a `FieldRow`: no frame, written on the right. */
export function RowInput({ className, ...props }: ComponentProps<typeof Input>) {
  return (
    <Input
      className={cn(
        'h-auto min-w-0 flex-1 rounded-none border-0 bg-transparent p-0 text-right text-[16px] text-t1 shadow-none [line-height:normal] placeholder:text-t3 focus-visible:text-white focus-visible:ring-0 disabled:bg-transparent disabled:text-t3 disabled:opacity-100 aria-invalid:ring-0 md:text-[16px] dark:bg-transparent dark:disabled:bg-transparent',
        className,
      )}
      {...props}
    />
  );
}

/** Small grey words under a group. */
export function Note({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cn('m-0 px-4 text-[12px] text-t3 leading-[1.45]', className)}>{children}</p>;
}

/** What went wrong, under a group or a form, in the words of the API or of the schema. */
export function ErrorNote({ errors }: { errors: readonly unknown[] }) {
  const messages = errors
    .map((error) => (typeof error === 'string' ? error : (error as { message?: string } | undefined)?.message))
    .filter((message): message is string => Boolean(message));
  return (
    <FieldError
      className="m-0 px-4 text-[12px] text-destructive leading-[1.45]"
      errors={[...new Set(messages)].map((message) => ({ message }))}
    />
  );
}

/** Two letters for a member without a picture: "nokouki" → "NO", "chat-pris-tea" → "CP", "kevin-74000" → "KE". */
export function initials(name: string): string {
  const words = name.split(/[^\p{L}]+/u).filter(Boolean);
  const [first = '', second] = words;
  return (second ? `${first[0]}${second[0]}` : first.slice(0, 2)).toUpperCase() || '?';
}
