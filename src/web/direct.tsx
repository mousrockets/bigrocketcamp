import { useEffect, useRef, useState } from 'react';
import { liveBridge } from '../lib/live-bridge';
import { apiFetch } from './api';
import { Brand } from './brand';

type Info = { active: boolean; queued: number; connection: string; message: string; lastReceived: number | null };
type LiveBridge = ReturnType<typeof liveBridge>;

const enabledKey = 'rl-live-enabled-v1';
const config = '[TAGame.MatchStatsExporter_TA]\nPacketSendRate=10\nPort=0\nWebPort=49124';

export function Direct() {
  const [players, setPlayers] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [info, setInfo] = useState<Info>({
    active: false,
    queued: 0,
    connection: 'Direct non activé sur cet appareil.',
    message: '',
    lastReceived: null,
  });
  const bridge = useRef<LiveBridge | null>(null);

  useEffect(() => {
    let stopped = false;
    const controller = liveBridge({
      onStatus: (patch: Partial<Info>) => {
        if (!stopped) setInfo((previous) => ({ ...previous, ...patch }));
      },
    });
    bridge.current = controller;
    apiFetch('/api/live')
      .then(async (response) => {
        if (!response.ok) throw Error('Connecte-toi à RL-Pompes pour activer le direct.');
        const data = (await response.json()) as { players: string[] };
        if (!Array.isArray(data.players)) throw Error('Réponse de connexion invalide.');
        if (stopped) return;
        setPlayers(data.players);
        try {
          if (data.players.length && localStorage.getItem(enabledKey) === 'true') controller.start();
        } catch {
          // Without storage, the direct waits for the button instead of resuming on its own.
        }
      })
      .catch((e: Error) => {
        if (!stopped) setError(e.message);
      });
    const onOnline = () => controller.retry();
    window.addEventListener('online', onOnline);
    return () => {
      stopped = true;
      controller.stop();
      bridge.current = null;
      window.removeEventListener('online', onOnline);
    };
  }, []);

  function start() {
    setError('');
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

  async function copy() {
    try {
      await navigator.clipboard.writeText(config);
      setCopied(true);
    } catch {
      setError('Sélectionne puis copie le texte des réglages ci-dessous.');
    }
  }

  return (
    <main>
      <header>
        <Brand />
        <a href="/">← Tableau de l’équipe</a>
      </header>
      <section>
        <p className="eyebrow">DIRECT DEPUIS LE PC · À TESTER</p>
        <h1>
          Le match finit.
          <br />
          Le score arrive.
        </h1>
        <p className="muted">
          Un onglet ouvert sur le PC qui joue transmet les tableaux finaux au club, sans logiciel supplémentaire. Le
          téléphone consulte ensuite les résultats sur la page d’accueil.
        </p>
        <p className="small muted">Ce nouveau mode doit encore être validé avec une vraie partie et ton navigateur.</p>
      </section>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <section className="daily-recap" aria-label="État du direct">
        <h2>Connexion de ce PC</h2>
        <p role="status">{info.connection}</p>
        {players?.length ? (
          <p className="small muted">
            Joueur{players.length > 1 ? 's' : ''} enregistré{players.length > 1 ? 's' : ''} : {players.join(', ')}.
            Lance le jeu avec l’un de ces joueurs.
          </p>
        ) : (
          players && (
            <p className="alert">
              Aucune identité de jeu n’est associée à ce compte. Consulte{' '}
              <a href="/connexions">les identités des joueurs</a>.
            </p>
          )
        )}
        <button type="button" className="primary" disabled={!players?.length || info.active} onClick={start}>
          Activer le direct sur ce PC
        </button>
        {info.active && (
          <button type="button" onClick={stop}>
            Arrêter le direct
          </button>
        )}
        <p className="small muted">
          {info.queued} match{info.queued > 1 ? 's' : ''} en attente d’envoi.
          {info.lastReceived && (
            <>
              {' '}
              Dernier envoi confirmé :{' '}
              {new Date(info.lastReceived).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris' })}.
            </>
          )}
        </p>
        {info.message && <p>{info.message}</p>}
      </section>
      <section className="daily-recap">
        <h2>À régler une seule fois sur le PC</h2>
        <ol>
          <li>
            Ferme Rocket League. Dans Epic Games, ouvre la bibliothèque, puis le menu ⋯ de Rocket League → Gérer →
            dossier d’installation.
          </li>
          <li>
            Dans <code>TAGame\Config</code>, ouvre <code>TAStatsAPI.ini</code> ou, s’il n’existe pas,{' '}
            <code>DefaultStatsAPI.ini</code>. Dans la section ci-dessous, remplace seulement ces valeurs en conservant
            les autres réglages.
          </li>
          <li>
            Enregistre, relance Rocket League, puis active le direct ici. Si le navigateur demande l’accès au réseau
            local, autorise-le pour ce site.
          </li>
          <li>
            Garde cet onglet ouvert sur le PC pendant les parties. Attends le tableau final avant de quitter le match ;
            le premier essai doit confirmer sa réception ici.
          </li>
        </ol>
        <pre style={{ overflowX: 'auto', whiteSpace: 'pre-wrap', padding: 16 }}>{config}</pre>
        <button type="button" onClick={copy}>
          {copied ? 'Réglages copiés' : 'Copier les réglages'}
        </button>
        <p className="small muted">
          <a href="https://www.rocketleague.com/developer/stats-api" target="_blank" rel="noopener noreferrer">
            Documentation officielle Rocket League ↗
          </a>
        </p>
      </section>
      <section>
        <h2>Les matchs pris en compte</h2>
        <p className="muted">
          Le direct transmet les matchs publics dont le tableau final est complet et dont le gagnant est confirmé. Les
          replays d’historique, parties privées, entraînements et bots ne sont pas comptés. Si le tableau final manque,
          aucun résultat n’est inventé. Les envois répétés ne comptent pas deux fois la même partie.
        </p>
        <p className="muted">
          Un seul PC peut couvrir les amis présents dans son match, y compris les joueurs sur console après confirmation
          de leur identifiant de console sur <a href="/connexions">la page des joueurs</a>. Les parties sur console en
          solo ne sont pas récupérées automatiquement. PC éteint ou onglet fermé : le direct local s’arrête ; les
          données reçues restent disponibles.
        </p>
      </section>
    </main>
  );
}
