import { useNavigate } from '@tanstack/react-router';
import { cn } from 'cn';
import { CalendarIcon } from 'lucide-react';
import { useState } from 'react';
import { fr } from 'react-day-picker/locale';
import { shiftDay } from '../../lib/days';
import { formatShortDay } from '../../lib/format';
import { NowDot, PeriodPicker, periodLabelClass } from '../components/period-picker';
import { buttonVariants } from '../components/ui/button';
import { Calendar } from '../components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';

// The calendar works with dates of the device's time zone; a club day "2026-11-07" is that date at midnight there.
const asDate = (day: string) =>
  new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
const asDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const weekdayLetters = 'DLMMJVS';
const monthArrow = cn(buttonVariants({ variant: 'bubble' }), 'size-[30px] p-0 aria-disabled:opacity-28');

/**
 * The day Matchs shows, between the arrows to the day before and the day after. A tap on the day opens the
 * calendar, where a dot marks each day with a match. Nothing before the club's first match, nothing after today.
 */
export function DayPicker({ day, today, played }: { day: string; today: string; played: readonly string[] }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const first = played[0] && played[0] < today ? played[0] : today;
  const at = (target: string) => (target === today ? undefined : target);
  const show = (target: string) => {
    setOpen(false);
    void navigate({
      to: '.',
      search: (current: Record<string, unknown>) => ({ ...current, jour: at(target) }),
      resetScroll: false,
    });
  };
  const name = day === today ? 'Aujourd’hui' : formatShortDay(day);
  return (
    <PeriodPicker
      label="Jour affiché"
      previous={day > first ? { search: { jour: shiftDay(day, -1) }, label: 'Jour précédent' } : null}
      next={day < today ? { search: { jour: at(shiftDay(day, 1)) }, label: 'Jour suivant' } : null}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className={periodLabelClass} aria-label={`${name}, choisir un autre jour`}>
          {day === today && <NowDot />}
          {name}
          <CalendarIcon className="text-t3" />
        </PopoverTrigger>
        {open && <div aria-hidden="true" className="fixed inset-0 z-40 bg-black/35" />}
        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-auto rounded-[22px] bg-[rgba(28,28,30,.94)] p-3 ring-0 shadow-[inset_0_.5px_0_rgba(255,255,255,.14),0_0_0_.5px_rgba(255,255,255,.06),0_30px_70px_rgba(0,0,0,.7)] backdrop-blur-[40px]"
        >
          <Calendar
            mode="single"
            locale={fr}
            selected={asDate(day)}
            defaultMonth={asDate(day)}
            onSelect={(date) => date && show(asDay(date))}
            disabled={[{ before: asDate(first) }, { after: asDate(today) }]}
            startMonth={asDate(first)}
            endMonth={asDate(today)}
            formatters={{ formatWeekdayName: (date) => weekdayLetters[date.getDay()] ?? '' }}
            modifiers={{ played: played.map(asDate) }}
            modifiersClassNames={{
              played:
                'after:pointer-events-none after:absolute after:bottom-[5px] after:left-1/2 after:z-20 after:-ml-0.5 after:size-1 after:rounded-full after:bg-t2 data-[selected=true]:after:bg-black',
            }}
            classNames={{
              month_caption: 'flex h-[30px] items-center justify-center px-[38px] pb-2.5',
              caption_label: 'font-semibold text-[15px] text-t1',
              nav: 'absolute inset-x-1 top-0 flex items-center justify-between',
              button_previous: monthArrow,
              button_next: monthArrow,
              weekday: 'flex h-6 flex-1 items-center justify-center font-semibold text-[11px] text-t3',
              week: 'mt-0.5 flex w-full gap-0.5',
              today: 'bg-transparent',
              disabled: 'text-white/20 opacity-100',
            }}
            className="bg-transparent p-0 [--cell-radius:9999px] [--cell-size:40px] [&_[data-selected-single=true]]:bg-t1 [&_[data-selected-single=true]]:font-bold [&_[data-selected-single=true]]:text-black [&_[data-slot=button]]:rounded-full! [&_[data-slot=button]]:text-[15px]"
          />
        </PopoverContent>
      </Popover>
    </PeriodPicker>
  );
}
