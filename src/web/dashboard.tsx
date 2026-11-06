import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { clubName, roster } from '../lib/club';
import {
  dailyRecap,
  exerciseDescription,
  exerciseEffect,
  formatNumber,
  lastPlaceRule,
  parisDay,
  pushupCredit,
  summarize,
  validateExercise,
} from '../lib/domain';
import { currentSeason, seasonEndLabel, seasonTiming } from '../lib/season';
import { apiFetch, signOut } from './api';
import { Brand } from './brand';
import type { MonthlyState } from './monthly-mmr';
import { MonthlyMmr } from './monthly-mmr';
import { playerInitials, playerPlatform } from './players';

type ExerciseType = 'pushups' | 'plank' | 'crunches';
type Declaration = { id: string; player: string; type: ExerciseType; count: number; day: string };
type Exercise = Declaration & { created: string; mine?: boolean };
type Result = {
  match_guid: string;
  player_id: string;
  name: string;
  day: string;
  kind: string;
  team: number;
  winner: number;
  score: number;
  review_required?: boolean;
  verification?: string;
  selected_source?: string;
};
type PlayerStats = {
  name: string;
  played: number;
  wins: number;
  losses: number;
  due: number;
  done: number;
  pushups: number;
  plankSeconds: number;
  crunches: number;
  remaining: number;
};
type DoublesRank = {
  player: string;
  mmr: number | null;
  label: string;
  tier: number | null;
  matchesPlayed: number | null;
  status: string;
  fetchedAt: string | null;
};
type Reaction = { exercise_id: string; emoji: string; count: number; mine: number };
type EpicConnection = { slot: string; status: string; last_sync: string | null; last_attempt: string | null };
type State = {
  results: Result[];
  exercises: Exercise[];
  collectors: { last_seen: string }[];
  matchRosters?: { match_guid: string; expected_players: number }[];
  reliability?: { confirmed: number; single: number; corrected: number; review: number };
  doublesRanks?: DoublesRank[];
  reactions?: Reaction[];
  me?: string | null;
  epic?: EpicConnection[];
  epicPaused?: boolean;
  epicRetired?: boolean;
  monthly?: MonthlyState;
  rankSource?: { lastReadAt: string | null; stale: boolean } | null;
};
type CheerKind = 'cheer' | 'finish' | 'badge' | 'loss';
type ConfettiPiece = { key: string; style: CSSProperties };
type Cheer = { id: number; text: string; kind: CheerKind; pieces: ConfettiPiece[] };
type Theme = 'dark' | 'light' | 'auto';
type InstallMode = 'installed' | 'prompt' | 'ios' | 'manual';
type PodiumMode = 'effort' | 'mmr';
type Streak = { current: number; best: number };
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
// index.html keeps the install prompt here: browsers fire it before React starts.
type InstallWindow = Window & { __rlInstall?: InstallPrompt | null };
type BadgeRule = { id: string; emoji: string; label: string; earned: (player: PlayerStats, streak: Streak) => boolean };

const clubShortName = clubName.split(' ').at(-1) ?? clubName;
const cheers = [
  'Vas-y champion !',
  'Allez, encore une ! Comme en prolongation !',
  'Boost à 100 % !',
  'What a save… de pompes !',
  'Calculated.',
  'Les bras en béton armé !',
  'Même le ballon est impressionné.',
  'Tu pousses plus fort qu’un kickoff !',
  `${clubShortName} un jour, ${clubShortName} toujours !`,
  'Respect. Le coach est fier.',
  'Ça c’est du Grand Champion !',
  'Et le muscle, il se lève tout seul ?',
];
const finishers = [
  'Dette réglée ! Free-play mérité.',
  'Zéro pompe due. Champion du monde !',
  'Ardoise effacée ! Tu peux re-perdre tranquille.',
];
const taunts = [
  '+5 pour {n}… courage, champion.',
  '{n} prend 5 pompes. Le ballon ne pardonne pas.',
  'Défaite pour {n} : direction le tapis !',
  '{n} : +5. On appelle ça de l’entraînement.',
];
const confettiColors = ['#2e9bff', '#ff8a1f', '#ffd23f', '#ffffff'];
const themes: [Theme, string][] = [
  ['dark', 'Sombre'],
  ['light', 'Clair'],
  ['auto', 'Auto'],
];
const reactionEmojis = ['💪', '🔥', '😂'];
const UNDO_DELAY_MS = 10_000;
const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;
const noStreak: Streak = { current: 0, best: 0 };
const badgeRules: BadgeRule[] = [
  { id: 'first', emoji: '🎯', label: 'Premier effort', earned: (p) => p.done > 0 },
  { id: 'p100', emoji: '💯', label: '100 équiv. pompes', earned: (p) => p.done >= 100 },
  { id: 'p1000', emoji: '🏆', label: '1 000 équiv. pompes', earned: (p) => p.done >= 1000 },
  { id: 'plank10', emoji: '🧱', label: '10 min de gainage', earned: (p) => p.plankSeconds >= 600 },
  { id: 'abs200', emoji: '🍫', label: '200 abdos', earned: (p) => p.crunches >= 200 },
  { id: 'streak7', emoji: '🔥', label: '7 jours d’affilée', earned: (_, s) => s.best >= 7 },
];

const pick = (list: readonly string[]) => list[Math.floor(Math.random() * list.length)] ?? '';
const isLoss = (r: Result) =>
  r.kind === 'match' && !r.review_required && r.team !== r.winner && roster.includes(r.name);
const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
const parisDateTime = (date: string) => new Date(date).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });

function shiftDay(day: string, delta: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function weekStart(today: string) {
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  return shiftDay(today, -weekday);
}

function streakOf(days: Set<string>, today: string): Streak {
  let current = 0;
  for (let day = days.has(today) ? today : shiftDay(today, -1); days.has(day); day = shiftDay(day, -1)) current++;
  let best = 0;
  let run = 0;
  let previous = '';
  for (const day of Array.from(days).sort()) {
    run = previous && shiftDay(previous, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  return { current, best };
}

// Private windows and some embedded browsers refuse storage: preferences then last for the visit only.
function readStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // See readStorage.
  }
}

function removeStorage(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // See readStorage.
  }
}

function summarizeStats(state: State, day: string) {
  return summarize(state.results, state.exercises, day, state.matchRosters || []) as PlayerStats[];
}

// Generated in the browser: no audio files to host or license.
function playJingle(kind: CheerKind) {
  try {
    const AudioContextType =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextType) return;
    const context = new AudioContextType();
    const notes =
      kind === 'loss'
        ? [392, 349.23, 311.13, 261.63]
        : kind === 'cheer'
          ? [659.25, 783.99, 1046.5]
          : [523.25, 659.25, 783.99, 1046.5, 1318.5];
    const gap = kind === 'loss' ? 0.18 : 0.09;
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * gap;
      oscillator.type = 'triangle';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + gap * 3);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + gap * 3 + 0.02);
    });
    setTimeout(() => context.close(), 2000);
  } catch {
    // Sound is a bonus: a blocked audio context must not break the celebration.
  }
}

function speak(text: string) {
  if (typeof speechSynthesis === 'undefined') return;
  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    utterance.rate = 1.05;
    utterance.pitch = 0.9 + Math.random() * 0.5;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  } catch {
    // Same as playJingle: the voice is optional.
  }
}

