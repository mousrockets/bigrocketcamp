import { Link } from '@tanstack/react-router';
import { cn } from 'cn';
import type { CSSProperties } from 'react';
import { formatNumber } from '../../lib/format';
import { useBoardState } from '../board';
import { useClub } from '../club';
import { epicNotice } from '../components/epic-notice';
import { InfoSheet } from '../components/info-sheet';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '../components/ui/item';
import { Progress } from '../components/ui/progress';
import { climbOf, type RankStep, rankLadder, type SoloLine, soloLines, soloReading } from './ladder';
import { rankRgb } from './stats';

const rankIcon = (tier: number) => `/rocket-league/ranks/${tier}.png`;
const row =
  'flex-nowrap gap-3 rounded-none border-0 px-3.5 [line-height:normal] not-first:border-line not-first:border-t-[.5px]';
const words = 'min-w-0 gap-0.5 *:truncate';

/** « Les ranks »: the member's solo account and the MMR left to the next rank, the club's solo accounts, the ladder. */
export function RanksSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { roster, me } = useClub();
  const { board } = useBoardState();
  const ranks = board?.doublesRanks ?? [];
  const lines = soloLines(ranks, roster, me.duoPseudo);
  const mine = soloReading(ranks.find((rank) => rank.player === me.duoPseudo));
  return (
    <InfoSheet open={open} onClose={onClose} title="Les ranks" description="MMR 2v2 des comptes solo.">
      {mine ? <MyClimb tier={mine.tier} mmr={mine.mmr} pseudo={me.soloPseudo} /> : <NoSolo named={!!me.soloPseudo} />}
      {lines.length > 0 && <ClubLines lines={lines} />}
      <Ladder />
    </InfoSheet>
  );
}

/** The member's solo account, in its rank's colour, and how far it is from the next rank. */
function MyClimb({ tier, mmr, pseudo }: { tier: number; mmr: number; pseudo: string | null }) {
  const climb = climbOf(tier, mmr);
  if (!climb) return null;
  const { current, next, left, percent } = climb;
  return (
    <section
      aria-label="Ton compte solo"
      className="flex flex-col gap-[18px] overflow-hidden rounded-3xl px-[18px] pt-5 pb-[18px] [background:radial-gradient(120%_90%_at_0%_0%,rgba(var(--rank),.45),rgba(var(--rank),.08)_60%),rgba(255,255,255,.04)] shadow-[inset_0_1px_0_rgba(255,255,255,.2),inset_0_0_0_.5px_rgba(var(--rank),.4),0_24px_50px_-24px_rgba(var(--rank),.7)]"
      style={{ '--rank': rankRgb(tier) } as CSSProperties}
    >
      <div className="flex items-center gap-3.5">
        <img
          src={rankIcon(tier)}
          alt={`Icône de rank ${current.name}`}
          width={64}
          height={64}
          className="size-16 shrink-0 object-contain drop-shadow-[0_8px_18px_rgba(0,0,0,.45)]"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1 *:truncate">
          <span className="label-caps">Ton compte solo</span>
          <b className="font-semibold text-[16px] tracking-[-.01em]">{current.name}</b>
          {pseudo && <span className="text-[13px] text-t3">{pseudo}</span>}
        </span>
        <b className="num shrink-0 text-[40px] [line-height:.8]">{formatNumber(mmr)}</b>
      </div>
      {next ? (
        <Progress
          value={percent}
          aria-label={`Vers ${next.name}`}
          className="flex-col-reverse gap-2.5 [&_[data-slot=progress-indicator]]:origin-left [&_[data-slot=progress-indicator]]:animate-grow [&_[data-slot=progress-indicator]]:rounded-[4px] [&_[data-slot=progress-indicator]]:bg-[rgb(var(--rank))] [&_[data-slot=progress-indicator]]:shadow-[0_0_14px_rgba(var(--rank),.8)] [&_[data-slot=progress-track]]:h-2 [&_[data-slot=progress-track]]:rounded-[4px] [&_[data-slot=progress-track]]:bg-white/10"
        >
          <div className="flex w-full items-center justify-between text-[12px] text-t3 tabular-nums">
            <StepEnd step={current} />
            <span className="font-semibold text-[13px] text-t1">
              {left > 0 ? (
                <>
                  Encore <b className="num text-[16px]">{formatNumber(left)}</b> MMR
                </>
              ) : (
                'Promo à portée'
              )}
            </span>
            <StepEnd step={next} after />
          </div>
        </Progress>
      ) : (
        <p className="m-0 font-semibold text-[13px]">Tout en haut de l’échelle. Respect.</p>
      )}
    </section>
  );
}

