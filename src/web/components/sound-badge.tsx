import { useQuery } from '@tanstack/react-query';
import { cn } from 'cn';
import { Lock } from 'lucide-react';
import { type CSSProperties, useState } from 'react';
import { formatNumber } from '../../lib/format';
import { type SoundId, soundFamilies, soundOf, sounds } from '../../lib/sounds';
import { soundCollectionsQuery } from '../queries';
import { rankRgb } from '../team/stats';
import { playSound } from './sound-player';
import { Button } from './ui/button';

// The sound badges: a medal glowing in its family's rank colour, and the collection of every player. The movements
// live in styles.css.

export const badgeUrl = (id: SoundId) => `/badges/${id}.png`;

/** A won badge plays its sound at a tap, and pulses while it plays. */
export function usePlayingSound() {
  const [playing, setPlaying] = useState<SoundId | null>(null);
  const play = (id: SoundId) => {
    setPlaying(id);
    playSound(id, () => setPlaying((current) => (current === id ? null : current)));
  };
  return [playing, play] as const;
}

export function SoundMedal({
  sound,
  locked = false,
  playing = false,
  className,
}: {
  sound: SoundId;
  locked?: boolean;
  playing?: boolean;
  className?: string;
}) {
  const { tier } = soundFamilies[soundOf(sound).family];
  return (
    <span
      aria-hidden="true"
      data-locked={locked || undefined}
      data-playing={playing || undefined}
      className={cn('badge-medal size-[52px]', className)}
      style={{ '--medal': rankRgb(tier) } as CSSProperties}
    >
      {/* A locked badge shows its silhouette only, under a lock. */}
      <img src={badgeUrl(sound)} alt="" width={112} height={112} loading="lazy" decoding="async" />
      {locked && <Lock className="absolute inset-0 m-auto size-4 text-t2 drop-shadow-[0_1px_2px_rgba(0,0,0,.8)]" />}
    </span>
  );
}

/** A player's badges, family by family; a tap on a won badge plays its sound. A complete family shines. */
export function SoundCollection({ player }: { player: string }) {
  const { data, isError } = useQuery(soundCollectionsQuery);
  const [playing, play] = usePlayingSound();
  const won = new Map(
    (data?.find((collection) => collection.player === player)?.badges ?? []).flatMap(({ sound, count }) =>
      sound ? [[sound, count] as const] : [],
    ),
  );
  return (
    <section aria-label="Badges sons" className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <span className="flex flex-col gap-1.5">
          <span className="label-caps">Badges sons</span>
          <span className="text-[14px] text-t2">
            {isError ? 'Badges indisponibles pour l’instant.' : 'Une dette remboursée, un son au hasard.'}
          </span>
        </span>
        <b className="num text-[40px] [line-height:.8]">
          {formatNumber(won.size)}
          <span className="text-[20px] text-t3">/{sounds.length}</span>
        </b>
      </div>
      <ol className="m-0 flex list-none flex-col gap-1 p-0">
        {soundFamilies.map((family, familyIndex) => {
          const members = sounds.filter((sound) => sound.family === familyIndex);
          const complete = members.every((sound) => won.has(sound.id));
          return (
            <li
              key={family.name}
              data-complete={complete || undefined}
              className="badge-family"
              style={{ '--medal': rankRgb(family.tier) } as CSSProperties}
            >
              {complete && <span className="badge-family-name label-caps">{family.name} · complète</span>}
              <ul
                aria-label={complete ? `${family.name}, famille complète` : family.name}
                className="m-0 grid list-none grid-cols-5 gap-x-1 p-0"
              >
                {members.map(({ id, name }, index) => {
                  const count = won.get(id);
                  return (
                    <li
                      key={id}
                      className="flex animate-rise justify-center"
                      style={{ animationDelay: `${0.15 + (familyIndex * 5 + index) * 0.02}s` }}
                    >
                      {count ? (
                        <Button
                          variant="medal"
                          size="medal"
                          aria-label={count > 1 ? `${name}, gagné ${formatNumber(count)} fois` : name}
                          title="Écouter"
                          onClick={() => play(id)}
                        >
                          <span className="relative">
                            <SoundMedal sound={id} playing={playing === id} />
                            {count > 1 && (
                              <span className="num absolute -top-1 -right-1.5 rounded-full bg-black/80 px-1.5 py-px text-[10px] text-t1 shadow-[inset_0_0_0_.5px_rgba(255,255,255,.15)]">
                                ×{formatNumber(count)}
                              </span>
                            )}
                          </span>
                          <span className="line-clamp-2 text-center text-[10.5px] leading-tight">{name}</span>
                        </Button>
                      ) : (
                        <span
                          role="img"
                          aria-label="Badge à débloquer"
                          className="flex flex-col items-center gap-1.5 py-1.5"
                        >
                          <SoundMedal sound={id} locked />
                          <span aria-hidden="true" className="text-[10.5px] text-t3 leading-tight">
                            ???
                          </span>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
