import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from 'cn';
import { type ReactNode, useEffect, useState } from 'react';
import { formatAge, formatWhen } from '../../lib/format';
import { networkError } from '../access/gate';
import { useClub } from '../club';
import { isLive } from '../components/live-status';
import { Button } from '../components/ui/button';
import { useNow } from '../hooks/use-now';
import { type CollectorDevice, collectorsQuery } from '../queries';
import { createPairingCode, revokeCollector } from '../writes';
import { CollectorIcon, CopyIcon } from './icons';
import { ErrorNote, SettingsCard, SettingsGroup, SettingsPage } from './parts';

// The Windows collector sends the member's matches from their PC. It pairs once with a code shown here, which
// works ten minutes, once; the member revokes a PC they no longer use.

const statsApiSettings = '[TAGame.MatchStatsExporter_TA]\nPacketSendRate=10\nPort=0\nWebPort=49124';

interface Pairing {
  code: string;
  expires: string;
  /** The collectors paired before the code: a new one in the list means the code was used. */
  knownIds: string[];
}

export function CollectorSettings() {
  const { data: devices = [], error } = useQuery(collectorsQuery);
  return (
    <SettingsPage kicker="Scores en direct" title="Collecteur">
      {devices.map((device) => (
        <PairedCollector key={device.id} device={device} />
      ))}
      {error && devices.length === 0 && <ErrorNote errors={[networkError(error)]} />}
      <PairingCode devices={devices} />
      <SettingsGroup label="À régler une seule fois">
        <SettingsCard>
          <Step number={1}>Ferme Rocket League, puis ouvre son dossier d’installation depuis Epic Games.</Step>
          <Step number={2}>
            <span className="flex min-w-0 flex-1 flex-col gap-2.5">
              <span>
                Dans <b className="font-semibold">TAGame\Config</b>, ouvre{' '}
                <b className="font-semibold">TAStatsAPI.ini</b> et remplace ces valeurs.
              </span>
              <pre className="m-0 overflow-x-auto whitespace-pre rounded-[12px] bg-black/35 px-3.5 py-3 font-mono text-[13px] text-t2 leading-[1.6] shadow-[inset_0_0_0_.5px_rgba(255,255,255,.07)]">
                {statsApiSettings}
              </pre>
              <CopyButton text={statsApiSettings} className="self-start">
                Copier les réglages
              </CopyButton>
            </span>
          </Step>
          <Step number={3}>Relance le jeu. Les scores arrivent tout seuls pendant les parties.</Step>
        </SettingsCard>
      </SettingsGroup>
    </SettingsPage>
  );
}

/** A paired PC: green and pulsing while its matches come in, with the way to revoke it. */
function PairedCollector({ device }: { device: CollectorDevice }) {
  const { me } = useClub();
  const queryClient = useQueryClient();
  const now = useNow(30_000);
  const revoke = useMutation({
    mutationFn: revokeCollector,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: collectorsQuery.queryKey }),
  });
  const active = isLive(device.lastSeen, now);
  const status = device.lastSeen
    ? `${active ? 'Actif' : 'En veille'} · dernier contact ${active ? formatWhen(device.lastSeen, now) : formatAge(device.lastSeen, now)}`
    : 'Pas encore de match reçu';
  return (
    <SettingsGroup note={revoke.error && <ErrorNote errors={[networkError(revoke.error)]} />}>
      <SettingsCard className="flex-row items-center gap-3.5 px-4 py-[18px]">
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-[12px] bg-linear-to-b from-white/14 to-white/6 shadow-[inset_0_.5px_0_rgba(255,255,255,.25)]"
        >
          <CollectorIcon size={22} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <b className="truncate font-semibold text-[16px]">PC de {me.duoPseudo}</b>
          <span className="flex items-center gap-[7px] text-[13px] text-t3">
            <i
              aria-hidden="true"
              className={cn('size-[7px] shrink-0 rounded-full', active ? 'animate-pulse-ring bg-switch-on' : 'bg-t3')}
            />
            {status}
          </span>
        </span>
        <Button variant="pill-danger" size="pill" disabled={revoke.isPending} onClick={() => revoke.mutate(device.id)}>
          Révoquer
        </Button>
      </SettingsCard>
    </SettingsGroup>
  );
}

