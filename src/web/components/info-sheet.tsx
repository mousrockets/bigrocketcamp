import { cn } from 'cn';
import type { ReactNode } from 'react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';

/** The dimmed and blurred page behind a sheet. */
export const sheetOverlayClass =
  'bg-black/50 backdrop-blur-[6px] supports-backdrop-filter:backdrop-blur-[6px] lg:bg-black/55';

/** A sheet from the bottom on a phone, a window in the middle on a computer, in frosted glass. */
export const sheetClass =
  'top-auto bottom-0 left-0 flex max-w-none translate-x-0 translate-y-0 data-open:animate-sheet-in flex-col gap-[22px] rounded-t-[34px] rounded-b-none bg-[rgba(28,28,30,.9)] px-5 pt-2 pb-[34px] text-[16px] text-t1 ring-0 [line-height:normal] shadow-[inset_0_.5px_0_rgba(255,255,255,.14),0_-20px_60px_rgba(0,0,0,.5)] backdrop-blur-[40px] backdrop-saturate-[1.8] sm:max-w-none lg:top-1/2 lg:bottom-auto lg:left-1/2 lg:max-w-[440px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:data-open:animate-pop-in lg:rounded-[30px] lg:bg-[rgba(28,28,30,.88)] lg:px-7 lg:pt-[26px] lg:pb-7 lg:shadow-[inset_0_.5px_0_rgba(255,255,255,.16),0_0_0_.5px_rgba(255,255,255,.06),0_40px_100px_rgba(0,0,0,.6)]';

/**
 * A sheet to read, over the open tab: its title and a line under it, then its content, which scrolls. It closes
 * with a tap beside it, Escape, or a close button only screen readers show.
 */
export function InfoSheet({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showCloseButton={false}
        overlayClassName={sheetOverlayClass}
        className={cn(
          sheetClass,
          'max-h-[86dvh] gap-5 overflow-y-auto overscroll-contain [scrollbar-width:none] lg:max-w-[480px] [&>*]:shrink-0',
        )}
      >
        <i aria-hidden="true" className="-mb-2 h-[5px] w-9 self-center rounded-[3px] bg-white/22 lg:hidden" />
        <div className="flex flex-col gap-1.5">
          <DialogTitle className="title-display text-[26px] [line-height:1]">{title}</DialogTitle>
          <DialogDescription className="text-[14px] text-t2">{description}</DialogDescription>
        </div>
        {children}
        <DialogClose className="sr-only">Fermer</DialogClose>
      </DialogContent>
    </Dialog>
  );
}
