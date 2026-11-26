import { cn } from 'cn';
import { formatNumber } from '../../lib/format';
import { epicNotice } from '../components/epic-notice';
import { InfoSheet } from '../components/info-sheet';
import { Card } from '../components/ui/card';
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from '../components/ui/item';
import { rankLadder } from './ladder';

const rankIcon = (tier: number) => `/rocket-league/ranks/${tier}.png`;

/** « Les ranks », opened from Stats: every rank of 2v2 from the top, with the MMR from which it is won. */
export function RanksSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <InfoSheet
      open={open}
      onClose={onClose}
      title="Les ranks"
      description="MMR 2v2 à atteindre pour décrocher chaque rank."
    >
      <section aria-label="Les paliers" className="flex flex-col gap-2">
        <span className="flex justify-between px-3.5">
          <span className="label-caps">Les paliers</span>
          <span aria-hidden="true" className="label-caps">
            MMR
          </span>
        </span>
        <Card variant="glass" className="gap-0">
          <ul className="m-0 list-none p-0">
            {[...rankLadder].reverse().map((step) => (
              <Item
                key={step.tier}
                render={<li />}
                className={cn(
                  'flex-nowrap gap-3 rounded-none border-0 px-3.5 py-2 [line-height:normal]',
                  'not-first:border-line not-first:border-t-[.5px]',
                )}
              >
                <ItemMedia className="translate-y-0 self-center">
                  <img src={rankIcon(step.tier)} alt="" width={32} height={32} className="size-8 object-contain" />
                </ItemMedia>
                <ItemContent className="min-w-0 gap-0.5 *:truncate">
                  <ItemTitle className="font-medium text-[15px] [line-height:normal]">{step.name}</ItemTitle>
                </ItemContent>
                <ItemActions>
                  <b className="num min-w-12 text-right text-[16px] text-t2">{formatNumber(step.mmr)}</b>
                </ItemActions>
              </Item>
            ))}
          </ul>
        </Card>
        <p className="m-0 px-1 text-[11px] text-t3 [line-height:1.5]">{epicNotice}</p>
      </section>
    </InfoSheet>
  );
}
