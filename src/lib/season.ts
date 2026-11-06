export interface Season {
  number: number;
  estimatedEndDay: string;
  confirmedEndAt: string | null;
  estimateSource: string;
  officialSource: string;
}

// Checked on 2026-11-06: Psyonix has not announced the competitive S24 closing
// time. December 9 is a community calendar estimate, not a confirmed deadline.
export const currentSeason: Season = {
  number: 24,
  estimatedEndDay: '2026-12-09',
  confirmedEndAt: null,
  estimateSource: 'https://ggseason.com/rocketleague/',
  officialSource: 'https://www.epicgames.com/help/c-37599050/c-32343914/a15022797?lang=fr',
};

export type SeasonTiming =
  | { exact: true; ended: boolean; days: number; hours: number; minutes: number; seconds: number }
  | { exact: false; ended: false; days: number; estimateReached: boolean };

const parisDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const dayNumber = (day: string) => Date.parse(`${day}T12:00:00Z`) / 86_400_000;

export function seasonTiming(now: number, season: Season = currentSeason): SeasonTiming {
  if (season.confirmedEndAt) {
    const seconds = Math.max(0, Math.ceil((Date.parse(season.confirmedEndAt) - now) / 1000));
    return {
      exact: true,
      ended: seconds === 0,
      days: Math.floor(seconds / 86_400),
      hours: Math.floor((seconds % 86_400) / 3600),
      minutes: Math.floor((seconds % 3600) / 60),
      seconds: seconds % 60,
    };
  }
  // Calendar days in Paris, independent of the viewer's zone and DST day length.
  const days = Math.round(dayNumber(season.estimatedEndDay) - dayNumber(parisDate.format(now)));
  return { exact: false, ended: false, days: Math.max(0, days), estimateReached: days <= 0 };
}

export function seasonEndLabel(season: Season = currentSeason): string {
  const value = season.confirmedEndAt || `${season.estimatedEndDay}T12:00:00Z`;
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(season.confirmedEndAt ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(value));
}
