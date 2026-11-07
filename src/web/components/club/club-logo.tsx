import { cn } from 'cn';
import { useClubLogo } from '../../club';

// The club's mark: the logo its administrators sent or, by default, the design's "BRC" tile. The design sizes it by
// place, each with its own corner and letter size.
const sizes = {
  34: 'size-[34px] rounded-[10px] text-[15px]',
  36: 'size-9 rounded-[10px] text-[15px]',
  52: 'size-[52px] rounded-[15px] text-xl',
  56: 'size-14 rounded-2xl text-[22px]',
  64: 'size-16 rounded-[18px] text-2xl',
  72: 'size-[72px] rounded-[20px] text-[26px]',
} as const;

/** The same sizes from the wide-screen breakpoint on. */
const wideSizes = {
  34: 'lg:size-[34px] lg:rounded-[10px] lg:text-[15px]',
  36: 'lg:size-9 lg:rounded-[10px] lg:text-[15px]',
  52: 'lg:size-[52px] lg:rounded-[15px] lg:text-xl',
  56: 'lg:size-14 lg:rounded-2xl lg:text-[22px]',
  64: 'lg:size-16 lg:rounded-[18px] lg:text-2xl',
  72: 'lg:size-[72px] lg:rounded-[20px] lg:text-[26px]',
} as const;

export type ClubLogoSize = keyof typeof sizes;

export function ClubLogo({
  size,
  wide,
  label,
  className,
}: {
  size: ClubLogoSize;
  /** Its size on a wide screen, when the design changes it there. */
  wide?: ClubLogoSize;
  /** Read aloud when the logo means something on its own ("Logo actuel"); otherwise it is decoration. */
  label?: string;
  className?: string;
}) {
  const logo = useClubLogo();
  const frame = cn('shrink-0', sizes[size], wide && wideSizes[wide], className);
  if (logo) {
    return (
      <img src={logo} alt={label ?? ''} width={size} height={size} className={cn(frame, 'bg-inverse object-cover')} />
    );
  }
  const tile = cn(
    frame,
    'flex items-center justify-center bg-inverse font-heading font-black text-inverse-foreground [font-stretch:75%]',
  );
  return label ? (
    <span role="img" aria-label={label} className={tile}>
      BRC
    </span>
  ) : (
    <span aria-hidden="true" className={tile}>
      BRC
    </span>
  );
}
