import { cn } from 'cn';
import { type CSSProperties, useEffect, useState } from 'react';
import { formatNumber } from '../../lib/format';
import { type SoundId, soundFamilies, soundOf, sounds } from '../../lib/sounds';
import { SoundMedal, usePlayingSound } from '../components/sound-badge';
import { Button } from '../components/ui/button';
import { useMediaQuery } from '../hooks/use-media-query';
import { rankLightRgb, rankRgb } from '../team/stats';

// The screen after a series: a quick chat, the debt ring filling up to what is now paid, and the debt counting down
// to what is left. A series that clears the debt turns green, with a check and a bigger burst, and shows the sound badge
// it won.

const quickChats = ['Nice shot!', 'What a save!', 'Calculated.', 'OMG!', 'Wow!', 'Savage!'];
const cleanSheetChats = ['Clean sheet!', 'Ardoise propre !', 'Savage!'];
/** How long the ring takes to fill and the figure to count down. */
const countMs = 1250;
const countDelayMs = 600;
/** The series can be taken back this long after the celebration settles. */
export const undoMs = 10_000;
const undoDelayMs = 2250;

export interface Payment {
  /** Owed before the series. */
  before: number;
  /** Owed after it. */
  after: number;
  /** What the series was worth in pushups. */
  pushups: number;
  /** All that was ever owed: the ring's full turn. */
  owed: number;
}

/** The sound badge a cleared debt won. */
export interface Prize {
  sound: SoundId;
  /** First time this member drew it. */
  unlocked: boolean;
  /** Its sound is playing, right after the draw. */
  playing?: boolean;
  /** What this new badge completes, once the collection is read again. */
  completes?: { family: boolean; collection: boolean };
}

/** The figure counting down from `from` to `to` over the ring's fill. */
function useCountdown(from: number, to: number, still: boolean): number {
  const [value, setValue] = useState(still ? to : from);
  useEffect(() => {
    if (still || from === to) return;
    const steps = Math.ceil(from - to);
    let shown = from;
    let timer = 0;
    const start = window.setTimeout(() => {
      timer = window.setInterval(() => {
        shown = Math.max(to, shown - 1);
        setValue(shown);
        if (shown <= to) clearInterval(timer);
      }, countMs / steps);
    }, countDelayMs);
    return () => {
      clearTimeout(start);
      clearInterval(timer);
    };
  }, [from, to, still]);
  return value;
}

/** The quick chat, a new one at each tap. */
function useQuickChat(chats: readonly string[]) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * chats.length));
  return [chats[index % chats.length] ?? '', () => setIndex((current) => current + 1)] as const;
}