function twoDigits(value: number) {
  return String(value).padStart(2, '0');
}

function SeasonCountdown() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => {
      if (!document.hidden) setNow(Date.now());
    };
    update();
    const timer = setInterval(update, currentSeason.confirmedEndAt ? 1000 : 60000);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  const timing = now === null ? null : seasonTiming(now);
  const precise = !!currentSeason.confirmedEndAt;
  const clock = !timing
    ? '—'
    : timing.exact
      ? timing.ended
        ? 'Terminée'
        : `${timing.days} j ${twoDigits(timing.hours)}:${twoDigits(timing.minutes)}:${twoDigits(timing.seconds)}`
      : timing.estimateReached
        ? 'À confirmer'
        : `J−${timing.days}`;
  const clockCaption = precise
    ? timing?.ended
      ? 'Échéance annoncée atteinte'
      : 'avant la fin annoncée'
    : timing && !timing.exact && timing.estimateReached
      ? 'Date indicative atteinte · annonce à vérifier'
      : 'jours avant la date estimée';
  return (
    <aside className="season-countdown" aria-label={`Fin de la saison ${currentSeason.number}`}>
      <div className="season-copy">
        <p className="eyebrow">
          FIN DE SAISON {currentSeason.number}{' '}
          <span className="season-status">{precise ? 'DATE ANNONCÉE' : 'ESTIMATION'}</span>
        </p>
        <p className="season-date">
          <time dateTime={currentSeason.confirmedEndAt || currentSeason.estimatedEndDay}>{seasonEndLabel()}</time>
        </p>
        <p className="season-note">
          {precise
            ? 'Heure de Paris · France métropolitaine'
            : 'Date indicative · heure française de fin du compétitif non annoncée.'}
        </p>
        <p className="season-sources">
          {!precise && (
            <>
              <a href={currentSeason.estimateSource} target="_blank" rel="noopener noreferrer">
                Calendrier communautaire
              </a>
              <span aria-hidden="true"> · </span>
            </>
          )}
          <a href={currentSeason.officialSource} target="_blank" rel="noopener noreferrer">
            Infos officielles ↗
          </a>
        </p>
      </div>
      <div className="season-clock" role="timer" aria-live="off">
        <strong>{clock}</strong>
        <span>{clockCaption}</span>
      </div>
    </aside>
  );
}

