import { cn } from 'cn';

// Epic's fan content policy: the Rocket League logo is never altered nor used to identify the club, and every
// page that shows it, or a rank icon, carries this notice (public/rocket-league/README.md).

export const epicNotice =
  'Ce produit n’est pas officiel et n’a pas l’approbation d’Epic Games. Rocket League et ses éléments appartiennent à Epic Games, Inc.';

export function RocketLeagueLogo({ className }: { className?: string }) {
  return (
    <img
      className={cn('opacity-85', className)}
      src="/rocket-league/logo.svg"
      alt="Rocket League"
      width={56}
      height={28}
    />
  );
}

/** The notice at the foot of a page: small, centred, discreet. */
export function EpicNotice({ className }: { className?: string }) {
  return (
    <p className={cn('mx-auto max-w-[400px] text-center text-[11px] leading-[1.45] text-[#8e9097]', className)}>
      {epicNotice}
    </p>
  );
}