export function Celebration({
  payment,
  prize,
  onContinue,
  onUndo,
  undoing,
}: {
  payment: Payment;
  prize: Prize | null;
  onContinue: () => void;
  onUndo: () => void;
  undoing: boolean;
}) {
  const { before, after, pushups, owed } = payment;
  const clean = after === 0;
  const computer = useMediaQuery('(min-width: 64rem)');
  const still = useMediaQuery('(prefers-reduced-motion: reduce)');
  const shown = useCountdown(before, after, still);
  const [headline, nextChat] = useQuickChat(clean ? cleanSheetChats : quickChats);
  const [canUndo, setCanUndo] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setCanUndo(false), undoDelayMs + undoMs);
    return () => clearTimeout(timer);
  }, []);

  // The ring: 30 px of margin around it, a 16 px stroke.
  const size = computer ? 360 : 296;
  const centre = size / 2;
  const radius = centre - 30;
  const circumference = 2 * Math.PI * radius;
  const paidBefore = owed > 0 ? Math.min(1, (owed - before) / owed) : 1;
  const paidAfter = owed > 0 ? Math.min(1, (owed - after) / owed) : 1;
  const angle = paidAfter * 2 * Math.PI;
  const tip = { x: centre + radius * Math.sin(angle), y: centre - radius * Math.cos(angle) };
  const tint = clean ? { light: '#e9fff1', strong: '#4cd38a', burst: '#7ee2a8', delta: '#4cd38a' } : undefined;

  return (
    <div
      role="status"
      aria-label={
        clean
          ? `Série validée. Moins ${formatNumber(pushups)} pompes : ardoise propre.`
          : `Série validée. Moins ${formatNumber(pushups)} pompes, il en reste ${formatNumber(after)}.`
      }
      className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-black px-6 pt-[72px] pb-10 text-center text-t1 lg:py-16"
    >
      <div className="flex w-full max-w-[342px] flex-1 flex-col items-center justify-center gap-7 lg:max-w-[520px] lg:gap-9">
        <h1
          className="celebration-headline m-0 font-display font-black text-[50px] uppercase italic tracking-[-.005em] [font-stretch:72%] [line-height:.92] lg:text-[64px]"
          style={{ '--glint': clean ? '#c9f5da' : '#dfe9ff' } as CSSProperties}
        >
          <button
            type="button"
            title="Toucher pour un autre quick chat"
            onClick={nextChat}
            className="cursor-pointer border-0 bg-transparent p-0 font-[inherit] text-inherit uppercase italic [font-stretch:inherit] [letter-spacing:inherit] [line-height:inherit]"
          >
            {headline}
          </button>
        </h1>

        <div className="relative animate-ring-in" style={{ width: size, height: size }}>
          <i
            aria-hidden="true"
            className="absolute animate-ripple rounded-full motion-reduce:hidden"
            style={
              {
                left: 30,
                top: 30,
                width: size - 60,
                height: size - 60,
                border: clean ? '2px solid rgba(76,211,138,.9)' : '1.5px solid rgba(130,170,255,.9)',
                '--ripple': clean ? 1.5 : 1.3,
              } as CSSProperties
            }
          />
          <div className="absolute inset-0 animate-land" style={{ '--land': clean ? 1.06 : 1.035 } as CSSProperties}>
            <svg
              aria-hidden="true"
              width={size}
              height={size}
              viewBox={`0 0 ${size} ${size}`}
              className="absolute inset-0 overflow-visible"
            >
              <defs>
                <linearGradient id="celebration-ring" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor={tint?.light ?? '#ffffff'} />
                  <stop offset="1" stopColor={tint?.strong ?? '#8fb4ff'} />
                </linearGradient>
                <filter id="celebration-glow" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="7" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <circle cx={centre} cy={centre} r={radius} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="16" />
              <circle
                className="celebration-arc"
                cx={centre}
                cy={centre}
                r={radius}
                fill="none"
                stroke="url(#celebration-ring)"
                strokeWidth="16"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - paidAfter)}
                transform={`rotate(-90 ${centre} ${centre})`}
                filter="url(#celebration-glow)"
                style={
                  {
                    '--from': circumference * (1 - paidBefore),
                    '--to': circumference * (1 - paidAfter),
                  } as CSSProperties
                }
              />
              <g
                className="celebration-tip"
                style={
                  {
                    transformOrigin: `${centre}px ${centre}px`,
                    '--from': `${paidBefore * 360}deg`,
                    '--to': `${paidAfter * 360}deg`,
                  } as CSSProperties
                }
              >
                <circle cx={centre} cy="30" r="9" fill="#fff" filter="url(#celebration-glow)" />
              </g>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 lg:gap-2.5">
              <span className="relative flex items-center justify-center">
                <b
                  aria-hidden="true"
                  className="num absolute -top-[43px] animate-float-off text-[22px] tracking-[-.035em] motion-reduce:hidden lg:-top-[55px] lg:text-[26px]"
                  style={{ color: tint?.delta ?? '#9fc0ff' }}
                >
                  −{formatNumber(pushups)}
                </b>
                <b
                  aria-live="polite"
                  className={cn(
                    'num text-[104px] tracking-[-.035em] [line-height:.8] lg:text-[132px]',
                    clean && 'animate-fade-away',
                  )}
                >
                  {formatNumber(shown)}
                </b>
                {clean && (
                  <svg aria-hidden="true" viewBox="0 0 48 48" className="absolute size-[93px] lg:size-[118px]">
                    <path
                      d="M12 25l8 8 16-17"
                      fill="none"
                      stroke="#4cd38a"
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      pathLength={1}
                      className="animate-draw [stroke-dasharray:1] [stroke-dashoffset:1] drop-shadow-[0_0_10px_rgba(76,211,138,.6)]"
                    />
                  </svg>
                )}
              </span>
              <span className={cn('font-medium text-[15px] text-t2', clean && 'animate-fade-away')}>à rendre</span>
            </div>
          </div>
          <Burst clean={clean} radius={radius} centre={centre} tip={tip} color={tint?.burst ?? '#bcd2ff'} />
        </div>

        {prize ? (
          <PrizeBadge prize={prize} />
        ) : (
          <p className="m-0 animate-up text-balance text-[17px] text-t2 [animation-delay:2.1s] [line-height:1.4] lg:text-[19px]">
            {clean
              ? 'Plus une seule pompe à rendre. Free-play mérité.'
              : `Les bras en béton armé. Encore ${formatNumber(after)}, et c’est free-play.`}
          </p>
        )}
      </div>

      <div className="flex w-full max-w-[342px] animate-up flex-col gap-1 [animation-delay:2.25s] lg:max-w-[380px]">
        <Button variant="cta" size="cta-xl" onClick={onContinue}>
          Continuer
        </Button>
        {canUndo && (
          <Button variant="quiet" size="quiet" disabled={undoing} onClick={onUndo}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16">
              <circle cx="8" cy="8" r="6.5" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="2" />
              <circle
                cx="8"
                cy="8"
                r="6.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                pathLength={1}
                strokeDasharray="1"
                transform="rotate(-90 8 8)"
                className="animate-countdown"
              />
            </svg>
            {undoing ? 'Annulation…' : 'Annuler la série'}
          </Button>
        )}
      </div>
      {prize?.completes?.collection && <CollectionComplete />}
    </div>
  );
}

