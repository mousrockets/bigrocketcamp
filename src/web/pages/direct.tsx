import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { MonitorIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { liveBridge } from '../../lib/live-bridge';
import { BackLink, Note, PageHeader, Panel } from '../components/club/page';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { collectorsQuery, livePlayersQuery } from '../queries';
import { createPairingCode, revokeCollector } from '../writes';

// Getting the scores in: the Windows collector, paired with a code, and the browser's own direct, still to test.

type Info = { active: boolean; queued: number; connection: string; message: string; lastReceived: number | null };
type LiveBridge = ReturnType<typeof liveBridge>;
/** The collectors paired before the code: a new one in the list means the code was used. */
type Pairing = { code: string; expires: string; knownIds: string[] };

const enabledKey = 'rl-live-enabled-v1';
const config = '[TAGame.MatchStatsExporter_TA]\nPacketSendRate=10\nPort=0\nWebPort=49124';
const dateTime = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const shownCode = (code: string) => `${code.slice(0, 4)} ${code.slice(4)}`;
const networkError = (e: unknown) =>
  e instanceof TypeError ? 'Connexion Internet indisponible. Réessaie dans un instant.' : (e as Error).message;

function Collector() {
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
  return (
    <Panel aria-label="Collecteur Windows">
      <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
        <h2 className="font-display text-[19px]">Collecteur Windows</h2>
        {devices.length > 0 && (
          <span className="kicker text-settled">
            {devices.length} associé{devices.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
      <p className="px-4 pb-3 text-[13px] leading-[1.45] text-muted-foreground">
        Le collecteur envoie tes matchs depuis ton PC, sans navigateur ouvert. Associe-le une fois avec un code ;
        révoque-le si tu changes de PC.
      </p>
      {data === undefined && readError && (
        <p className="px-4 pb-3 text-sm text-destructive">{networkError(readError)}</p>
      )}
      {devices.map((device) => (
        <div
          key={device.id}
          className="grid grid-cols-[40px_1fr_auto] items-center gap-3 border-t border-border px-4 py-3.5"
        >
          <span
            aria-hidden="true"
            className="relative flex size-10 items-center justify-center rounded-xl bg-settled/12 text-settled"
          >
            <MonitorIcon className="size-5" />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <b className="text-sm font-semibold">Associé le {dateTime.format(new Date(device.created))}</b>
            <small className="text-xs text-muted-foreground">
              {device.lastSeen
                ? `Dernier contact le ${dateTime.format(new Date(device.lastSeen))}`
                : 'Aucun contact pour l’instant'}
            </small>
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => revoke(device.id)}
            className="h-9 rounded-xl px-3 text-[13px] font-semibold text-destructive"
          >
            Révoquer
          </Button>
        </div>
      ))}
      <div className="flex flex-col gap-2.5 border-t border-border px-4 pt-3.5 pb-4">
        {pairing ? (
          <>
            <span className="text-[13px] text-soft">Saisis ce code dans le collecteur :</span>
            <div className="flex items-center justify-between rounded-[14px] border border-dashed border-link/40 bg-secondary px-3.5 py-3">
              <b className="font-display text-[28px] tracking-[0.14em]">{shownCode(pairing.code)}</b>
              <span className="text-xs text-muted-foreground">expire dans {minutes} min</span>
            </div>
            <span className="text-xs text-muted-foreground">
              Valable une seule fois. Il disparaît dès que le collecteur est associé.
            </span>
          </>
        ) : (
          <Button
            variant="outline"
            disabled={busy}
            onClick={newCode}
            className="h-11 self-start rounded-xl px-4 text-sm font-semibold"
          >
            Associer un collecteur
          </Button>
        )}
      </div>
    </Panel>
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

  return (
    <Panel aria-label="Direct depuis le navigateur" className="gap-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-[19px]">Direct navigateur</h2>
        <Badge variant="neutral" className="bg-streak/12 text-[10px] text-streak">
          À tester
        </Badge>
      </div>
      <p role="status" className="text-[13px] leading-[1.45] text-soft">
        {info.connection}
      </p>
      {readError ? (
        <p className="text-sm text-destructive">{readError.message}</p>
      ) : players?.length ? (
        <p className="text-xs leading-[1.45] text-muted-foreground">
          Joueur{players.length > 1 ? 's' : ''} enregistré{players.length > 1 ? 's' : ''} : {players.join(', ')}. Lance
          le jeu avec l’un de ces joueurs et garde l’onglet ouvert sur le PC pendant les parties.
        </p>
      ) : (
        players && (
          <p className="text-[13px] text-cost-soft">
            Aucune identité de jeu n’est associée à ce compte. Consulte{' '}
            <Link to="/connexions">les identités des joueurs</Link>.
          </p>
        )
      )}
      {info.active ? (
        <Button
          variant="outline"
          size="xl"
          onClick={stop}
          className="h-12 w-full rounded-[14px] font-display text-base"
        >
          Arrêter le direct
        </Button>
      ) : (
        <Button
          variant="inverse"
          size="xl"
          disabled={!players?.length}
          onClick={start}
          className="h-12 w-full text-base"
        >
          Activer le direct sur ce PC
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        {info.queued} match{info.queued > 1 ? 's' : ''} en attente d’envoi.
        {info.lastReceived &&
          ` Dernier envoi confirmé : ${new Date(info.lastReceived).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris' })}.`}
      </p>
      {info.message && <p className="text-sm">{info.message}</p>}
    </Panel>
  );
}

function Setup() {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(config);
      setCopied(true);
    } catch {
      toast.error('Sélectionne puis copie le texte des réglages.');
    }
  }
  return (
    <Panel aria-label="À régler une seule fois sur le PC" className="gap-3 p-4">
      <h2 className="font-display text-[19px]">À régler une seule fois</h2>
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-[13px] leading-[1.45] text-soft">
        <li>
          Ferme Rocket League. Dans Epic Games, ouvre la bibliothèque, puis le menu ⋯ de Rocket League → Gérer → dossier
          d’installation.
        </li>
        <li>
          Dans <code className="rounded-[5px] bg-surface px-1.5 py-px font-mono text-xs">TAGame\Config</code>, ouvre{' '}
          <code className="rounded-[5px] bg-surface px-1.5 py-px font-mono text-xs">TAStatsAPI.ini</code> ou, s’il
          n’existe pas,{' '}
          <code className="rounded-[5px] bg-surface px-1.5 py-px font-mono text-xs">DefaultStatsAPI.ini</code>. Dans la
          section ci-dessous, remplace seulement ces valeurs en conservant les autres réglages.
        </li>
        <li>
          Enregistre, relance Rocket League, puis active le direct ici. Si le navigateur demande l’accès au réseau
          local, autorise-le pour ce site.
        </li>
        <li>Attends le tableau final avant de quitter le match ; le premier essai doit confirmer sa réception ici.</li>
      </ol>
      <pre className="overflow-x-auto rounded-[14px] border border-border bg-[#0a0a0c] px-3.5 py-3 font-mono text-xs leading-[1.6] whitespace-pre text-[#c9dcff]">
        {config}
      </pre>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={copy} className="h-10 rounded-xl px-3.5 text-[13px] font-semibold">
          {copied ? 'Réglages copiés' : 'Copier les réglages'}
        </Button>
        <a
          href="https://www.rocketleague.com/developer/stats-api"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[13px]"
        >
          Documentation officielle Rocket League ↗
        </a>
      </div>
    </Panel>
  );
}

export function DirectPage() {
  return (
    <div className="flex flex-col gap-3.5">
      <PageHeader
        back={<BackLink to="/profil" label="Retour au profil" />}
        kicker="Scores en direct"
        title="Direct PC"
      />
      <p className="px-1 text-[13px] leading-[1.45] text-muted-foreground lg:max-w-[720px] lg:px-0 lg:text-sm">
        Un programme sur le PC lit le tableau de fin de match grâce à l’API Stats de Rocket League et l’envoie au club.
        Aucun compte Epic demandé.
      </p>
      <div className="flex flex-col gap-3.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5">
        <div className="flex flex-col gap-3.5">
          <Collector />
          <BrowserDirect />
        </div>
        <div className="flex flex-col gap-3.5">
          <Setup />
          <Note>
            Le direct transmet les matchs publics dont le tableau final est complet et dont le gagnant est confirmé. Les
            replays, parties privées, entraînements et bots ne sont pas comptés ; si le tableau final manque, aucun
            résultat n’est inventé, et un envoi répété ne compte jamais deux fois. Un seul PC peut couvrir les amis
            présents dans son match, y compris sur console après confirmation de leur identifiant. Les parties sur
            console en solo ne sont pas récupérées automatiquement. PC éteint ou onglet fermé : le direct s’arrête ; les
            données reçues restent.
          </Note>
        </div>
      </div>
    </div>
  );
}
