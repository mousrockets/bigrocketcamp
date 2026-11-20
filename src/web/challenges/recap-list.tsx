import { Link } from '@tanstack/react-router';
import { Play } from 'lucide-react';
import { count, formatLongMonth } from '../../lib/format';
import { Card } from '../components/ui/card';
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '../components/ui/item';
import type { RecapMonth } from './recap';

/** « Rejoue ton mois »: each month gone by with something to tell, which opens its recap over the tab. */
export function RecapList({ months }: { months: RecapMonth[] }) {
  return (
    <div className="flex flex-col gap-[18px]">
      <span className="flex flex-col gap-1.5">
        <span className="label-caps">Récap du mois</span>
        <h2 className="title-display text-[24px]">Rejoue ton mois</h2>
      </span>
      <Card variant="glass">
        <ul aria-label="Récaps des mois passés" className="m-0 list-none p-0">
          {months.map(({ month, matches, pushups }) => (
            <li key={month} className="border-line not-first:border-t-[.5px]">
              <Item
                render={
                  <Link
                    to="."
                    search={(search: Record<string, unknown>) => ({ ...search, recap: month })}
                    resetScroll={false}
                  />
                }
                className="flex-nowrap gap-3 rounded-none border-0 px-4 py-3 [line-height:normal]"
              >
                <ItemContent className="min-w-0 gap-[3px] *:truncate">
                  <ItemTitle className="font-semibold text-[15px] [line-height:normal]">
                    {formatLongMonth(month)}
                  </ItemTitle>
                  <ItemDescription className="text-[12px] text-t3 [line-height:normal]">
                    {count(matches, 'match', 'matchs')} · {count(pushups, 'pompe')}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <span className="flex size-8 items-center justify-center rounded-full bg-white/10 text-t1">
                    <Play aria-hidden="true" strokeWidth={2.4} className="size-3.5 translate-x-px" />
                  </span>
                </ItemActions>
              </Item>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
