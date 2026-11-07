import { useEffect, useState } from 'react';
import { currentSeason, seasonEndLabel, seasonTiming } from '../../../lib/season';
import { Badge } from '../ui/badge';
import { Panel } from './page';

// The end of the competitive season: an estimate from a community calendar until Psyonix announces it.

const twoDigits = (value: number) => String(value).padStart(2, '0');

export function SeasonCountdown() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => {
      if (!document.hidden) setNow(Date.now());
    };
    update();
    const timer = setInterval(update, currentSeason.confirmedEndAt ? 1000 : 60_000);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  const timing = now === null ? null : seasonTiming(now);
  const precise = !!currentSeason.confirmedEndAt;
  const clock = !timing
    ? '—'
    : timing.exact
      ? timing.ended
        ? 'Terminée'
        : `${timing.days} j ${twoDigits(timing.hours)}:${twoDigits(timing.minutes)}:${twoDigits(timing.seconds)}`
      : timing.estimateReached
        ? 'À confirmer'
        : `J−${timing.days}`;
  const caption = precise
    ? timing?.ended
      ? 'Échéance annoncée atteinte'
      : 'avant la fin annoncée'
    : timing && !timing.exact && timing.estimateReached
      ? 'Date indicative atteinte · annonce à vérifier'
      : 'avant la date estimée';
  return (
    <Panel
      aria-label={`Fin de la saison ${currentSeason.number}`}
      className="flex-row flex-wrap items-center justify-between gap-4 p-4"
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="kicker">Fin de saison {currentSeason.number}</span>
          <Badge variant="neutral" className="text-[10px]">
            {precise ? 'Date annoncée' : 'Estimation'}
          </Badge>
        </span>
        <b className="text-[15px] font-semibold first-letter:uppercase">
          <time dateTime={currentSeason.confirmedEndAt || currentSeason.estimatedEndDay}>{seasonEndLabel()}</time>
        </b>
        <small className="text-xs text-muted-foreground">
          {precise ? 'Heure de Paris.' : 'Heure de fin du compétitif pas encore annoncée.'}{' '}
          {!precise && (
            <>
              <a href={currentSeason.estimateSource} target="_blank" rel="noopener noreferrer">
                Calendrier communautaire
              </a>
              {' · '}
            </>
          )}
          <a href={currentSeason.officialSource} target="_blank" rel="noopener noreferrer">
            Infos officielles ↗
          </a>
        </small>
      </div>
      <div role="timer" aria-live="off" className="flex flex-col items-end">
        <b className="font-numeral text-4xl leading-none">{clock}</b>
        <span className="text-[11px] font-semibold text-muted-foreground">{caption}</span>
      </div>
    </Panel>
  );
}