/** The code to type in the collector of a new PC, until it is used or expires. */
function PairingCode({ devices }: { devices: CollectorDevice[] }) {
  const { refetch } = useQuery(collectorsQuery);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const now = useNow(1_000);
  const create = useMutation({
    mutationFn: createPairingCode,
    onSuccess: ({ code, expires }) => setPairing({ code, expires, knownIds: devices.map((device) => device.id) }),
  });

  // While a code is shown, the list follows: the code goes away once a new PC shows up.
  useEffect(() => {
    if (!pairing) return;
    const timer = setInterval(async () => {
      if (Date.parse(pairing.expires) <= Date.now()) {
        setPairing(null);
        return;
      }
      const { data: list } = await refetch();
      if (list?.some((device) => !pairing.knownIds.includes(device.id))) setPairing(null);
    }, 4000);
    return () => clearInterval(timer);
  }, [pairing, refetch]);

  const left = pairing ? Date.parse(pairing.expires) - now : 0;
  const shown = pairing && left > 0 ? pairing : null;

  return (
    <SettingsGroup label="Ajouter un PC" note={create.error && <ErrorNote errors={[networkError(create.error)]} />}>
      <SettingsCard className="items-center gap-3.5 px-4 py-[22px] text-center">
        <span className="text-[14px] text-t2">Saisis ce code dans le collecteur du nouveau PC</span>
        {shown ? (
          <>
            <CodeTiles code={shown.code} />
            <span className="text-[12px] text-t3">Expire dans {Math.max(1, Math.floor(left / 60_000))} min</span>
            <CopyButton text={shown.code} icon>
              Copier le code
            </CopyButton>
          </>
        ) : (
          <Button variant="pill" size="pill" disabled={create.isPending} onClick={() => create.mutate()}>
            Afficher un code
          </Button>
        )}
      </SettingsCard>
    </SettingsGroup>
  );
}

/** "K7Q4 ZP8M", one tile per character, a dash in the middle. */
function CodeTiles({ code }: { code: string }) {
  const half = Math.ceil(code.length / 2);
  const characters = [...code.slice(0, half), '–', ...code.slice(half)];
  return (
    <span className="flex gap-1 lg:gap-1.5" role="img" aria-label={`Code ${code.slice(0, half)} ${code.slice(half)}`}>
      {characters.map((character, index) =>
        character === '–' ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: the tiles never move.
          <b key={index} className="num flex h-[52px] w-4 items-center justify-center text-[30px] text-t3">
            –
          </b>
        ) : (
          <b
            // biome-ignore lint/suspicious/noArrayIndexKey: the tiles never move.
            key={index}
            className="num flex h-[52px] w-[34px] items-center justify-center rounded-[12px] bg-white/7 text-[30px] text-t1 shadow-[inset_0_.5px_0_rgba(255,255,255,.18),inset_0_0_0_.5px_rgba(255,255,255,.08)] lg:w-[38px]"
          >
            {character}
          </b>
        ),
      )}
    </span>
  );
}

/** Copies a text, then says it did for a moment. */
function CopyButton({
  text,
  icon = false,
  className,
  children,
}: {
  text: string;
  icon?: boolean;
  className?: string;
  children: string;
}) {
  const copy = useMutation({ mutationFn: () => navigator.clipboard.writeText(text) });
  useEffect(() => {
    if (!copy.isSuccess) return;
    const timer = setTimeout(() => copy.reset(), 2000);
    return () => clearTimeout(timer);
  }, [copy]);
  return (
    <Button variant="pill" size="pill" className={className} onClick={() => copy.mutate()}>
      {icon && <CopyIcon />}
      {copy.isSuccess ? 'Copié !' : copy.isError ? 'Copie impossible' : children}
    </Button>
  );
}

function Step({ number, children }: { number: number; children: ReactNode }) {
  return (
    <div className="relative flex items-start gap-3 px-4 py-3.5 text-[15px] leading-[1.45] not-first:before:absolute not-first:before:top-0 not-first:before:right-0 not-first:before:left-[52px] not-first:before:h-[.5px] not-first:before:bg-line not-first:before:content-['']">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10 font-bold text-[12px] text-t1">
        {number}
      </span>
      {typeof children === 'string' ? <span>{children}</span> : children}
    </div>
  );
}
