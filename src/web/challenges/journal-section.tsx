import { cn } from 'cn';
import type { ExerciseType } from '../../lib/domain';
import { formatNumber, formatWeek } from '../../lib/format';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import type { JournalDay, JournalEntry, JournalTotal } from './journal';

const figures: { type: ExerciseType; label: string; unit?: string; value: (count: number) => number }[] = [
  { type: 'pushups', label: 'Pompes', value: (count) => count },
  { type: 'plank', label: 'Gainage', unit: 'min', value: (seconds) => seconds / 60 },
  { type: 'crunches', label: 'Abdos', value: (count) => count },
];

/**
 * « Le journal »: what each player did in the week shown, exercise by exercise, then every exercise declared,
 * newest first, by day. It follows the podium's week.
 */
export function ExerciseJournal({
  totals,
  days,
  week,
  current,
}: {
  totals: JournalTotal[];
  days: JournalDay[];
  /** The Monday of the week shown. */
  week: string;
  current: boolean;
}) {
  return (
    <div className="flex flex-col gap-[18px]">
      <span className="flex flex-col gap-1.5">
        <span className="label-caps">{current ? 'Les exercices de la semaine' : `Semaine du ${formatWeek(week)}`}</span>
        <h2 className="title-display text-[24px] [line-height:normal]">Le journal</h2>
      </span>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-10">
        <div className="flex flex-col gap-2.5 lg:max-w-[420px] lg:flex-[1_1_340px]">
          <span className="font-semibold text-[13px] text-t2">Le total</span>
          <Card variant="glass">
            <ul aria-label="Total de la semaine" className="m-0 list-none p-0">
              {totals.map((total) => (
                <TotalRow key={total.name} total={total} />
              ))}
            </ul>
          </Card>
        </div>
        <div className="flex flex-col gap-6 lg:flex-[999_1_420px]">
          {days.map((day) => (
            <div key={day.label} className="flex flex-col gap-2.5">
              <span className="font-semibold text-[13px] text-t2">{day.label}</span>
              <Card variant="glass">
                <ul aria-label={day.label} className="m-0 list-none p-0">
                  {day.entries.map((entry) => (
                    <EntryRow key={entry.id} entry={entry} />
                  ))}
                </ul>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Name({ name, me }: { name: string; me: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <b className="truncate font-semibold">{name}</b>
      {me && <Badge variant="me">TOI</Badge>}
    </span>
  );
}

const row = 'px-4 [&+&]:border-line [&+&]:border-t-[.5px]';

function TotalRow({ total }: { total: JournalTotal }) {
  return (
    <li className={cn(row, 'flex flex-col gap-3 py-3.5 text-[17px]')}>
      <Name name={total.name} me={total.me} />
      <div className="grid grid-cols-3 gap-2">
        {figures.map(({ type, label, unit, value }) => {
          const count = total.counts[type] ?? 0;
          return (
            <span key={type} className="flex flex-col gap-[5px]">
              <span className="text-[11px] text-t3">{label}</span>
              <b className={cn('num text-[20px] [line-height:1]', count === 0 ? 'text-t3' : 'text-t1')}>
                {formatNumber(value(count))}
                {unit && <span className="text-[13px] text-t3"> {unit}</span>}
              </b>
            </span>
          );
        })}
      </div>
    </li>
  );
}

function EntryRow({ entry }: { entry: JournalEntry }) {
  return (
    <li className={cn(row, 'flex items-center gap-3 py-3 text-[15px]')}>
      <span className="num shrink-0 text-[14px] text-t3">{entry.clock}</span>
      <span className="min-w-0 flex-1">
        <Name name={entry.name} me={entry.me} />
      </span>
      <span className="shrink-0 text-t2">{entry.what}</span>
    </li>
  );
}
