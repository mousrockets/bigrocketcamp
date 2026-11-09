import { useNavigate } from '@tanstack/react-router';
import { cn } from 'cn';
import { CalendarIcon } from 'lucide-react';
import { useState } from 'react';
import { fr } from 'react-day-picker/locale';
import { shiftDay } from '../../lib/days';
import { formatShortDay } from '../../lib/format';
import { NowDot, PeriodCapsule, PeriodPicker, PeriodReset, periodLabelClass } from '../components/period-picker';
import { Button, buttonVariants } from '../components/ui/button';
import { Calendar } from '../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { recentDays } from './timeline';

// The calendar works with dates of the device's time zone; a club day "2026-11-07" is that date at midnight there.
const asDate = (day: string) =>
  new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
const asDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const weekdayLetters = 'DLMMJVS';
const monthArrow = cn(buttonVariants({ variant: 'bubble' }), 'size-[30px] p-0 aria-disabled:opacity-28');
const lastWeek = `${recentDays} derniers jours`;

/**
 * What Matchs shows: the last seven days by default, or the day chosen in the calendar, where a dot marks each day
 * with a match. A day has the arrows to its neighbours, and a cross back to the seven days.
 */
export function DayPicker({ day, today, played }: { day: string | null; today: string; played: readonly string[] }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const first = played[0] && played[0] < today ? played[0] : today;
  const weekFrom = shiftDay(today, 1 - recentDays);
  const show = (target: string | undefined) => {
    setOpen(false);
    void navigate({
      to: '.',
      search: (current: Record<string, unknown>) => ({ ...current, jour: target }),
      resetScroll: false,
    });
  };
  const name = day === null ? lastWeek : day === today ? 'Aujourd’hui' : formatShortDay(day);
  const calendar = (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={cn(periodLabelClass, day === null && 'px-3')} aria-label={`${name}, choisir un jour`}>
        {(day === null || day === today) && <NowDot />}
        {name}
        <CalendarIcon className="text-t3" />
      </PopoverTrigger>
      {open && <div aria-hidden="true" className="fixed inset-0 z-40 bg-black/35" />}
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-auto gap-0 rounded-[22px] bg-[rgba(28,28,30,.94)] p-3 ring-0 shadow-[inset_0_.5px_0_rgba(255,255,255,.14),0_0_0_.5px_rgba(255,255,255,.06),0_30px_70px_rgba(0,0,0,.7)] backdrop-blur-[40px]"
      >
        <Calendar
          mode="single"
          locale={fr}
          selected={day === null ? undefined : asDate(day)}
          defaultMonth={asDate(day ?? today)}
          onSelect={(date) => date && show(asDay(date))}
          disabled={[{ before: asDate(first) }, { after: asDate(today) }]}
          startMonth={asDate(first)}
          endMonth={asDate(today)}
          formatters={{ formatWeekdayName: (date) => weekdayLetters[date.getDay()] ?? '' }}
          modifiers={{
            played: played.map(asDate),
            week: day === null ? { from: asDate(weekFrom), to: asDate(today) } : [],
            weekStart: day === null ? asDate(weekFrom) : [],
            weekEnd: day === null ? asDate(today) : [],
          }}
          modifiersClassNames={{
            played:
              'after:pointer-events-none after:absolute after:bottom-[5px] after:left-1/2 after:z-20 after:-ml-0.5 after:size-1 after:rounded-full after:bg-t2 data-[selected=true]:after:bg-black',
            week: 'rounded-none! bg-link/16 first:rounded-l-full! last:rounded-r-full!',
            weekStart: 'rounded-l-full!',
            weekEnd: 'rounded-r-full!',
          }}
          classNames={{
            month_caption: 'flex h-[30px] items-center justify-center px-[38px] pb-2.5',
            caption_label: 'font-semibold text-[15px] text-t1',
            nav: 'absolute inset-x-1 top-0 flex items-center justify-between',
            button_previous: monthArrow,
            button_next: monthArrow,
            weekday: 'flex h-6 flex-1 items-center justify-center font-semibold text-[11px] text-t3',
            week: 'mt-0.5 flex w-full gap-0.5',
            today: '',
            disabled: 'text-white/20 opacity-100',
          }}
          className="bg-transparent p-0 [--cell-radius:9999px] [--cell-size:40px] [&_[data-selected-single=true]]:bg-t1 [&_[data-selected-single=true]]:font-bold [&_[data-selected-single=true]]:text-black [&_[data-slot=button]]:rounded-full! [&_[data-slot=button]]:text-[15px]"
        />
        <div className="px-1.5 pt-2.5 pb-0.5">
          <Button
            className="h-9 w-full gap-1.5 rounded-xl bg-link/16 font-semibold text-[14px] text-link hover:bg-link/22"
            onClick={() => show(undefined)}
          >
            <NowDot />
            {lastWeek}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
  if (day === null) return <PeriodCapsule label="Période affichée">{calendar}</PeriodCapsule>;
  return (
    <span className="flex items-center gap-1.5">
      <PeriodPicker
        label="Jour affiché"
        previous={day > first ? { search: { jour: shiftDay(day, -1) }, label: 'Jour précédent' } : null}
        next={day < today ? { search: { jour: shiftDay(day, 1) }, label: 'Jour suivant' } : null}
      >
        {calendar}
      </PeriodPicker>
      <PeriodReset search={{ jour: undefined }} label={`Revenir aux ${lastWeek}`} />
    </span>
  );
}
