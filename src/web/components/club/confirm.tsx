import type { ReactNode } from 'react';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

/** Asks before an action that cannot be taken back (removing a member, deleting one's account). */
export function Confirm({
  open,
  onOpenChange,
  title,
  children,
  action,
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  action: string;
  onConfirm: () => void;
  busy?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 rounded-[22px] bg-popover p-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{title}</DialogTitle>
          <DialogDescription className="text-sm leading-[1.45] text-soft">{children}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="-mx-5 -mb-5 rounded-b-[22px] bg-transparent p-5 pt-0">
          <DialogClose render={<Button variant="outline" className="h-11 rounded-xl px-4" />}>Annuler</DialogClose>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={onConfirm}
            className="h-11 rounded-xl px-4 font-semibold"
          >
            {action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
