import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { cn } from 'cn';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { parisDay } from '../../lib/domain';
import { liveBridge } from '../../lib/live-bridge';
import { useClub } from '../club';
import { BackLink, PageHeader, Panel } from '../components/club/page';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { collectorsQuery, livePlayersQuery } from '../queries';
import { createPairingCode, revokeCollector } from '../writes';
import { IdentityCards } from './identities';

// Getting the scores in: the Windows collector, paired with a code, and the browser's own direct, still to test.
// A phone shows them with the one-time setup in three cards; a wide screen puts the game identities on the left
// and folds the setup into the browser's card.

type Info = { active: boolean; queued: number; connection: string; message: string; lastReceived: number | null };
type LiveBridge = ReturnType<typeof liveBridge>;
/** The collectors paired before the code: a new one in the list means the code was used. */
type Pairing = { code: string; expires: string; knownIds: string[] };

const enabledKey = 'rl-live-enabled-v1';
const config = '[TAGame.MatchStatsExporter_TA]\nPacketSendRate=10\nPort=0\nWebPort=49124';
const parisTime = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
const parisDate = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' });
const shownCode = (code: string) => `${code.slice(0, 4)} ${code.slice(4)}`;
const networkError = (e: unknown) =>
  e instanceof TypeError ? 'Connexion Internet indisponible. Réessaie dans un instant.' : (e as Error).message;

/** "aujourd’hui à 21:41", "hier à 08:05", "le 03/11 à 19:00". */
function contactDay(iso: string) {
  const at = new Date(iso);
  const day = parisDay(at);
  const yesterday = parisDay(new Date(Date.now() - 86_400_000));
  const when = day === parisDay() ? 'aujourd’hui' : day === yesterday ? 'hier' : `le ${parisDate.format(at)}`;
  return `${when} à ${parisTime.format(at)}`;
}

/** The design's .sm: 36 px, 13 px text. */
const smallButton = 'h-9 rounded-xl px-3 text-[13px] font-semibold';
const codeClass = 'rounded-[5px] bg-surface px-[5px] py-px font-mono text-xs';

