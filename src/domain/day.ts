/** The calendar day (YYYY-MM-DD) of a moment in the club's time zone: a match after midnight belongs to the next day. */
export function dayIn(timeZone: string, moment: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    moment,
  );
}
