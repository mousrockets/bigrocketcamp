import { cn } from 'cn';
import { formatHundredths, formatNumber } from '../../lib/format';
import { Badge } from '../components/ui/badge';
import type { ComparedPlayer, StatFormat } from './comparison';

/** A stat's figure as the page writes it; a dash when there is none. */
export function formatted(value: number | null, format: StatFormat): string {
  if (value === null) return '–';
  if (format === 'percent') return `${formatNumber(Math.round(value))} %`;
  // Two decimals, always: averages of a few matches are close, and one decimal would show a tie the bars deny.
  if (format === 'perMatch') return formatHundredths(value);
  // The game sends ball speeds in km/h, and distances in Unreal units: centimetres.
  if (format === 'speed') return `${formatNumber(Math.round(value))}\u00a0km/h`;
  if (format === 'distance') return `${formatNumber(Math.round(value / 10) / 10)}\u00a0m`;
  if (format === 'seconds') return `${formatNumber(Math.round(value * 10) / 10)}\u00a0s`;
  return formatNumber(Math.round(value));
}

/**
 * A player's pseudo, and TOI for the member. Their rank shows on their card, not again by every name. In a narrow
 * column, the pseudo wraps rather than losing its end.
 */
export function PlayerName({
  player,
  wrap,
  className,
}: {
  player: ComparedPlayer;
  wrap?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('flex min-w-0 items-center gap-1.5', wrap && 'flex-wrap gap-y-1', className)}>
      <span className={wrap ? '[overflow-wrap:anywhere]' : 'truncate'}>{player.shown}</span>
      {player.me && <Badge variant="me">TOI</Badge>}
    </span>
  );
}

/** What the member lacks to take a prize from its leader, in the prize's own unit. */
export function gapOf(leader: number | null, mine: number, format: StatFormat): string {
  const gap = Math.max(0, (leader ?? 0) - mine);
  if (format === 'percent') return `${formatNumber(Math.round(gap))} point${Math.round(gap) >= 2 ? 's' : ''}`;
  if (format === 'perMatch') return `${formatted(gap, format)} par match`;
  return formatted(gap, format);
}