/** The badge won, spun in once the ring has landed; it plays its sound again at a tap. */
function PrizeBadge({ prize }: { prize: Prize }) {
  const { name, family } = soundOf(prize.sound);
  const [replaying, replay] = usePlayingSound();
  return (
    <Button
      variant="medal"
      size="medal"
      className="w-auto overflow-visible px-5"
      aria-label={`${prize.unlocked ? 'Nouveau badge' : 'Badge déjà gagné'} : ${name}. Écouter.`}
      onClick={() => replay(prize.sound)}
    >
      <span className="relative">
        {prize.unlocked && <i aria-hidden="true" className="badge-rays motion-reduce:hidden" />}
        <SoundMedal
          sound={prize.sound}
          playing={prize.playing || replaying === prize.sound}
          className="badge-reveal size-[104px] lg:size-[120px]"
        />
      </span>
      <span className={cn('label-caps animate-up [animation-delay:2.7s]', prize.unlocked && 'text-win')}>
        {prize.unlocked ? 'Nouveau badge' : 'Déjà dans ta collection'}
      </span>
      <span className="animate-up font-semibold text-[17px] text-t1 [animation-delay:2.8s]">{name}</span>
      {prize.completes?.family && (
        <span
          className="badge-family-name label-caps animate-pop-in"
          style={{ '--medal': rankRgb(soundFamilies[family].tier) } as CSSProperties}
        >
          Famille complète · {soundFamilies[family].name}
        </span>
      )}
    </Button>
  );
}

/** The fortieth badge: every sound won, celebrated over the whole screen until a tap. */
function CollectionComplete() {
  const [shown, setShown] = useState(true);
  if (!shown) return null;
  const legend = [22, 13, 16, 19, 7, 10]
    .map(
      (tier, index) =>
        `rgba(${rankRgb(tier)},.55) ${index * 20}deg ${index * 20 + 8}deg, transparent ${index * 20 + 8}deg ${index * 20 + 20}deg`,
    )
    .join(', ');
  return (
    <section
      aria-label="Collection complète"
      className="absolute inset-0 z-10 flex animate-up flex-col items-center justify-center gap-4 overflow-hidden bg-black/90 px-6 text-center [animation-delay:3.4s]"
    >
      <i
        aria-hidden="true"
        className="legend-rays motion-reduce:hidden"
        style={{ '--legend': legend } as CSSProperties}
      />
      <span className="label-caps relative">Collection complète</span>
      <b
        className="num celebration-headline relative text-[96px] [line-height:.85] lg:text-[128px]"
        style={{ '--glint': `rgb(${rankLightRgb(22)})` } as CSSProperties}
      >
        {formatNumber(sounds.length)}/{formatNumber(sounds.length)}
      </b>
      <p className="relative m-0 text-balance text-[17px] text-t2">
        Tous les sons, tous les badges. Supersonic Legend de la collection.
      </p>
      <Button
        variant="cta"
        size="cta-xl"
        className="relative mt-4 w-full max-w-[342px]"
        onClick={() => setShown(false)}
      >
        Trop fort
      </Button>
    </section>
  );
}

/** Sparks flying off where the ring lands, or all around it when the debt is cleared. */
function Burst({
  clean,
  radius,
  centre,
  tip,
  color,
}: {
  clean: boolean;
  radius: number;
  centre: number;
  tip: { x: number; y: number };
  color: string;
}) {
  const count = clean ? 30 : 16;
  const from = clean ? radius + 16 : 10;
  return Array.from({ length: count }, (_, index) => {
    const angle = clean
      ? 24 * Math.floor(index / 2) + (index % 2) * 19
      : 90 * Math.floor(index / 4) + ([0, 30, 45, 74][index % 4] ?? 0);
    const to = clean ? from + 60 + ((37 * index) % 50) : 46 + ((29 * index) % 40);
    return (
      <i
        // biome-ignore lint/suspicious/noArrayIndexKey: the sparks are fixed, the index is their identity.
        key={index}
        aria-hidden="true"
        className="celebration-burst motion-reduce:hidden"
        style={
          {
            left: clean ? centre : tip.x,
            top: clean ? centre : tip.y,
            height: clean ? 10 + (index % 12) : 8 + (index % 10),
            background: index % 3 === 0 ? color : '#ffffff',
            color: index % 3 === 0 ? color : '#ffffff',
            '--a': `${angle}deg`,
            '--r0': `${-from}px`,
            '--r1': `${-to}px`,
            animationDelay: `${1.85 + (clean ? (index % 5) * 0.02 : 0)}s`,
          } as CSSProperties
        }
      />
    );
  });
}
