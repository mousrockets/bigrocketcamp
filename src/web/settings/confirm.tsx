import type { ReactNode } from 'react';
import { networkError } from '../access/gate';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { Button } from '../components/ui/button';

/** Asks once more before what cannot be undone: deleting an account, removing a member. */
export function Confirm({
  open,
  onOpenChange,
  title,
  children,
  action,
  pending,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  /** The button that does it, in red: "Supprimer mon compte". */
  action: string;
  pending: boolean;
  error: Error | null;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[calc(100%-32px)] gap-4 rounded-[22px] bg-[#16171b] p-5 ring-white/8 data-[size=default]:max-w-[360px] sm:data-[size=default]:max-w-[360px]">
        <AlertDialogHeader className="place-items-start gap-2 text-left">
          <AlertDialogTitle className="title-display text-[24px] [line-height:1]">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-[14px] text-t2 leading-[1.45]">{children}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="m-0 text-[13px] text-destructive leading-[1.45]">
            {networkError(error)}
          </p>
        )}
        <AlertDialogFooter className="m-0 flex-col gap-2 rounded-none border-0 bg-transparent p-0 sm:flex-col">
          <Button variant="destructive" size="cta" disabled={pending} onClick={onConfirm}>
            {action}
          </Button>
          <AlertDialogCancel variant="pill" size="cta" disabled={pending}>
            Annuler
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
