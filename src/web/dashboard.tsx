import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { Roster } from '../lib/club';
import { defeatMessage } from '../lib/defeat-message';
import {
  dailyRecap,
  defaultLastPlaceRules,
  exerciseDescription,
  exerciseEffect,
  exerciseReceipt,
  exerciseTypes,
  formatNumber,
  lastPlaceBonus,
  lastPlaceRuleOn,
  matchIndex,
  parisDay,
  pushupCredit,
  summarize,
  validateExercise,
} from '../lib/domain';
import { matchHistory } from '../lib/match-history';
import type { LastPlaceRules } from '../lib/match-rules';
import { currentSeason, seasonEndLabel, seasonTiming } from '../lib/season';
import { versionLabel } from '../lib/version';
import { apiFetch, signOut } from './api';
import { useBoard } from './board-client';
import { Brand } from './brand';
import { playerPlatform, useClub } from './club';
import type { MonthlyState } from './monthly-mmr';
import { MonthlyMmr } from './monthly-mmr';
import { playerInitials } from './players';
import { loadedCommit, useDeployedVersion } from './version';

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
  goals?: number;
  received?: string;
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
type SeasonPeak = { mmr: number; label: string; tier: number | null };
type SoloRank = {
  mmr: number | null;
  label: string;
  tier: number | null;
  matchesPlayed: number | null;
  status: string;
  fetchedAt: string | null;
  peak: SeasonPeak | null;
};
type DoublesRank = {
  player: string;
  mmr: number | null;
  label: string;
  tier: number | null;
  matchesPlayed: number | null;
  status: string;
  fetchedAt: string | null;
  /** Absent from an API older than the season peaks. */
  peak?: SeasonPeak | null;
  solo?: SoloRank | null;
};
type Reaction = { exercise_id: string; emoji: string; count: number; mine: number };
type State = {
  results: Result[];
  exercises: Exercise[];
  collectors: { last_seen: string }[];
  matchRosters?: { match_guid: string; expected_players: number }[];
  reliability?: { confirmed: number; single: number; corrected: number; review: number };
  doublesRanks?: DoublesRank[];
  reactions?: Reaction[];
  me?: string | null;
  monthly?: MonthlyState;
  rankSource?: { lastReadAt: string | null; stale: boolean } | null;
  rules?: { lastPlace: LastPlaceRules };
};

/** The +5 as the club set it over time; a board from an older API has none, the default applies. */
const lastPlaceRulesOf = (state: State | null): LastPlaceRules => state?.rules?.lastPlace ?? defaultLastPlaceRules;
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