function StepEnd({ step, after = false }: { step: RankStep; after?: boolean }) {
  return (
    <span className={cn('flex items-center gap-1.5', after && 'flex-row-reverse')}>
      <img src={rankIcon(step.tier)} alt="" width={18} height={18} className="size-[18px] object-contain" />
      {formatNumber(step.mmr)}
    </span>
  );
}

/** No solo account to place: the member named none, or the rank source has not read it yet. */
function NoSolo({ named }: { named: boolean }) {
  return (
    <Card variant="glass" className="gap-1 px-4 py-3.5">
      <b className="font-semibold text-[15px]">{named ? 'Ton compte solo arrive' : 'Pas de compte solo'}</b>
      <span className="text-[13px] text-t3">
        {named ? (
          'Son rank sera là après le prochain relevé.'
        ) : (
          <>
            Donne ton pseudo solo dans{' '}
            <Link to="/reglages/compte" className="text-link">
              Réglages
            </Link>{' '}
            pour te placer sur l’échelle.
          </>
        )}
      </span>
    </Card>
  );
}

function ClubLines({ lines }: { lines: SoloLine[] }) {
  return (
    <section aria-label="Le club" className="flex flex-col gap-2">
      <span className="label-caps px-1">Le club</span>
      <Card variant="glass" className="gap-0">
        <ol className="m-0 list-none p-0">
          {lines.map((line) => (
            <Item key={line.player} render={<li />} className={cn(row, 'py-2.5')}>
              <b className="num w-3 shrink-0 text-[15px] text-t3">{line.position}</b>
              <ItemMedia className="translate-y-0 self-center">
                <img src={rankIcon(line.step.tier)} alt="" width={32} height={32} className="size-8 object-contain" />
              </ItemMedia>
              <ItemContent className={words}>
                <span className="flex min-w-0 items-center gap-1.5">
                  <ItemTitle className="truncate font-semibold text-[15px] [line-height:normal]">{line.name}</ItemTitle>
                  {line.me && <Badge variant="me">TOI</Badge>}
                </span>
                <ItemDescription className="text-[12px] text-t3 [line-height:normal]">{line.step.name}</ItemDescription>
              </ItemContent>
              <ItemActions className="flex-col items-end gap-0.5">
                <span className="flex items-center gap-[7px]">
                  <i
                    aria-hidden="true"
                    className="size-[7px] rounded-full"
                    style={{ background: `rgb(${rankRgb(line.step.tier)})` }}
                  />
                  <b className="num text-[20px] [line-height:1]">{formatNumber(line.mmr)}</b>
                </span>
                {line.best !== null && (
                  <span className="flex items-baseline gap-1 text-[11px] text-t3 [line-height:normal]">
                    Peak <b className="num font-semibold text-[14px] text-t2">{formatNumber(line.best)}</b>
                  </span>
                )}
              </ItemActions>
            </Item>
          ))}
        </ol>
      </Card>
    </section>
  );
}

/** Every rank from the top, with the MMR from which it is won. */
function Ladder() {
  return (
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
            <Item key={step.tier} render={<li />} className={cn(row, 'py-2')}>
              <ItemMedia className="translate-y-0 self-center">
                <img src={rankIcon(step.tier)} alt="" width={32} height={32} className="size-8 object-contain" />
              </ItemMedia>
              <ItemContent className={words}>
                <ItemTitle className="font-medium text-[15px] [line-height:normal]">{step.name}</ItemTitle>
              </ItemContent>
              <ItemActions>
                <b className="num min-w-12 text-right text-[16px] text-t2">{formatNumber(step.mmr)}</b>
              </ItemActions>
            </Item>
          ))}
        </ul>
      </Card>
      <p className="m-0 px-1 text-[12px] text-t3">MMR à atteindre pour décrocher chaque rank.</p>
      <p className="m-0 px-1 text-[11px] text-t3 [line-height:1.5]">{epicNotice}</p>
    </section>
  );
}
