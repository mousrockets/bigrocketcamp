import { cn } from 'cn';
import type { ComponentType, ReactNode } from 'react';
import { useMediaQuery } from '../hooks/use-media-query';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from './ui/drawer';

/** The dimmed and blurred page behind a sheet. */
export const sheetOverlayClass =
  'bg-black/50 backdrop-blur-[6px] supports-backdrop-filter:backdrop-blur-[6px] lg:bg-black/55';

/** A sheet from the bottom on a phone, a window in the middle on a computer, in frosted glass. */
export const sheetClass =
  'top-auto bottom-0 left-0 flex max-w-none translate-x-0 translate-y-0 data-open:animate-sheet-in flex-col gap-[22px] rounded-t-[34px] rounded-b-none bg-[rgba(28,28,30,.9)] px-5 pt-2 pb-[34px] text-[16px] text-t1 ring-0 [line-height:normal] shadow-[inset_0_.5px_0_rgba(255,255,255,.14),0_-20px_60px_rgba(0,0,0,.5)] backdrop-blur-[40px] backdrop-saturate-[1.8] sm:max-w-none lg:top-1/2 lg:bottom-auto lg:left-1/2 lg:max-w-[440px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:data-open:animate-pop-in lg:rounded-[30px] lg:bg-[rgba(28,28,30,.88)] lg:px-7 lg:pt-[26px] lg:pb-7 lg:shadow-[inset_0_.5px_0_rgba(255,255,255,.16),0_0_0_.5px_rgba(255,255,255,.06),0_40px_100px_rgba(0,0,0,.6)]';

/** The phone's sheet, as the Drawer draws it: the same glass, and it follows the finger that pulls it down. */
const swipeSheetClass =
  'rounded-t-[34px] border-0 bg-[rgba(28,28,30,.9)] text-[16px] text-t1 [line-height:normal] shadow-[inset_0_.5px_0_rgba(255,255,255,.14),0_-20px_60px_rgba(0,0,0,.5)] backdrop-blur-[40px] backdrop-saturate-[1.8] [--drawer-bleed-background:rgba(28,28,30,.9)] data-[swipe-axis=y]:[--drawer-content-max-height:86dvh]';

const scrollingClass = 'flex flex-col gap-5 overflow-y-auto overscroll-contain [scrollbar-width:none] [&>*]:shrink-0';

interface InfoSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  children: ReactNode;
}

/**
 * A sheet to read, over the open tab: its title and a line under it, then its content, which scrolls. On a phone
 * it comes up from the bottom and goes away when pulled down; on a computer it is a window. Either closes with a
 * tap beside it, Escape, or a close button only screen readers show.
 */
export function InfoSheet(props: InfoSheetProps) {
  const computer = useMediaQuery('(min-width: 64rem)');
  return computer ? <WindowSheet {...props} /> : <SwipeSheet {...props} />;
}

function SwipeSheet({ open, onClose, title, description, children }: InfoSheetProps) {
  return (
    <Drawer open={open} onOpenChange={(next) => !next && onClose()}>
      <DrawerContent overlayClassName={sheetOverlayClass} className={swipeSheetClass}>
        <div className={cn(scrollingClass, 'px-5 pt-2 pb-[34px]')}>
          <i aria-hidden="true" className="-mb-2 h-[5px] w-9 self-center rounded-[3px] bg-white/22" />
          <SheetBody title={title} description={description} Title={DrawerTitle} Description={DrawerDescription}>
            {children}
          </SheetBody>
          <DrawerClose className="sr-only">Fermer</DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function WindowSheet({ open, onClose, title, description, children }: InfoSheetProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showCloseButton={false}
        overlayClassName={sheetOverlayClass}
        className={cn(sheetClass, scrollingClass, 'max-h-[86dvh] lg:max-w-[480px]')}
      >
        <SheetBody title={title} description={description} Title={DialogTitle} Description={DialogDescription}>
          {children}
        </SheetBody>
        <DialogClose className="sr-only">Fermer</DialogClose>
      </DialogContent>
    </Dialog>
  );
}

/** The title and its line, with the parts the Drawer or the Dialog names for screen readers, then the content. */
function SheetBody({
  title,
  description,
  Title,
  Description,
  children,
}: {
  title: string;
  description: string;
  Title: ComponentType<{ className?: string; children: ReactNode }>;
  Description: ComponentType<{ className?: string; children: ReactNode }>;
  children: ReactNode;
}) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Title className="title-display text-[26px] [line-height:1]">{title}</Title>
        <Description className="text-[14px] text-t2">{description}</Description>
      </div>
      {children}
    </>
  );
}