function DoublesRankPanel({ player, rank }: { player: string; rank: DoublesRank | undefined }) {
  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: same markup as before the migration.
    <div className="rank-panel" aria-label={`Classement 2v2 de ${player}`}>
      <span className="rank-mode">2V2 CLASSÉ · DERNIER RELEVÉ</span>
      <p className="rank-name">
        {rank?.tier != null && (
          <img className="rank-icon" src={`/rocket-league/ranks/${rank.tier}.png`} alt="" width={18} height={18} />
        )}
        {rank?.label || 'Classement non reçu'}
      </p>
      {rank?.mmr != null ? (
        <strong className="rank-mmr">
          {formatNumber(rank.mmr)} <span>MMR</span>
        </strong>
      ) : (
        <p className="small muted">MMR non reçu</p>
      )}
      {rank?.matchesPlayed != null && (
        <p className="rank-meta">
          {formatNumber(rank.matchesPlayed)} {rank.matchesPlayed > 1 ? 'matchs classés' : 'match classé'} en 2v2
        </p>
      )}
      {rank?.fetchedAt && (
        <p className="rank-meta">
          {rank.status !== 'ready' ? 'Dernière valeur connue · ' : ''}
          {new Date(rank.fetchedAt).toLocaleString('fr-FR', {
            timeZone: 'Europe/Paris',
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      )}
      {rank?.status === 'unavailable' && <p className="rank-meta">Actualisation du classement indisponible.</p>}
      {rank?.status === 'frozen' && <p className="rank-meta">Dernier MMR conservé · connexion Epic retirée.</p>}
      {rank?.status === 'manual' && <p className="rank-meta">MMR déclaré par le joueur · sans connexion Epic.</p>}
      {rank?.status === 'public' && <p className="rank-meta">MMR du profil public RLStats.net.</p>}
    </div>
  );
}

function Odometer({ value }: { value: string }) {
  const chars = value.split('');
  return (
    <>
      {chars.map((char, index) => {
        // Keyed from the right so units stay units and roll instead of remounting.
        const key = chars.length - index;
        return /\d/.test(char) ? (
          <span key={`d${key}`} className="odo" style={{ '--d': char } as CSSProperties}>
            <span className="odo-digit">{char}</span>
          </span>
        ) : (
          <span key={`s${key}`}>{char}</span>
        );
      })}
    </>
  );
}

function Ball() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#f4f6fb" stroke="#1a2440" strokeWidth="1.2" />
      <path d="M12 7l4.3 3.1-1.6 5H9.3l-1.6-5z" fill="#1a2440" />
      <path
        d="M12 1.5V7M16.3 10.1l5-1.6M14.7 15.1l3.2 4.3M9.3 15.1l-3.2 4.3M7.7 10.1l-5-1.6"
        stroke="#1a2440"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function KickoffScene() {
  const [run, setRun] = useState(0);
  return (
    <button
      type="button"
      className="kickoff"
      aria-label="Rejouer l’animation du but"
      title="Rejouer"
      onClick={() => setRun((r) => r + 1)}
    >
      {/* A new key remounts the scene, which restarts its CSS animations. */}
      <span className="kickoff-scene" key={run}>
        <span className="pitch-line" />
        <span className="goal">
          <span className="net" />
        </span>
        <span className="goal-ring orange" />
        <span className="goal-ring blue" />
        <span className="goal-text">BUT !</span>
        <span className="ball-x">
          <span className="ball-y">
            <span className="ball">
              <Ball />
            </span>
          </span>
        </span>
      </span>
    </button>
  );
}

function Car() {
  return (
    <svg className="car" viewBox="0 0 160 60" aria-hidden="true">
      <path d="M3 21h20v3L8 27z" fill="#1a2440" />
      <path
        d="M6 44 10 30q2-4 8-5l38-4L78 9q4-2 10-2l26 1q6 1 10 6l12 10 14 3q6 2 6 8v9z"
        fill="var(--green)"
        stroke="#0b1430"
        strokeWidth="2"
      />
      <path d="M62 21 80 11h32l14 11z" fill="#0b1430" />
      <path d="M12 34h140v4H10z" fill="var(--orange)" />
      {[38, 128].map((cx) => (
        <g key={cx} className="wheel">
          <circle cx={cx} cy="45" r="12" fill="#111827" stroke="#3b4c6b" strokeWidth="2" />
          <circle cx={cx} cy="45" r="5" fill="#9aa7c2" />
          <path d={`M${cx - 9} 45h18M${cx} 36v18`} stroke="#9aa7c2" strokeWidth="2" />
        </g>
      ))}
    </svg>
  );
}

function SkeletonCards() {
  return (
    <>
      <p className="sr-only">Chargement de l’équipe…</p>
      {roster.map((name) => (
        <article className="card skeleton" key={name} aria-hidden="true">
          <i className="sk sk-avatar" />
          <i className="sk sk-title" />
          <i className="sk sk-block" />
          <i className="sk sk-big" />
          <i className="sk sk-line" />
          <i className="sk sk-line short" />
        </article>
      ))}
    </>
  );
}

function collectionLabel(state: State, connection: EpicConnection | undefined) {
  if (state.epicRetired)
    return connection ? 'Identité de jeu conservée · accès Epic retiré.' : 'En attente du Direct PC.';
  if (connection?.status === 'reconnect') return 'Autorisation Epic à renouveler.';
  if (connection?.status === 'error') return 'Lecture Epic indisponible.';
  if (connection?.status === 'waiting_offline') return 'Historique en attente : joueur en ligne ou présence inconnue.';
  if (!connection) return 'Compte Epic à connecter.';
  if (!connection.last_sync) return 'Historique pas encore récupéré.';
  if (connection.status === 'partial') return 'Historique reçu partiellement.';
  return 'Fenêtre récente Epic reçue.';
}

function matchSource(result: Result) {
  if (result.review_required) return 'À vérifier';
  if (result.verification === 'confirmed') return 'Confirmé par les deux sources';
  if (result.verification === 'corrected') return 'Corrigé par Epic';
  return result.selected_source === 'epic' ? 'Epic' : 'Collecteur PC';
}

function lastReception(state: State | null) {
  const collector = state?.collectors[0];
  if (collector) return `Dernière réception PC : ${parisDateTime(collector.last_seen)}`;
  const epicSync = state?.epic?.[0]?.last_sync;
  if (epicSync) return `Dernier historique Epic conservé : ${parisDateTime(epicSync)}`;
  return 'En attente de la première collecte';
}

export function Dashboard() {
  const [data, setData] = useState<State | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [day, setDay] = useState(parisDay());
  const [player, setPlayer] = useState(roster[0] ?? '');
  const [type, setType] = useState<ExerciseType>('pushups');
  const [count, setCount] = useState(5);
  const [exerciseVisible, setExerciseVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState(false);
  const [pending, setPending] = useState<Declaration | null>(null);
  const [sound, setSound] = useState(true);
  const [cheer, setCheer] = useState<Cheer | null>(null);
  const [theme, setTheme] = useState<Theme | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [chosenMe, setChosenMe] = useState<string | null>(null);
  const [undoable, setUndoable] = useState<Declaration | null>(null);
  const [installMode, setInstallMode] = useState<InstallMode | null>(null);
  const [installHelp, setInstallHelp] = useState(false);
  const [touchDevice, setTouchDevice] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const [activeCard, setActiveCard] = useState(0);
  const [podiumMode, setPodiumMode] = useState<PodiumMode>('effort');
  const cardsCentered = useRef(false);
  const refreshRequest = useRef(0);
  const refreshInFlight = useRef(0);
  const submissionInFlight = useRef(false);
  const playerTouched = useRef(false);
  const seenLosses = useRef<Set<string> | null>(null);
  const soundRef = useRef(sound);
  soundRef.current = sound;

  async function refresh() {
    refreshInFlight.current++;
    const request = ++refreshRequest.current;
    try {
      const response = await apiFetch('/api/state');
      if (!response.ok) throw Error('Impossible de charger les résultats. Vérifie ta connexion.');
      const state = (await response.json()) as State;
      // A newer request was started meanwhile: its answer wins.
      if (request !== refreshRequest.current) return null;
      setData(state);
      setError('');
      return state;
    } catch (e) {
      if (request === refreshRequest.current) setError((e as Error).message);
      return null;
    } finally {
      refreshInFlight.current--;
    }
  }

  async function refreshIfIdle() {
    if (refreshInFlight.current) return null;
    return refresh();
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: sets up polling and restores preferences once.
  useEffect(() => {
    refresh();
    // Skip polling while the tab is hidden; catch up as soon as it is visible again.
    const timer = setInterval(() => {
      if (!document.hidden) refreshIfIdle();
    }, 3000);
    let hiddenAt = 0;
    const onVisible = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        return;
      }
      // An installed app can stay open for days: reload after a long pause to run the latest published version.
      if (isStandalone() && hiddenAt && Date.now() - hiddenAt > 300000 && !submissionInFlight.current) {
        location.reload();
        return;
      }
      refreshIfIdle();
    };
    document.addEventListener('visibilitychange', onVisible);
    if (readStorage('rl-sound') === 'off') setSound(false);
    const savedTheme = readStorage('rl-theme');
    setTheme(savedTheme === 'light' || savedTheme === 'auto' ? savedTheme : 'dark');
    const savedMe = readStorage('rl-me');
    if (savedMe && roster.includes(savedMe)) setChosenMe(savedMe);
    if (readStorage('rl-podium') === 'mmr') setPodiumMode('mmr');
    try {
      const stored = readStorage('rl-pending');
      if (stored) {
        const restored = validateExercise(JSON.parse(stored)) as Declaration;
        setPending(restored);
        setPlayer(restored.player);
        setType(restored.type);
        setCount(restored.type === 'plank' ? restored.count / 60 : restored.count);
        playerTouched.current = true;
      }
    } catch {
      // An invalid stored declaration is ignored: it could never be accepted by the server.
    }
    return () => {
      clearInterval(timer);
      refreshRequest.current++;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // The floating shortcut is useless while the form itself is on screen.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const form = document.getElementById('exercise');
    if (!form) return;
    const observer = new IntersectionObserver(([entry]) => setExerciseVisible(!!entry?.isIntersecting), {
      threshold: 0.15,
    });
    observer.observe(form);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!theme) return;
    const media = matchMedia('(prefers-color-scheme: light)');
    const apply = () => {
      document.documentElement.dataset.theme = theme === 'auto' ? (media.matches ? 'light' : 'dark') : theme;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: Event) => {
      const outside = !menuRef.current?.contains(event.target as Node);
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : outside) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menuOpen]);

  useEffect(() => {
    const installWindow = window as InstallWindow;
    const ios =
      /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setTouchDevice(matchMedia('(pointer: coarse)').matches);
    setInstallMode(isStandalone() ? 'installed' : installWindow.__rlInstall ? 'prompt' : ios ? 'ios' : 'manual');
    const ready = () => setInstallMode((mode) => (mode === 'installed' ? mode : 'prompt'));
    const installed = () => {
      installWindow.__rlInstall = null;
      setInstallMode('installed');
    };
    window.addEventListener('rl-install-ready', ready);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('rl-install-ready', ready);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  const recognized = chosenMe || data?.me || null;
  useEffect(() => {
    if (recognized && !playerTouched.current && !pending) setPlayer(recognized);
  }, [recognized, pending]);

  function scrollToCard(index: number, smooth = true) {
    const track = cardsRef.current;
    const card = track?.querySelectorAll('article')[index];
    if (!track || !card) return;
    track.scrollTo({
      left: card.offsetLeft - (track.clientWidth - card.clientWidth) / 2,
      behavior: smooth ? 'smooth' : 'auto',
    });
  }

  function onCardsScroll() {
    const track = cardsRef.current;
    if (!track) return;
    const center = track.scrollLeft + track.clientWidth / 2;
    const distance = (card: HTMLElement) => Math.abs(card.offsetLeft + card.clientWidth / 2 - center);
    const cards = Array.from(track.querySelectorAll('article'));
    let nearest = 0;
    cards.forEach((card, index) => {
      const best = cards[nearest];
      if (best && distance(card) < distance(best)) nearest = index;
    });
    setActiveCard(nearest);
  }

  // On phones, open the carousel on the recognised player's card once.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scrollToCard only reads refs.
  useEffect(() => {
    const track = cardsRef.current;
    if (!data || !recognized || cardsCentered.current || !track || track.scrollWidth <= track.clientWidth) return;
    cardsCentered.current = true;
    scrollToCard(roster.indexOf(recognized), false);
  }, [data, recognized]);

  const today = parisDay();
  const allStats = data ? summarizeStats(data, '') : [];
  const streaks = new Map(
    roster.map((name) => [
      name,
      streakOf(new Set((data?.exercises || []).filter((e) => e.player === name).map((e) => e.day)), today),
    ]),
  );
  const streakOfPlayer = (name: string) => streaks.get(name) ?? noStreak;
  const badgesOf = (stats: PlayerStats) => badgeRules.filter((rule) => rule.earned(stats, streakOfPlayer(stats.name)));

  // Celebrates new defeats and newly earned badges, compared with what this device has already seen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new server state can bring a new defeat or badge.
  useEffect(() => {
    if (!data) return;
    const losses = data.results.filter(isLoss);
    const keys = losses.map((r) => `${r.match_guid}:${r.player_id}`);
    const seen = seenLosses.current;
    if (seen) {
      const fresh = losses.filter((_, index) => !seen.has(keys[index] ?? ''));
      const names = Array.from(new Set(fresh.map((r) => r.name)));
      if (names.length) celebrate('loss', pick(taunts).replace('{n}', names.join(' et ')));
    }
    seenLosses.current = new Set(keys);

    const earned = allStats.flatMap((stats) =>
      badgesOf(stats).map((badge) => ({ key: `${stats.name}:${badge.id}`, player: stats.name, badge })),
    );
    const stored = readStorage('rl-badges');
    if (stored !== null) {
      const known = new Set<string>(JSON.parse(stored));
      const unlocked = earned.find((entry) => !known.has(entry.key));
      if (unlocked)
        celebrate(
          'badge',
          `Badge débloqué : ${unlocked.badge.emoji} ${unlocked.badge.label} pour ${unlocked.player} !`,
        );
    }
    writeStorage('rl-badges', JSON.stringify(earned.map((entry) => entry.key)));
  }, [data]);

  function toggleSound() {
    const next = !sound;
    setSound(next);
    writeStorage('rl-sound', next ? 'on' : 'off');
  }

  function choosePodium(next: PodiumMode) {
    setPodiumMode(next);
    writeStorage('rl-podium', next);
  }

  function chooseTheme(next: Theme) {
    setTheme(next);
    writeStorage('rl-theme', next);
  }

  function chooseMe(next: string | null) {
    setChosenMe(next);
    if (next) writeStorage('rl-me', next);
    else removeStorage('rl-me');
    const target = next || data?.me;
    if (target && !pending && !busy) {
      setPlayer(target);
      playerTouched.current = false;
    }
  }

  async function installApp() {
    const installWindow = window as InstallWindow;
    const prompt = installWindow.__rlInstall;
    if (installMode === 'prompt' && prompt) {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      installWindow.__rlInstall = null;
      setInstallMode(choice.outcome === 'accepted' ? 'installed' : 'manual');
      return;
    }
    setInstallHelp((shown) => !shown);
  }

  function celebrate(kind: CheerKind, custom?: string) {
    const id = Date.now() + Math.random();
    const text = custom || (kind === 'finish' ? pick(finishers) : pick(cheers));
    const amount = kind === 'loss' ? 0 : kind === 'cheer' ? 30 : 60;
    const pieces = Array.from({ length: amount }, (_, index) => ({
      key: `${id}-${index}`,
      style: {
        '--x': `${Math.random() * 100}%`,
        '--d': `${Math.random() * 0.4}s`,
        '--r': `${Math.random() * 720 - 360}deg`,
        '--c': confettiColors[index % confettiColors.length],
      } as CSSProperties,
    }));
    setCheer({ id, text, kind, pieces });
    if (soundRef.current) {
      playJingle(kind);
      setTimeout(() => speak(text), kind === 'cheer' ? 350 : 550);
    }
    try {
      navigator.vibrate?.(kind === 'loss' ? [30, 60, 30] : kind === 'cheer' ? 50 : [60, 40, 120]);
    } catch {
      // Vibration is optional and refused by some browsers.
    }
    setTimeout(() => setCheer((current) => (current?.id === id ? null : current)), 2600);
  }

  async function submit() {
    if (submissionInFlight.current) return;
    submissionInFlight.current = true;
    setBusy(true);
    setNotice('');
    setError('');
    setUndoable(null);
    try {
      // The same id is resent until the server confirms, so a retry never counts twice.
      const payload: Declaration = pending || {
        id: crypto.randomUUID(),
        player,
        type,
        count: type === 'plank' ? count * 60 : count,
        day: parisDay(),
      };
      setPending(payload);
      // A storage restriction must not prevent saving the exercise on the server.
      writeStorage('rl-pending', JSON.stringify(payload));
      const response = await apiFetch('/api/exercise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw Error(result.error || 'Impossible d’enregistrer cet exercice.');
      setPending(null);
      removeStorage('rl-pending');
      setNotice(`Exercice enregistré pour ${payload.player} : ${exerciseDescription(payload)}.`);
      setUndoable(payload);
      setTimeout(() => setUndoable((current) => (current?.id === payload.id ? null : current)), UNDO_DELAY_MS);
      const state = await refresh();
      const updated = state ? summarizeStats(state, '').find((stats) => stats.name === payload.player) : undefined;
      if (updated) {
        setNotice(
          `Exercice enregistré pour ${payload.player} : ${exerciseDescription(payload)}. Solde restant : ${formatNumber(updated.remaining)} pompes.`,
        );
        celebrate(updated.remaining === 0 ? 'finish' : 'cheer');
      } else celebrate('cheer');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      submissionInFlight.current = false;
      setBusy(false);
    }
  }

  async function undo(exercise: Declaration, ask: boolean) {
    if (ask && !window.confirm(`Annuler la série « ${exerciseDescription(exercise)} » de ${exercise.player} ?`)) return;
    setError('');
    try {
      const response = await apiFetch('/api/exercise', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: exercise.id }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw Error(result.error || 'Impossible d’annuler cette série.');
      setUndoable(null);
      setNotice(`Série annulée : ${exerciseDescription(exercise)} pour ${exercise.player}.`);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function react(exerciseId: string, emoji: string) {
    try {
      const response = await apiFetch('/api/reaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exerciseId, emoji }),
      });
      if (!response.ok) throw Error(((await response.json()) as { error?: string }).error || 'Réaction impossible.');
      try {
        navigator.vibrate?.(15);
      } catch {
        // See celebrate.
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const stats = data ? summarizeStats(data, day) : [];
  const rows = data?.results.filter((r) => (!day || r.day === day) && (test || r.kind === 'match')) || [];
  const exercises = data?.exercises.filter((e) => !day || e.day === day) || [];
  const draft = pending || { type, count: type === 'plank' ? count * 60 : count };
  const selected = stats.find((p) => p.name === (pending?.player || player));
  const effect =
    selected && Number.isFinite(draft.count) && draft.count > 0 ? exerciseEffect(selected.remaining, draft) : null;
  const limit = type === 'plank' ? 1000 : 10000;
  const steps = type === 'plank' ? [0.25, 0.5, 1] : [5, 10, 20];
  const unit = type === 'plank' ? ' min' : '';
  const owed = selected?.remaining ?? 0;
  // Plank pays 15 pushups a minute, by quarter minutes; crunches pay half a pushup each.
  const payoff = Math.min(
    limit,
    type === 'plank' ? Math.ceil((owed / 15) * 4) / 4 : Math.ceil(type === 'crunches' ? owed * 2 : owed),
  );
  function addCount(amount: number) {
    setCount((current) => Math.min(limit, (Number.isFinite(current) ? current : 0) + amount));
  }
  const recapDay = day || today;
  const recap = data ? dailyRecap(data.results, recapDay, data.matchRosters || []) : null;
  const recapLabel = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${recapDay}T12:00:00Z`));
  function yesterday() {
    setDay(shiftDay(parisDay(), -1));
  }

  const monday = weekStart(today);
  const weekLength = (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${monday}T12:00:00Z`)) / 86400000 + 1;
  const weekDays = Array.from({ length: weekLength }, (_, index) => shiftDay(monday, index));
  const weekRecaps = data ? weekDays.map((d) => dailyRecap(data.results, d, data.matchRosters || [])) : [];
  const weekly = roster.map((name) => ({
    name,
    effort: (data?.exercises || [])
      .filter((e) => e.player === name && e.day >= monday && e.day <= today)
      .reduce((sum, e) => sum + pushupCredit(e), 0),
    generated: weekRecaps.reduce((sum, r) => sum + (r.players.find((p) => p.name === name)?.generated || 0), 0),
  }));
  const podium = [...weekly].sort((a, b) => b.effort - a.effort);
  const debtor = [...weekly].sort((a, b) => b.generated - a.generated)[0];
  const mmrPodium = roster
    .map((name) => {
      const row = data?.monthly?.current.rows.find((x) => x.player === name);
      return { name, mmr: row?.mmr ?? null, label: 'MMR 2v2 de ce mois' };
    })
    .sort((a, b) => (b.mmr ?? -1) - (a.mmr ?? -1));
  const podiumRows: { name: string; title: string; value: ReactNode }[] =
    podiumMode === 'mmr'
      ? mmrPodium.map((p) => ({
          name: p.name,
          title: p.label,
          value:
            p.mmr != null ? (
              <>
                {formatNumber(p.mmr)} <small>MMR</small>
              </>
            ) : (
              <small>MMR non reçu</small>
            ),
        }))
      : podium.map((p) => ({
          name: p.name,
          title: '',
          value: (
            <>
              {formatNumber(p.effort)} <small>équiv.</small>
            </>
          ),
        }));
  // Second, first, third: the winner stands in the middle of the podium.
  const podiumSteps = [podiumRows[1], podiumRows[0], podiumRows[2]].filter((row) => row !== undefined);
  const reactionsFor = (id: string) =>
    reactionEmojis.map((emoji) => {
      const reaction = data?.reactions?.find((x) => x.exercise_id === id && x.emoji === emoji);
      return { emoji, count: reaction?.count || 0, mine: !!reaction?.mine };
    });
  const installLabel = touchDevice ? 'Ajouter à l’écran d’accueil' : 'Installer sur le bureau';
  const closeMenu = () => setMenuOpen(false);
  const formLocked = !!pending || busy;
  const bestMmr = mmrPodium[0];
  const bestEffort = podium[0];

  return (
    <main>
      <header>
        <Brand />
        <div className="header-actions" ref={menuRef}>
          <span className="pill">UN POUR TOUS, TOUS POUR LE BUT</span>
          <button
            type="button"
            className="burger"
            aria-label="Menu"
            aria-expanded={menuOpen}
            aria-controls="main-menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span />
            <span />
            <span />
          </button>
          {menuOpen && (
            <div id="main-menu" className="menu">
              <p>QUI ES-TU ?</p>
              {/* biome-ignore lint/a11y/useSemanticElements: same markup as before the migration. */}
              <div className="segmented players" role="group" aria-label="Mon joueur">
                {roster.map((name) => (
                  <button type="button" key={name} aria-pressed={recognized === name} onClick={() => chooseMe(name)}>
                    {name}
                  </button>
                ))}
              </div>
              <small className="menu-hint">
                {chosenMe ? (
                  <>
                    Choisi sur cet appareil ·{' '}
                    <button type="button" className="link" onClick={() => chooseMe(null)}>
                      reconnaissance auto
                    </button>
                  </>
                ) : data?.me ? (
                  `Reconnu grâce à tes déclarations : ${data.me}`
                ) : (
                  'Pas encore reconnu : choisis ton joueur.'
                )}
              </small>
              <p>THÈME</p>
              {/* biome-ignore lint/a11y/useSemanticElements: same markup as before the migration. */}
              <div className="segmented" role="group" aria-label="Thème">
                {themes.map(([value, label]) => (
                  <button type="button" key={value} aria-pressed={theme === value} onClick={() => chooseTheme(value)}>
                    {label}
                  </button>
                ))}
              </div>
              <p>SON</p>
              <button type="button" className="menu-wide" aria-pressed={sound} onClick={toggleSound}>
                {sound ? '♪ Son et voix activés' : 'Son coupé'}
              </button>
              {installMode && installMode !== 'installed' && (
                <>
                  <p>RACCOURCI</p>
                  <button type="button" className="menu-wide install" onClick={installApp}>
                    ⬇ {installLabel}
                  </button>
                  {installHelp && (
                    <small className="menu-hint">
                      {installMode === 'ios'
                        ? 'Sur iPhone/iPad : touche Partager (carré avec une flèche) puis « Sur l’écran d’accueil ».'
                        : 'Ouvre le menu du navigateur (⋮ ou …) puis « Installer l’application » ou « Ajouter à l’écran d’accueil ». Sur ordinateur, Chrome et Edge le proposent.'}
                    </small>
                  )}
                </>
              )}
              {/* biome-ignore lint/a11y/useKeyWithClickEvents: the click comes from the links inside, which the keyboard also activates. */}
              <nav onClick={closeMenu}>
                <a href="#team">Le tableau de l’équipe</a>
                <a href="#exercise">Déclarer un exercice</a>
                <a href="#recap-title">Récap du jour</a>
                <a href="#week">La semaine</a>
                <a href="#monthly-mmr">MMR du mois et boissons</a>
                <a href="#history">Derniers matchs</a>
                <a href="/connexions">Identités des joueurs</a>
                <a href="/direct">Direct depuis le PC · à tester</a>
                <SignOutLink />
              </nav>
            </div>
          )}
        </div>
      </header>

      <section className="intro">
        <div>
          <p className="eyebrow">
            {clubName.toUpperCase()} · <span className="rl-logo" role="img" aria-label="Rocket League" />
          </p>
          <h1>
            On perd ensemble.
            <br />
            <em>On pousse ensemble.</em>
          </h1>
          <p className="muted">Une défaite, 5 pompes. Pompes, gainage ou abdos : chaque effort compte.</p>
          <KickoffScene />
        </div>
        <div className="rule">
          <strong>5</strong>
          <span>POMPES / DÉFAITE</span>
          <small>
            {lastPlaceRule.enabled
              ? 'Dernier aux points du match : +5 si défaite'
              : 'Bonus dernier aux points désactivé'}
          </small>
        </div>
      </section>
      {error && (
        <p className="alert" role="alert">
          {error}{' '}
          <button type="button" onClick={refresh}>
            Actualiser
          </button>
        </p>
      )}
      {data?.rankSource?.stale && (
        <aside className="alert" aria-label="Relevé des rangs arrêté">
          {data.rankSource.lastReadAt
            ? `Les rangs 2v2 ne sont plus relevés automatiquement depuis le ${new Date(data.rankSource.lastReadAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.`
            : 'Les rangs 2v2 n’ont encore jamais été relevés automatiquement.'}{' '}
          Préviens la personne qui gère l’instance : l’observateur des rangs est peut-être en panne.
        </aside>
      )}
      {data?.epicRetired && (
        <aside className="alert" aria-label="Connexion Epic retirée">
          Connexion communautaire Epic retirée. L’application ne se connecte plus à Rocket League à votre place.{' '}
          <a href="/direct">Utiliser le Direct PC</a>.
        </aside>
      )}

      <section id="team">
        <div className="section-title">
          <h2>Le tableau de l’équipe</h2>
          <div className="filters">
            <label>
              Date{' '}
              <input
                type="date"
                aria-label="Date affichée"
                value={day}
                max={today}
                onChange={(event) => {
                  if (event.target.value) setDay(event.target.value);
                }}
              />
            </label>
            <button type="button" onClick={() => setDay(parisDay())}>
              Aujourd’hui
            </button>
            <button type="button" onClick={yesterday}>
              Hier
            </button>
            <button type="button" onClick={() => setDay('')}>
              Tout
            </button>
          </div>
        </div>
        <p className="live-status">
          <span aria-hidden="true" />
          Actualisation toutes les 3 secondes · scores reçus par le Direct PC
        </p>
        <details className="team-info">
          <summary>Comment ça marche ?</summary>
          <p className="muted small">
            La date choisie s’applique aux cartes, au récap et aux historiques. « Tout » affiche toute la période, avec
            le récap du jour. Dette et totaux d’exercices restent cumulés depuis le début.
          </p>
          <p className="muted small">
            Les compteurs indiquent les parties reçues. Les anciennes données Epic restent disponibles ; leur collecte
            est retirée. Le MMR affiche le dernier relevé ou la dernière déclaration du joueur.
          </p>
          <p className="small">
            <a href="/direct">Configurer le direct depuis un PC ↗</a> · Un onglet sur le PC qui joue ; premier essai à
            valider.
          </p>
        </details>
        <SeasonCountdown />
        <div className="cards" ref={cardsRef} onScroll={onCardsScroll}>
          {!data ? (
            <SkeletonCards />
          ) : (
            stats.map((p) => {
              const streak = streakOfPlayer(p.name);
              const all = allStats.find((a) => a.name === p.name) || p;
              const connection = data.epic?.find((c) => c.slot === p.name);
              const historyPending = p.played === 0 && !connection?.last_sync;
              return (
                <article className={p.name === recognized ? 'card me' : 'card'} key={p.name}>
                  <div className="card-top">
                    <span className="avatar">{playerInitials(p.name)}</span>
                    {p.name === recognized && <span className="you">TOI</span>}
                    {streak.current > 0 && (
                      <span className="streak" title={`${streak.current} jour(s) d’affilée avec un exercice`}>
                        🔥 {streak.current} j
                      </span>
                    )}
                    <span className="platform">{playerPlatform(p.name)}</span>
                  </div>
                  <h3>{p.name}</h3>
                  <DoublesRankPanel player={p.name} rank={data.doublesRanks?.find((r) => r.player === p.name)} />
                  <div className="results">
                    <span>
                      <b>{historyPending ? '—' : p.played}</b> parties reçues
                    </span>
                    <span className="win">
                      <b>{historyPending ? '—' : p.wins}</b> victoires
                    </span>
                    <span>
                      <b>{historyPending ? '—' : p.losses}</b> défaites
                    </span>
                  </div>
                  {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: same markup as before the migration. */}
                  <p className="small muted" aria-label={`Collecte de ${p.name}`}>
                    {collectionLabel(data, connection)}
                    {connection?.last_sync && <> Dernière lecture : {parisDateTime(connection.last_sync)}.</>}
                  </p>
                  <div className="debt">
                    <strong>
                      <Odometer value={formatNumber(p.remaining)} />
                    </strong>
                    <span>pompes restantes</span>
                  </div>
                  <div className="progress">
                    <i style={{ width: `${p.due ? Math.min(100, (p.done / p.due) * 100) : 100}%` }} />
                  </div>
                  <p className="small muted">
                    {formatNumber(p.done)} équiv. pompes réalisés · {p.due} dues au total
                  </p>
                  <dl className="exercise-totals">
                    <div>
                      <dt>Pompes</dt>
                      <dd>{formatNumber(p.pushups)}</dd>
                    </div>
                    <div>
                      <dt>Gainage (min)</dt>
                      <dd>{formatNumber(p.plankSeconds / 60)}</dd>
                    </div>
                    <div>
                      <dt>Abdos</dt>
                      <dd>{formatNumber(p.crunches)}</dd>
                    </div>
                  </dl>
                  <ul className="badges" aria-label={`Badges de ${p.name}`}>
                    {badgeRules.map((badge) => {
                      const has = badge.earned(all, streak);
                      return (
                        <li key={badge.id} className={has ? 'earned' : ''} title={badge.label}>
                          <span aria-hidden="true">{badge.emoji}</span>
                          <span className="sr-only">
                            {badge.label}
                            {has ? ' : obtenu' : ' : à débloquer'}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <button
                    type="button"
                    onClick={() => {
                      if (!pending && !busy) {
                        playerTouched.current = true;
                        setPlayer(p.name);
                      }
                      document.getElementById('exercise')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  >
                    Déclarer un exercice ↗
                  </button>
                </article>
              );
            })
          )}
        </div>
        {data && (
          // biome-ignore lint/a11y/useSemanticElements: same markup as before the migration.
          <div className="card-dots" role="group" aria-label="Choisir un joueur">
            {stats.map((p, index) => (
              <button
                type="button"
                key={p.name}
                className={index === activeCard ? 'dot active' : 'dot'}
                aria-label={`Voir la carte de ${p.name}`}
                aria-current={index === activeCard}
                onClick={() => scrollToCard(index)}
              />
            ))}
          </div>
        )}
      </section>

      {data?.monthly && <MonthlyMmr data={data.monthly} onRefresh={refresh} />}

      <section id="exercise" className="exercise">
        <p className="eyebrow">À TOI DE JOUER</p>
        <h2>Déclarer un exercice</h2>
        <p className="muted">Choisis ton effort pour réduire ta dette.</p>
        <div className="equivalences">
          <p>
            1 min de gainage = <b>15 pompes</b>
          </p>
          <p>
            20 abdos = <b>10 pompes</b>
          </p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label>
            Joueur
            <select
              value={player}
              disabled={formLocked}
              onChange={(event) => {
                playerTouched.current = true;
                setPlayer(event.target.value);
              }}
            >
              {roster.map((name) => (
                <option key={name} value={name}>
                  {name}
                  {name === recognized ? ' (toi)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Exercice
            <select
              value={type}
              disabled={formLocked}
              onChange={(event) => {
                const next = event.target.value as ExerciseType;
                setType(next);
                setCount(next === 'plank' ? 1 : next === 'crunches' ? 20 : 5);
              }}
            >
              <option value="pushups">Pompes</option>
              <option value="plank">Gainage</option>
              <option value="crunches">Abdos</option>
            </select>
          </label>
          <label>
            {type === 'plank'
              ? 'Durée de gainage (minutes)'
              : type === 'crunches'
                ? 'Nombre d’abdos'
                : 'Nombre de pompes'}
            <input
              type="number"
              inputMode="decimal"
              min={type === 'plank' ? 0.25 : 1}
              step={type === 'plank' ? 0.25 : 1}
              max={limit}
              required
              value={Number.isNaN(count) ? '' : count}
              disabled={formLocked}
              onChange={(event) => setCount(event.target.valueAsNumber)}
              aria-describedby="exercise-credit"
            />
          </label>
          {/* biome-ignore lint/a11y/useSemanticElements: same markup as before the migration. */}
          <div className="quick-counts" role="group" aria-label="Quantités rapides">
            {steps.map((amount) => (
              <button type="button" key={amount} disabled={formLocked} onClick={() => addCount(amount)}>
                +{formatNumber(amount)}
                {unit}
              </button>
            ))}
            <button type="button" disabled={formLocked || !payoff} onClick={() => setCount(payoff)}>
              Tout rembourser{payoff ? ` (${formatNumber(payoff)}${unit})` : ''}
            </button>
          </div>
          {type === 'plank' && (
            <p className="small muted">Par tranches de 15 secondes : 0,25 min = 15 s ; 0,5 min = 30 s.</p>
          )}
          <div id="exercise-credit" className="credit" aria-live="polite">
            {effect ? (
              <>
                <p>Équivalent : {formatNumber(effect.equivalent)} pompes.</p>
                <p>
                  Dette actuelle : {formatNumber(selected?.remaining ?? 0)} pompes · Réduction :{' '}
                  {formatNumber(effect.reduction)} · Restant : {formatNumber(effect.remaining)}.
                </p>
                {effect.excess > 0 && (
                  <p className="small muted">
                    Cette série dépasse la dette actuelle de {formatNumber(effect.excess)} équiv. pompes. Le solde
                    restera à zéro et toute la série sera conservée dans l’historique et les totaux.
                  </p>
                )}
              </>
            ) : (
              <p>
                {Number.isFinite(draft.count) && draft.count > 0
                  ? 'Chargement du solde…'
                  : 'Saisis une quantité pour voir l’équivalence.'}
              </p>
            )}
          </div>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Enregistrement…' : pending ? 'Réessayer la déclaration' : 'Valider mon exercice →'}
          </button>
          {pending && (
            <p className="small">
              Déclaration en attente : {exerciseDescription(pending)} pour {pending.player}. Réessayer ne la comptera
              pas deux fois.
            </p>
          )}
        </form>
        {notice && (
          <p role="status" className="win">
            {notice}
          </p>
        )}
        {undoable && (
          <button type="button" className="undo" onClick={() => undo(undoable, false)}>
            ↶ Annuler cette série
          </button>
        )}
        <p className="small muted">
          Déclaration pour aujourd’hui. Le solde reste à zéro minimum ; tous les efforts sont comptabilisés et
          conservés.
        </p>
      </section>
      {!exerciseVisible && (
        <a className="fab" href="#exercise">
          + Exercice
        </a>
      )}
      {cheer && (
        <div className={`cheer ${cheer.kind}`} key={cheer.id} aria-hidden="true">
          {cheer.pieces.map((piece) => (
            <i key={piece.key} style={piece.style} />
          ))}
          {cheer.kind !== 'loss' && (
            <div className={cheer.kind === 'finish' ? 'car-run demo' : 'car-run'}>
              <span className="boost" />
              <Car />
            </div>
          )}
          {cheer.kind === 'finish' && (
            <div className="boom">
              <b />
              <b />
              <b />
            </div>
          )}
          <p className={`cheer-text ${cheer.kind}`}>{cheer.text}</p>
        </div>
      )}

      <section className="daily-recap" aria-labelledby="recap-title">
        <div>
          <p className="eyebrow">LE BILAN DU JOUR</p>
          <h2 id="recap-title">Récap du {recapLabel}</h2>
        </div>
        <p className="small muted">
          Journée en heure de Paris · {recapDay === parisDay() ? 'Bilan en cours' : 'Journée passée'} · Date choisie
          dans le tableau de l’équipe · Calculé sur les matchs reçus, même s’ils sont synchronisés plus tard.
        </p>
        {!recap ? (
          // biome-ignore lint/a11y/useAriaPropsSupportedByRole: same markup as before the migration.
          <div className="sk-table" aria-label="Chargement du récap…">
            <i className="sk sk-line" />
            <i className="sk sk-line" />
            <i className="sk sk-line" />
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table aria-label="Récapitulatif quotidien">
                <thead>
                  <tr>
                    <th>Joueur</th>
                    <th>Parties</th>
                    <th>Victoires</th>
                    <th>Défaites</th>
                    <th>Moins de points du match*</th>
                    <th>Pompes générées</th>
                  </tr>
                </thead>
                <tbody>
                  {recap.players.map((p) => (
                    <tr key={p.name}>
                      <td>
                        <b>{p.name}</b>
                      </td>
                      <td data-label="Parties">{p.played}</td>
                      <td data-label="Victoires" className="win">
                        {p.wins}
                      </td>
                      <td data-label="Défaites">{p.losses}</td>
                      <td data-label="Moins de points*">
                        {p.compared > 0 ? (
                          <>
                            {p.lowest} fois
                            <small>
                              sur {p.compared} matchs comparables
                              {p.lowestTies > 0 ? ` · dont ${p.lowestTies} ex æquo` : ''}
                            </small>
                          </>
                        ) : (
                          <span className="muted">Non comparable</span>
                        )}
                        {p.unranked > 0 && (
                          <small>
                            {p.unranked} match{p.unranked > 1 ? 's' : ''} sans comparaison
                          </small>
                        )}
                      </td>
                      <td data-label="Pompes générées">
                        {p.generated}
                        {p.bonus > 0 && <small>dont {p.bonus} de supplément</small>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {recap.matchCount === 0 && (
              <p className="empty">
                Aucun match reçu pour cette journée. Le récap se complétera après synchronisation.
              </p>
            )}
          </>
        )}
        <p className="small muted">
          * Comparaison avec tous les joueurs du match, adversaires compris, seulement si le tableau complet est
          disponible. Les égalités sont indiquées.{' '}
          {lastPlaceRule.enabled
            ? `Une défaite vaut 5 pompes, avec 5 de plus pour le dernier du match${lastPlaceRule.ties === 'none' ? ' uniquement s’il est seul dernier' : ''}.`
            : 'Le supplément dernier aux points reste désactivé.'}
        </p>
      </section>

      <section id="week" className="week" aria-labelledby="week-title">
        <p className="eyebrow">{podiumMode === 'mmr' ? '2V2 CLASSÉ · MOIS EN COURS' : 'DEPUIS LUNDI'}</p>
        <h2 id="week-title">{podiumMode === 'mmr' ? 'Le podium MMR mensuel' : 'Le podium de la semaine'}</h2>
        {/* biome-ignore lint/a11y/useSemanticElements: same markup as before the migration. */}
        <div className="podium-toggle" role="group" aria-label="Classer le podium par">
          <button type="button" aria-pressed={podiumMode === 'effort'} onClick={() => choosePodium('effort')}>
            Efforts
          </button>
          <button type="button" aria-pressed={podiumMode === 'mmr'} onClick={() => choosePodium('mmr')}>
            MMR 2v2
          </button>
        </div>
        {podiumMode === 'mmr' && <SeasonCountdown />}
        {!data ? (
          <div className="sk-table">
            <i className="sk sk-big" />
          </div>
        ) : (
          <>
            {podiumMode === 'mmr' && mmrPodium.some((p) => p.mmr === null) ? (
              <p className="empty small">Les trois MMR du mois sont nécessaires pour afficher le podium.</p>
            ) : (
              <ol className="podium">
                {podiumSteps.map((p) => {
                  const rank = podiumRows.indexOf(p) + 1;
                  return (
                    <li key={p.name} className={`step step-${rank}`} title={p.title}>
                      <span className="step-name">{p.name}</span>
                      <span className="step-value">{p.value}</span>
                      <span className="step-block">{rank}</span>
                    </li>
                  );
                })}
              </ol>
            )}
            <p className="small muted">
              {podiumMode === 'mmr' ? (
                <>
                  {bestMmr && bestMmr.mmr != null
                    ? `${bestMmr.name} a le meilleur MMR 2v2 reçu ce mois.`
                    : 'Les MMR du mois restent à renseigner.'}{' '}
                  Classement provisoire ; les boissons sont attribuées seulement après clôture.{' '}
                  <a href="#monthly-mmr">Voir le défi du mois</a>.
                </>
              ) : (
                <>
                  {bestEffort && bestEffort.effort > 0
                    ? `${bestEffort.name} mène la semaine.`
                    : 'Personne n’a encore bougé cette semaine…'}
                  {debtor && debtor.generated > 0
                    ? ` Lanterne rouge : ${debtor.name} avec ${debtor.generated} pompes générées.`
                    : ''}
                </>
              )}
            </p>
          </>
        )}
      </section>

      <div className="histories">
        <details id="history" className="history fold">
          <summary>
            <h2>Les derniers matchs</h2>
            <span className="small muted">{rows.length} sur la période</span>
          </summary>
          <label className="small">
            <input type="checkbox" checked={test} onChange={(event) => setTest(event.target.checked)} /> Inclure les
            tests bots
          </label>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date / joueur</th>
                  <th>Résultat</th>
                  <th>Points</th>
                  <th>Pompes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.match_guid + r.player_id}>
                    <td>
                      <b>{r.name}</b>
                      <small>
                        {r.day} {r.kind === 'test' ? '· Test bots' : ''}
                      </small>
                      <small>{matchSource(r)}</small>
                    </td>
                    <td>
                      <span
                        className={r.review_required ? 'badge' : r.team === r.winner ? 'badge victory' : 'badge defeat'}
                      >
                        {r.review_required ? 'À vérifier' : r.team === r.winner ? 'Victoire' : 'Défaite'}
                      </span>
                    </td>
                    <td>{r.score}</td>
                    <td>{!r.review_required && r.kind === 'match' && r.team !== r.winner ? '+5' : '0'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && <p className="empty">Aucun match enregistré pour cette période.</p>}
          </div>
        </details>
        <details className="history exercise-history fold">
          <summary>
            <h2>Historique des exercices</h2>
            <span className="small muted">{exercises.length} sur la période</span>
          </summary>
          <p className="small muted">
            Toutes les séries sont conservées. Leur auteur peut annuler une erreur dans les 24 heures.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date / joueur</th>
                  <th>Exercice réalisé</th>
                  <th>Équiv. pompes</th>
                </tr>
              </thead>
              <tbody>
                {exercises.map((e) => {
                  const canUndo = e.mine && Date.now() - Date.parse(e.created) < UNDO_WINDOW_MS;
                  return (
                    <tr key={e.id}>
                      <td>
                        <b>{e.player}</b>
                        <small>
                          {e.day} ·{' '}
                          {new Date(e.created).toLocaleTimeString('fr-FR', {
                            timeZone: 'Europe/Paris',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </small>
                      </td>
                      <td>
                        {exerciseDescription(e)}
                        <div className="reactions">
                          {reactionsFor(e.id).map((r) => (
                            <button
                              type="button"
                              key={r.emoji}
                              aria-pressed={r.mine}
                              aria-label={`Réagir ${r.emoji}`}
                              onClick={() => react(e.id, r.emoji)}
                            >
                              {r.emoji}
                              {r.count > 0 && <span>{r.count}</span>}
                            </button>
                          ))}
                          {canUndo && (
                            <button type="button" className="undo-small" onClick={() => undo(e, true)}>
                              Annuler
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="win">−{formatNumber(pushupCredit(e))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!exercises.length && <p className="empty">Aucun exercice enregistré pour cette période.</p>}
          </div>
        </details>
      </div>
      <section className="sync-summary">
        <div>
          <b>Historique vérifié entre les sources</b>
          <p className="small muted">
            {data?.reliability
              ? `${data.reliability.confirmed} résultat(s) confirmé(s) par les deux sources · ${data.reliability.corrected} corrigé(s) · ${data.reliability.single} reçu(s) d’une seule source`
              : 'Chargement des sources…'}
          </p>
          {!!data?.reliability?.review && (
            <p className="small">{data.reliability.review} résultat(s) à vérifier, exclus du calcul des pompes.</p>
          )}
        </div>
        <a href="/connexions">Identités des joueurs →</a>
      </section>
      <footer>
        <span>
          {clubName.toUpperCase()} · {lastReception(data)}
        </span>
        <p>
          Aucun accès aux sessions Epic. Le Direct nécessite un onglet ouvert sur un PC qui joue. Tests bots exclus du
          bilan.
        </p>
        <p>
          Des parties des supports utilisés sont des marques déposées et/ou des travaux soumis aux droits d’auteur
          d’Epic Games, Inc. Tous droits réservés par Epic. Ce produit n’est pas officiel et n’a pas l’approbation
          d’Epic.
        </p>
        <SignOutLink />
      </footer>
    </main>
  );
}

// A link like before the migration, but signing out is now a POST to the API.
function SignOutLink() {
  return (
    <a
      href="/"
      onClick={(event) => {
        event.preventDefault();
        signOut();
      }}
    >
      Se déconnecter
    </a>
  );
}
