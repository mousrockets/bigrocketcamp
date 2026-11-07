import { LoaderCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { GateTitle, Kicker } from './gate';

/** The club does not answer: the query keeps retrying on its own, the button only asks sooner. */
export function Unreachable({ retry, retrying }: { retry: () => void; retrying: boolean }) {
  return (
    <main className="flex min-h-dvh flex-col bg-gate px-6 pt-[210px] pb-12 text-gate-text lg:items-center lg:justify-center lg:px-5 lg:py-12">
      <div className="mx-auto flex w-full max-w-[520px] flex-1 flex-col items-center lg:flex-initial gap-[18px] text-center">
        <EmptyPitch />
        <Kicker className="text-[#ff7b72]">HORS LIGNE</Kicker>
        <GateTitle className="text-[36px] lg:text-[48px]">Lag de l’extrême</GateTitle>
        <p className="m-0 text-balance text-[15px] leading-[1.45] text-gate-soft lg:text-[16px] lg:leading-normal">
          Le club ne répond plus. Pas de panique, l’app réessaie toute seule. Profites-en pour faire quelques pompes.
        </p>
        <p role="status" className="m-0 mt-1 flex items-center gap-2 text-[13px] text-gate-muted lg:mt-0">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" strokeWidth={2.4} />
          Nouvelle tentative dès que le réseau revient
        </p>
        <Button
          variant="gate-outline"
          size="gate"
          className="mt-auto h-[52px] w-full lg:mt-2 lg:h-[54px] lg:w-auto"
          disabled={retrying}
          onClick={retry}
        >
          Relancer maintenant
        </Button>
      </div>
    </main>
  );
}

/** A pitch with the ball drifting between two dotted red lines: nobody on the other end. */
function EmptyPitch() {
  return (
    <svg
      role="img"
      aria-label="Terrain vide"
      viewBox="0 0 320 180"
      className="h-[130px] w-[220px] lg:h-[180px] lg:w-[320px]"
    >
      <rect x="6" y="6" width="308" height="168" rx="44" fill="none" stroke="#26272c" strokeWidth="2" />
      <path d="M160 6v168" stroke="#26272c" strokeWidth="2" />
      <circle cx="160" cy="90" r="36" fill="none" stroke="#26272c" strokeWidth="2" />
      <rect x="0" y="62" width="8" height="56" rx="3" fill="#26272c" />
      <rect x="312" y="62" width="8" height="56" rx="3" fill="#26272c" />
      <g className="animate-drift">
        <circle cx="160" cy="90" r="12" fill="#f4f5f7" />
        <path d="M114 90H96M224 90h-18" stroke="#ff453a" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 6" />
      </g>
    </svg>
  );
}