function MonitorIcon() {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

function Collector() {
  const { me } = useClub();
  const queryClient = useQueryClient();
  const { data, error: readError, refetch } = useQuery(collectorsQuery);
  const devices = data ?? [];
  const newPairingCode = useMutation({ mutationFn: createPairingCode }).mutateAsync;
  const revokeDevice = useMutation({ mutationFn: revokeCollector }).mutateAsync;
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [now, setNow] = useState(Date.now);
  const [busy, setBusy] = useState(false);

  // While a code is shown, the list follows: the code goes away once used or expired.
  useEffect(() => {
    if (!pairing) return;
    const timer = setInterval(async () => {
      setNow(Date.now());
      if (Date.parse(pairing.expires) <= Date.now()) {
        setPairing(null);
        return;
      }
      const { data: list } = await refetch();
      if (list?.some((device) => !pairing.knownIds.includes(device.id))) {
        setPairing(null);
        toast.success('Collecteur associé.');
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [pairing, refetch]);

  async function newCode() {
    if (busy) return;
    setBusy(true);
    try {
      const { code, expires } = await newPairingCode();
      setNow(Date.now());
      setPairing({ code, expires, knownIds: devices.map((device) => device.id) });
    } catch (e) {
      toast.error(networkError(e));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      await revokeDevice(id);
      await queryClient.fetchQuery({ ...collectorsQuery, staleTime: 0 });
    } catch (e) {
      toast.error(networkError(e));
    } finally {
      setBusy(false);
    }
  }

  const minutes = pairing ? Math.max(1, Math.ceil((Date.parse(pairing.expires) - now) / 60_000)) : 0;
  const owner = `PC de ${me.duoPseudo ?? me.email}`;
  return (
    <Panel aria-label="Collecteur Windows">
      <div className="flex items-center justify-between px-4 pt-3.5 pb-1 lg:px-[18px] lg:pt-4 lg:pb-2.5">
        <h2 className="font-display text-[19px] lg:text-xl">Collecteur Windows</h2>
        {devices.length > 0 && (
          <span className="kicker text-settled">
            {devices.length} actif{devices.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
      {data === undefined && readError && (
        <p className="px-4 pb-3 text-sm text-destructive lg:px-[18px]">{networkError(readError)}</p>
      )}
      {devices.map((device, i) => (
        <div
          key={device.id}
          className={cn(
            'grid grid-cols-[40px_1fr_auto] items-center gap-3 px-4 py-3.5 lg:px-[18px]',
            i === 0 ? 'lg:pt-2' : 'border-t border-border',
          )}
        >
          <span
            aria-hidden="true"
            className="relative flex size-10 items-center justify-center rounded-xl bg-settled/12 text-settled"
          >
            <MonitorIcon />
            {device.lastSeen && (
              <i className="absolute -top-0.5 -right-0.5 size-[9px] rounded-full bg-settled motion-safe:animate-live" />
            )}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <b className="text-sm font-semibold">
              {owner}
              {devices.length > 1 && ` · ${i + 1}`}
            </b>
            <small className="text-xs text-muted-foreground">
              {device.lastSeen ? `Dernier contact ${contactDay(device.lastSeen)}` : 'Aucun contact pour l’instant'}
            </small>
          </span>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => revoke(device.id)}
            className={cn(smallButton, 'text-destructive hover:text-destructive')}
          >
            Révoquer
          </Button>
        </div>
      ))}
      <div className="flex flex-col gap-2.5 border-t border-border px-4 pt-3.5 pb-4 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:gap-3 lg:px-[18px] lg:py-3.5">
        {pairing ? (
          <>
            <span className="text-[13px] text-soft">
              <span className="lg:hidden">Saisis ce code dans le collecteur du nouveau PC :</span>
              <span className="hidden lg:inline">Code pour un nouveau PC</span>
            </span>
            <div className="flex items-center justify-between rounded-[14px] border border-dashed border-link/40 bg-secondary px-3.5 py-3 lg:hidden">
              <b className="font-display text-[28px] tracking-[0.14em]">{shownCode(pairing.code)}</b>
              <span className="text-xs text-muted-foreground">expire dans {minutes} min</span>
            </div>
            <span className="hidden items-center gap-3 lg:flex">
              <b className="rounded-xl border border-dashed border-link/40 px-3 py-1.5 font-display text-[26px] tracking-[0.14em]">
                {shownCode(pairing.code)}
              </b>
              <small className="text-xs text-muted-foreground">expire dans {minutes} min</small>
            </span>
          </>
        ) : (
          <>
            <span className="hidden text-[13px] text-soft lg:inline">Code pour un nouveau PC</span>
            <Button
              variant="outline"
              disabled={busy}
              onClick={newCode}
              className="h-10 self-start rounded-xl px-3.5 text-[13px] font-semibold lg:self-auto"
            >
              Associer un collecteur
            </Button>
          </>
        )}
      </div>
    </Panel>
  );
}

function useCopy() {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(config);
      setCopied(true);
    } catch {
      toast.error('Sélectionne puis copie le texte des réglages.');
    }
  }
  return { copied, copy };
}

function ConfigText({ className }: { className?: string }) {
  return (
    <pre
      className={cn(
        'm-0 overflow-x-auto rounded-[14px] border border-border bg-[#0a0a0c] px-3.5 py-3 font-mono text-xs leading-[1.6] font-medium whitespace-pre text-[#c9dcff]',
        className,
      )}
    >
      {config}
    </pre>
  );
}

function Steps({ last, className }: { last: ReactNode; className?: string }) {
  return (
    <ol className={cn('flex list-decimal flex-col pl-5 text-[13px] leading-[1.45] text-soft', className)}>
      <li>Ferme Rocket League, puis ouvre son dossier d’installation depuis Epic Games.</li>
      <li>
        Dans <code className={codeClass}>TAGame\Config</code>, ouvre <code className={codeClass}>TAStatsAPI.ini</code>{' '}
        et remplace ces valeurs.
      </li>
      <li>{last}</li>
    </ol>
  );
}

/** What the design leaves out of the setup and of the page: the exceptions, the limits and the official page. */
function Details() {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            className="min-h-10 cursor-pointer text-[13px] font-semibold text-link hover:text-link-hover"
          />
        }
      >
        Détails et limites
      </DialogTrigger>
      <DialogContent className="gap-4 rounded-[22px] bg-popover p-5 sm:max-w-lg">
        <DialogTitle className="font-display text-xl">Détails et limites</DialogTitle>
        <DialogDescription render={<div />} className="flex flex-col gap-3 text-[13px] leading-[1.45] text-soft">
          <p>
            Dans Epic Games, le dossier d’installation s’ouvre depuis la bibliothèque : menu ⋯ de Rocket League → Gérer
            → dossier d’installation. Si <code className={codeClass}>TAStatsAPI.ini</code> n’existe pas, ouvre{' '}
            <code className={codeClass}>DefaultStatsAPI.ini</code>. Remplace seulement ces valeurs, en conservant les
            autres réglages de la section.
          </p>
          <p>
            Si le navigateur demande l’accès au réseau local, autorise-le pour ce site. Attends le tableau final avant
            de quitter le match ; le premier essai doit confirmer sa réception ici.
          </p>
          <p>
            Le direct transmet les matchs publics dont le tableau final est complet et dont le gagnant est confirmé. Les
            replays, parties privées, entraînements et bots ne sont pas comptés ; si le tableau final manque, aucun
            résultat n’est inventé, et un envoi répété ne compte jamais deux fois. Un seul PC peut couvrir les amis
            présents dans son match, y compris sur console après confirmation de leur identifiant. Les parties sur
            console en solo ne sont pas récupérées automatiquement. PC éteint ou onglet fermé : le direct s’arrête ; les
            données reçues restent.
          </p>
          <a href="https://www.rocketleague.com/developer/stats-api" target="_blank" rel="noopener noreferrer">
            Documentation officielle Rocket League ↗
          </a>
        </DialogDescription>
      </DialogContent>
    </Dialog>
  );
}

function BrowserDirect() {
  const { data: players = null, error: readError } = useQuery(livePlayersQuery);
  const [info, setInfo] = useState<Info>({
    active: false,
    queued: 0,
    connection: 'Direct non activé sur cet appareil.',
    message: '',
    lastReceived: null,
  });
  const bridge = useRef<LiveBridge | null>(null);
  /** Whether this page's bridge already had its chance to resume. */
  const resumed = useRef(false);
  const { copied, copy } = useCopy();

  useEffect(() => {
    let stopped = false;
    const controller = liveBridge({
      onStatus: (patch: Partial<Info>) => {
        if (!stopped) setInfo((previous) => ({ ...previous, ...patch }));
      },
    });
    bridge.current = controller;
    resumed.current = false;
    const onOnline = () => controller.retry();
    window.addEventListener('online', onOnline);
    return () => {
      stopped = true;
      controller.stop();
      bridge.current = null;
      window.removeEventListener('online', onOnline);
    };
  }, []);

  // Once the players are known, a direct left on resumes by itself.
  useEffect(() => {
    if (!players?.length || resumed.current) return;
    resumed.current = true;
    try {
      if (localStorage.getItem(enabledKey) === 'true') bridge.current?.start();
    } catch {
      // Without storage, the direct waits for the button instead of resuming on its own.
    }
  }, [players]);

  function start() {
    try {
      localStorage.setItem(enabledKey, 'true');
    } catch {
      // The direct still starts; it just will not resume by itself after a reload.
    }
    bridge.current?.start();
  }

  function stop() {
    try {
      localStorage.removeItem(enabledKey);
    } catch {
      // Nothing was stored, so nothing would resume.
    }
    bridge.current?.stop();
  }

  const toggle = (className: string) =>
    info.active ? (
      <Button variant="outline" size="xl" onClick={stop} className={cn('rounded-[14px]', className)}>
        Arrêter le direct
      </Button>
    ) : (
      <Button variant="inverse" size="xl" disabled={!players?.length} onClick={start} className={className}>
        Brancher le direct
      </Button>
    );

  return (
    <Panel aria-label="Direct depuis le navigateur" className="gap-3 p-4 lg:p-[18px]">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-[19px] lg:text-xl">Direct navigateur</h2>
        <Badge variant="neutral" className="bg-streak/12 px-1.5 text-[10px] tracking-[0.08em] text-streak">
          À tester
        </Badge>
      </div>
      <p
        role="status"
        className={cn('text-[13px] leading-[1.45] text-muted-foreground', !info.active && !info.message && 'lg:hidden')}
      >
        {info.connection} Garde l’onglet ouvert sur le PC pendant les parties.
      </p>
      {readError ? (
        <p className="text-sm text-destructive">{readError.message}</p>
      ) : (
        players &&
        !players.length && (
          <p className="text-[13px] text-cost-soft">
            Aucune identité de jeu n’est associée à ce compte. Consulte{' '}
            <Link to="/connexions">les identités des joueurs</Link>.
          </p>
        )
      )}
      {toggle('h-12 w-full text-base lg:hidden')}

      <Steps
        className="hidden gap-1.5 lg:flex"
        last="Relance le jeu, active le direct et garde cet onglet ouvert pendant les parties."
      />
      <div className="hidden flex-wrap items-stretch gap-3 lg:flex">
        <ConfigText className="flex-[1_1_270px]" />
        <div className="flex flex-[0_1_200px] flex-col justify-end gap-2">
          <Button variant="outline" onClick={copy} className="h-11 rounded-xl px-3 text-[13px] font-semibold">
            {copied ? 'Réglages copiés' : 'Copier les réglages'}
          </Button>
          {toggle('h-12 text-[15px]')}
        </div>
      </div>

      {(info.queued > 0 || info.lastReceived) && (
        <p className="text-xs text-muted-foreground">
          {info.queued} match{info.queued > 1 ? 's' : ''} en attente d’envoi.
          {info.lastReceived &&
            ` Dernier envoi confirmé : ${new Date(info.lastReceived).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris' })}.`}
        </p>
      )}
      {info.message && <p className="text-sm">{info.message}</p>}
      <span className="hidden lg:block">
        <Details />
      </span>
    </Panel>
  );
}

function Setup() {
  const { copied, copy } = useCopy();
  return (
    <Panel aria-label="À régler une seule fois sur le PC" className="gap-3 p-4 lg:hidden">
      <h2 className="font-display text-[19px]">À régler une seule fois</h2>
      <Steps className="gap-2" last="Relance le jeu et active le direct ici." />
      <ConfigText />
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="outline" onClick={copy} className="h-10 rounded-xl px-3.5 text-[13px] font-semibold">
          {copied ? 'Réglages copiés' : 'Copier les réglages'}
        </Button>
        <Details />
      </div>
    </Panel>
  );
}

export function DirectPage() {
  return (
    <>
      <PageHeader
        back={<BackLink to="/profil" label="Retour au profil" wide="Profil" />}
        kicker="Scores en direct"
        title="Le Direct"
      />
      <p className="mx-1 text-[13px] leading-[1.45] text-muted-foreground lg:mx-0 lg:-mt-2.5 lg:max-w-[720px] lg:text-sm lg:leading-[1.5]">
        Un petit programme sur le PC lit le tableau de fin de match et l’envoie au club. Personne ne peut tricher sur
        ses défaites.
      </p>
      <div className="flex flex-col gap-3.5 lg:flex-row lg:flex-wrap lg:items-start lg:gap-5">
        <section aria-label="Identités de jeu" className="hidden min-w-0 flex-[1_1_380px] flex-col gap-3 lg:flex">
          <h2 className="font-display text-[22px]">Identités de jeu</h2>
          <IdentityCards column />
        </section>
        <div className="contents lg:flex lg:min-w-0 lg:flex-[1_1_400px] lg:flex-col lg:gap-5">
          <Collector />
          <BrowserDirect />
          <Setup />
        </div>
      </div>
    </>
  );
}
