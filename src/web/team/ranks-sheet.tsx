import { useQuery } from '@tanstack/react-query';
import { cn } from 'cn';
import { formatAge, formatNumber } from '../../lib/format';
import { epicNotice } from '../components/epic-notice';
import { InfoSheet } from '../components/info-sheet';
import { Card } from '../components/ui/card';
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '../components/ui/item';
import { useNow } from '../hooks/use-now';
import { zenQuery } from '../queries';
import { rankLadder } from './ladder';

const rankIcon = (tier: number) => `/rocket-league/ranks/${tier}.png`;
const row =
  'flex-nowrap gap-3 rounded-none border-0 px-3.5 py-2 [line-height:normal] not-first:border-line not-first:border-t-[.5px]';
/** Supersonic Legend, the game's highest rank: Zen wears its icon, in gold. */
const legend = 22;

/**
 * « Les ranks », opened from Stats: every rank of 2v2 from the top, with the MMR from which it is won, and above them
 * all Zen, the best player there is, at his own rating.
 */
export function RanksSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const zen = useQuery({ ...zenQuery, enabled: open }).data?.zen ?? null;
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
            {zen && <ZenStep mmr={zen.mmr} name={zen.name} fetchedAt={zen.fetchedAt} />}
            {[...rankLadder].reverse().map((step) => (
              <Item key={step.tier} render={<li />} className={row}>
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

/** Zen's step, above Supersonic Legend: its icon in a golden light, his rating, and when it was read. */
function ZenStep({ mmr, name, fetchedAt }: { mmr: number; name: string; fetchedAt: string }) {
  const now = useNow(60_000);
  return (
    <Item
      render={<li />}
      className={cn(
        row,
        'py-2.5 [background:radial-gradient(90%_140%_at_0%_50%,color-mix(in_oklab,var(--medal-1)_16%,transparent),transparent_70%)]',
      )}
    >
      <ItemMedia className="translate-y-0 self-center">
        <img
          src={rankIcon(legend)}
          alt=""
          width={32}
          height={32}
          className="size-8 object-contain [filter:drop-shadow(0_0_6px_color-mix(in_oklab,var(--medal-1)_85%,transparent))_sepia(.35)_saturate(1.6)]"
        />
      </ItemMedia>
      <ItemContent className="min-w-0 gap-0.5 *:truncate">
        <ItemTitle className="font-semibold text-[15px] text-medal-1 [line-height:normal]">Zen</ItemTitle>
        <ItemDescription className="text-[12px] text-t3 [line-height:normal]">
          {name}, {formatAge(fetchedAt, now)}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <b className="num min-w-12 text-right text-[16px] text-medal-1">{formatNumber(mmr)}</b>
      </ItemActions>
    </Item>
  );
}
