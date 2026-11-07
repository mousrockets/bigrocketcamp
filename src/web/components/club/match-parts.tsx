import { cn } from 'cn';
import type { HistoryMatch } from '../../../lib/match-history';
import type { Result } from '../../board/types';
import { Badge } from '../ui/badge';

// The pieces every match shows: its result tag and its score, the opponents' goals in orange after a defeat.
// The tag speaks the design's playful voice: "GG" for a win, "AÏE" for a defeat.

export type Match = HistoryMatch<Result>;

const outcomeLabels = {
  victory: 'GG',
  defeat: 'AÏE',
  'between-members': 'Entre membres',
  review: 'À vérifier',
} as const;

export function OutcomeTag({ match, className }: { match: Match; className?: string | undefined }) {
  const variant = match.outcome === 'defeat' ? 'cost' : match.outcome === 'victory' ? 'settled' : 'neutral';
  return (
    <Badge variant={variant} className={cn('border-0', className)}>
      {outcomeLabels[match.outcome]}
    </Badge>
  );
}

export function outcomeText(match: Match): string {
  return outcomeLabels[match.outcome];
}

/** "2 – 3": the club's goals, then the opponents'; `spaced` sets the dash between spaces, as the big detail score. */
export function Score({
  match,
  className,
  dashClassName,
  spaced = false,
}: {
  match: Match;
  className?: string;
  dashClassName?: string;
  spaced?: boolean;
}) {
  if (!match.score) return <b className={cn('font-numeral text-faint', className)}>—</b>;
  const [ours, theirs] = match.score;
  return (
    <b className={cn('font-numeral whitespace-nowrap', className)}>
      <span className="sr-only">
        {ours} à {theirs}
      </span>
      <span aria-hidden="true">
        {ours}
        <span className={cn(!spaced && 'px-[0.12em]', 'text-faint', dashClassName)}>{spaced ? ' – ' : '–'}</span>
        <span className={match.outcome === 'defeat' ? 'text-cost' : undefined}>{theirs}</span>
      </span>
    </b>
  );
}

/** The pushups a match adds to a player: orange when it costs, grey otherwise. */
export function Pushups({ value, className }: { value: number; className?: string }) {
  return (
    <b className={cn('font-numeral', value > 0 ? 'text-cost' : 'text-muted-foreground', className)}>
      {value > 0 ? `+${value}` : '0'}
    </b>
  );
}

const timeFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });

/** "21:40" when the match was received, or nothing. */
export function matchTime(match: Match): string {
  const at = match.received ? new Date(match.received) : null;
  return at && !Number.isNaN(at.getTime()) ? timeFormat.format(at) : '';
}