const cheersFor = (clubName: string) => {
  const clubShortName = clubName.split(' ').at(-1) ?? clubName;
  return [
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
};
const finishers = [
  'Dette réglée ! Free-play mérité.',
  'Zéro pompe due. Champion du monde !',
  'Ardoise effacée ! Tu peux re-perdre tranquille.',
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
const isLossIn = (roster: Roster) => (r: Result) =>
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

// The exercise form survives a reload to a newer version: sessionStorage lasts as long as the tab.
const draftKey = 'rl-draft';
type Draft = { player: string; type: ExerciseType; count: number; playerTouched: boolean };

function saveDraft(draft: Draft) {
  try {
    sessionStorage.setItem(draftKey, JSON.stringify(draft));
  } catch {
    // See readStorage.
  }
}

/** Reloads to the deployed version, keeping the form as it is. */
function reloadKeeping(draft: Draft | null) {
  if (draft) saveDraft(draft);
  location.reload();
}

function takeDraft(roster: Roster): Draft | null {
  try {
    const stored = sessionStorage.getItem(draftKey);
    sessionStorage.removeItem(draftKey);
    const draft = stored ? (JSON.parse(stored) as Partial<Draft>) : null;
    if (!draft || !roster.includes(draft.player ?? '') || !exerciseTypes.includes(draft.type as ExerciseType)) {
      return null;
    }
    return {
      player: draft.player as string,
      type: draft.type as ExerciseType,
      count: typeof draft.count === 'number' ? draft.count : Number.NaN,
      playerTouched: draft.playerTouched === true,
    };
  } catch {
    return null;
  }
}

// How long a visible page must stay untouched before it reloads to a newer version.
const idleBeforeReload = 30_000;

function summarizeStats(roster: Roster, state: State, day: string) {
  return summarize(
    roster,
    state.results,
    state.exercises,
    day,
    state.matchRosters || [],
    lastPlaceRulesOf(state),
  ) as PlayerStats[];
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

const readingTime = (date: string) =>
  new Date(date).toLocaleString('fr-FR', {
    timeZone: 'Europe/Paris',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

function RankName({ tier, label }: { tier: number | null; label: string }) {
  return (
    <>
      {tier != null && (
        <img className="rank-icon" src={`/rocket-league/ranks/${tier}.png`} alt="" width={18} height={18} />
      )}
      {label}
    </>
  );
}

function RankDetails({ matchesPlayed, peak }: { matchesPlayed: number | null; peak: SeasonPeak | null | undefined }) {
  return (
    <>
      {matchesPlayed != null && (
        <p className="rank-meta">
          {formatNumber(matchesPlayed)} {matchesPlayed > 1 ? 'matchs classés' : 'match classé'} en 2v2
        </p>
      )}
      {peak && (
        <p className="rank-meta">
          Pic de la saison : {formatNumber(peak.mmr)} MMR · <RankName tier={peak.tier} label={peak.label} />
        </p>
      )}
    </>
  );
}

/** What keeps a solo account from showing a fresh rank, said so the player knows what to do. */
const soloProblems: Record<string, string> = {
  waiting: 'En attente du prochain relevé.',
  not_found: 'Aucun compte Epic n’a exactement ce nom : pseudo solo à vérifier dans le profil.',
  needs_player_id:
    'Aucun compte Epic n’a ce nom. Sur console, le pseudo solo doit être le nom d’affichage Epic du compte lié à Epic.',
  lookup_unavailable: 'Recherche du compte indisponible pour l’instant : nouvel essai demain.',
  read_failed: 'Le jeu n’a pas répondu pour ce compte lors du dernier relevé.',
};

function SoloRankBlock({ rank }: { rank: SoloRank }) {
  const notFound = rank.status === 'not_found' || rank.status === 'needs_player_id';
  const problem = rank.status === 'ready' ? null : (soloProblems[rank.status] ?? soloProblems.waiting);
  return (
    <div className="rank-solo">
      <span className="rank-mode">SOLO</span>
      <p className="rank-name">
        {notFound ? 'Compte solo introuvable' : <RankName tier={rank.tier} label={rank.label} />}
      </p>
      {rank.mmr != null && !notFound && (
        <strong className="rank-mmr">
          {formatNumber(rank.mmr)} <span>MMR</span>
        </strong>
      )}
      {!notFound && <RankDetails matchesPlayed={rank.matchesPlayed} peak={rank.peak} />}
      {problem && <p className="rank-meta">{problem}</p>}
      {rank.fetchedAt && rank.mmr != null && !notFound && (
        <p className="rank-meta">
          {rank.status !== 'ready' ? 'Dernière valeur connue · ' : ''}
          {readingTime(rank.fetchedAt)}
        </p>
      )}
    </div>
  );
}

function DoublesRankPanel({ player, rank }: { player: string; rank: DoublesRank | undefined }) {
  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: same markup as before the migration.
    <div className="rank-panel" aria-label={`Classement 2v2 de ${player}`}>
      <span className="rank-mode">2V2 CLASSÉ · DERNIER RELEVÉ</span>
      <p className="rank-name">
        <RankName tier={rank?.tier ?? null} label={rank?.label || 'Classement non reçu'} />
      </p>
      {rank?.mmr != null ? (
        <strong className="rank-mmr">
          {formatNumber(rank.mmr)} <span>MMR</span>
        </strong>
      ) : (
        <p className="small muted">MMR non reçu</p>
      )}
      <RankDetails matchesPlayed={rank?.matchesPlayed ?? null} peak={rank?.peak} />
      {rank?.fetchedAt && (
        <p className="rank-meta">
          {rank.status !== 'ready' ? 'Dernière valeur connue · ' : ''}
          {readingTime(rank.fetchedAt)}
        </p>
      )}
      {rank?.status === 'unavailable' && <p className="rank-meta">Actualisation du classement indisponible.</p>}
      {rank?.solo && <SoloRankBlock rank={rank.solo} />}
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
  const { roster } = useClub();
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

const outcomeLabel = {
  victory: 'Victoire',
  defeat: 'Défaite',
  'between-members': 'Entre membres',
  review: 'À vérifier',
} as const;
const outcomeClass = {
  victory: 'badge victory',
  defeat: 'badge defeat',
  'between-members': 'badge',
  review: 'badge',
} as const;
const matchDay = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const matchTime = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });

/** "ven. 6 nov. · 22:30": the match's day, and when it was received when known. */
function matchWhen(day: string, received: string | null) {
  const date = matchDay.format(new Date(`${day}T12:00:00Z`));
  const at = received ? new Date(received) : null;
  return at && !Number.isNaN(at.getTime()) ? `${date} · ${matchTime.format(at)}` : date;
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
  return 'En attente de la première collecte';
}

export function Dashboard() {
  const { name: clubName, roster, players, me } = useClub();
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
  const submissionInFlight = useRef(false);
  const playerTouched = useRef(false);
  const seenLosses = useRef<Set<string> | null>(null);
  const soundRef = useRef(sound);
  soundRef.current = sound;

  const refresh = useBoard<State>(roster, setData, setError);

  // biome-ignore lint/correctness/useExhaustiveDependencies: restores preferences once.
  useEffect(() => {
    let hiddenAt = 0;
    const onVisible = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        return;
      }
      // An installed app can stay open for days: reload after a long pause to run the latest published version.
      if (isStandalone() && hiddenAt && Date.now() - hiddenAt > 300000 && !submissionInFlight.current) {
        location.reload();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    if (readStorage('rl-sound') === 'off') setSound(false);
    const savedTheme = readStorage('rl-theme');
    setTheme(savedTheme === 'light' || savedTheme === 'auto' ? savedTheme : 'dark');
    const savedMe = readStorage('rl-me');
    if (savedMe && roster.includes(savedMe)) setChosenMe(savedMe);
    if (readStorage('rl-podium') === 'mmr') setPodiumMode('mmr');
    const draft = takeDraft(roster);
    if (draft) {
      setPlayer(draft.player);
      setType(draft.type);
      setCount(draft.count);
      playerTouched.current = draft.playerTouched;
    }
    try {
      const stored = readStorage('rl-pending');
      if (stored) {
        const restored = validateExercise(roster, JSON.parse(stored)) as Declaration;
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
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const deployed = useDeployedVersion();
  const outdated = deployed !== null && deployed.commit !== loadedCommit;
  // A declaration being sent or still undoable keeps the page as it is. A focused field, an open menu or a
  // declaration waiting to be resent does not: the form and the declaration are kept across the reload, and any
  // activity postpones it.
  const reloadHeld = busy || undoable !== null;
  const formDraft = useRef<Draft | null>(null);
  formDraft.current = { player, type, count, playerTouched: playerTouched.current };

  // A newer version answers: reload once the page is hidden, or untouched for 30 s (typing, scrolling or
  // tapping counts as activity), keeping the form as it is.
  useEffect(() => {
    if (!outdated || reloadHeld) return;
    let timer = 0;
    const reloadWhenIdle = () => {
      clearTimeout(timer);
      timer = window.setTimeout(reloadIfSafe, document.hidden ? 0 : idleBeforeReload);
    };
    function reloadIfSafe() {
      if (submissionInFlight.current) {
        timer = window.setTimeout(reloadIfSafe, idleBeforeReload);
        return;
      }
      reloadKeeping(formDraft.current);
    }
    const activity = ['pointerdown', 'keydown', 'input', 'wheel', 'touchstart'] as const;
    for (const event of activity) window.addEventListener(event, reloadWhenIdle, { passive: true });
    document.addEventListener('visibilitychange', reloadWhenIdle);
    reloadWhenIdle();
    return () => {
      clearTimeout(timer);
      for (const event of activity) window.removeEventListener(event, reloadWhenIdle);
      document.removeEventListener('visibilitychange', reloadWhenIdle);
    };
  }, [outdated, reloadHeld]);

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
  const allStats = data ? summarizeStats(roster, data, '') : [];
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
    const losses = data.results.filter(isLossIn(roster));
    const keys = losses.map((r) => `${r.match_guid}:${r.player_id}`);
    const seen = seenLosses.current;
    if (seen) {
      const fresh = losses.filter((_, index) => !seen.has(keys[index] ?? ''));
      if (fresh.length) {
        const matches = matchIndex(data.results, data.matchRosters || []);
        const defeats = fresh.map((r) => ({
          player: r.name,
          pushups: 5 + lastPlaceBonus(r, matches, roster, lastPlaceRulesOf(data)),
        }));
        celebrate('loss', defeatMessage(defeats));
      }
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
    const text = custom || (kind === 'finish' ? pick(finishers) : pick(cheersFor(clubName)));
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
      const debtBefore = stats.find((line) => line.name === payload.player)?.remaining ?? 0;
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
      const updated = state
        ? summarizeStats(roster, state, '').find((stats) => stats.name === payload.player)
        : undefined;
      if (updated) {
        setNotice(exerciseReceipt(payload.player, payload, debtBefore, updated.remaining));
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

  const stats = data ? summarizeStats(roster, data, day) : [];
  // Only the club's own players: opponents and strangers stay in the stored scoreboard, not in the history.
  const rows =
    data?.results.filter((r) => roster.includes(r.name) && (!day || r.day === day) && (test || r.kind === 'match')) ||
    [];
  const indexedMatches = data ? matchIndex(data.results, data.matchRosters || []) : new Map();
  const lastPlaceRules = lastPlaceRulesOf(data);
  const lastPlaceRule = lastPlaceRuleOn(lastPlaceRules, today);
  const history = data ? matchHistory(rows, data.results, indexedMatches, roster, lastPlaceRules) : [];
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
  const recapRule = lastPlaceRuleOn(lastPlaceRules, recapDay);
  const recap = data ? dailyRecap(roster, data.results, recapDay, data.matchRosters || [], lastPlaceRules) : null;
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
  const weekRecaps = data
    ? weekDays.map((d) => dailyRecap(roster, data.results, d, data.matchRosters || [], lastPlaceRules))
    : [];
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
              ? 'Le moins de points de l’équipe : +5 si défaite'
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
          Mise à jour en direct · scores reçus par le Direct PC
        </p>
        <details className="team-info">
          <summary>Comment ça marche ?</summary>
          <p className="muted small">
            La date choisie s’applique aux cartes, au récap et aux historiques. « Tout » affiche toute la période, avec
            le récap du jour. Dette et totaux d’exercices restent cumulés depuis le début.
          </p>
          <p className="muted small">
            Les compteurs indiquent les parties reçues. Le MMR affiche le dernier relevé de la source de rangs.
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
              const historyPending = p.played === 0;
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
                    <span className="platform">{playerPlatform(players, p.name)}</span>
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
                  {historyPending && <p className="small muted">En attente du Direct PC.</p>}
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
          * Comparaison entre les joueurs du club d’une même équipe, quand ils sont au moins deux. Les égalités sont
          indiquées.{' '}
          {recapRule.enabled
            ? `Une défaite vaut 5 pompes, avec 5 de plus pour celui du club qui a le moins de points dans l’équipe${recapRule.ties === 'none' ? ', sauf égalité' : ''}.`
            : 'Ce jour-là, une défaite vaut 5 pompes, sans supplément pour le dernier aux points.'}
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
              <p className="empty small">Il faut le MMR du mois de chaque joueur pour afficher le podium.</p>
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
            <span className="small muted">
              {history.length} match{history.length > 1 ? 's' : ''} sur la période
            </span>
          </summary>
          <label className="small">
            <input type="checkbox" checked={test} onChange={(event) => setTest(event.target.checked)} /> Inclure les
            tests bots
          </label>
          <ol className="match-list">
            {history.map((match) => (
              <li key={match.guid} className="match-card">
                <div className="match-head">
                  <span className={outcomeClass[match.outcome]}>{outcomeLabel[match.outcome]}</span>
                  {match.score && (
                    <b className="match-score" title="Buts de l’équipe du club, puis des adversaires">
                      {match.score[0]} – {match.score[1]}
                    </b>
                  )}
                  <small>
                    {matchWhen(match.day, match.received)}
                    {match.kind === 'test' ? ' · Test bots' : ''}
                    {match.left ? ' · Un joueur est parti' : ''}
                  </small>
                </div>
                <ul className="match-players">
                  {match.players.map(({ row, pushups, lastPlace }) => (
                    <li key={row.player_id}>
                      <b>{row.name}</b>
                      <span className="match-points">{formatNumber(row.score)} pts</span>
                      <span className={pushups ? 'match-pushups owed' : 'match-pushups'}>
                        {pushups ? `+${pushups}` : '0'}
                      </span>
                      {lastPlace && <small>Moins de points de l’équipe : +5</small>}
                    </li>
                  ))}
                </ul>
                {match.players[0] && <small className="match-source">{matchSource(match.players[0].row)}</small>}
              </li>
            ))}
          </ol>
          {!history.length && <p className="empty">Aucun match enregistré pour cette période.</p>}
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
        <p>Le Direct nécessite un onglet ouvert sur un PC qui joue. Tests bots exclus du bilan.</p>
        <p>
          Des parties des supports utilisés sont des marques déposées et/ou des travaux soumis aux droits d’auteur
          d’Epic Games, Inc. Tous droits réservés par Epic. Ce produit n’est pas officiel et n’a pas l’approbation
          d’Epic.
        </p>
        <nav className="footer-links" aria-label="Mon compte">
          <a href="/profil">Mon profil</a>
          {me.role === 'admin' && <a href="/reglages">Réglages du club</a>}
          <SignOutLink />
        </nav>
        <p className="small muted">
          {versionLabel(deployed ?? { commit: loadedCommit, deployedAt: null }, loadedCommit)}
          {outdated && (
            <>
              {' · '}
              <a
                href="/"
                onClick={(event) => {
                  event.preventDefault();
                  reloadKeeping(formDraft.current);
                }}
              >
                Recharger
              </a>
            </>
          )}
        </p>
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
