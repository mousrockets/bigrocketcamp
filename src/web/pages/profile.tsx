import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { LockIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { formatNumber, parisDay } from '../../lib/domain';
import { versionLabel } from '../../lib/version';
import { signOut } from '../api';
import { useBoardState } from '../board/board-context';
import { setSound, soundOn } from '../board/feedback';
import { statsOf, streaksOf } from '../board/model';
import { platformLabels, useClub } from '../club';
import { Confirm } from '../components/club/confirm';
import { ListButton, ListGroup, ListLink, ListRow } from '../components/club/list';
import { Note } from '../components/club/page';
import { PlayerAvatar } from '../components/club/player-avatar';
import { Segmented } from '../components/club/segmented';
import { Switch } from '../components/ui/switch';
import { collectorsQuery } from '../queries';
import { type ThemeChoice, themeChoices, useTheme } from '../theme';
import { loadedCommit, useDeployedVersion } from '../version';
import { deleteAccount } from '../writes';
import { ProfileEdit } from './profile-edit';

// The member's own page: their figures, their game, their preferences, their data and their account.

type InstallMode = 'installed' | 'prompt' | 'ios' | 'manual';
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
// index.html keeps the install prompt here: browsers fire it before React starts.
type InstallWindow = Window & { __rlInstall?: InstallPrompt | null };

const roleLabels = { admin: 'administrateur', member: 'membre' } as const;
const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

function useInstall() {
  const [mode, setMode] = useState<InstallMode | null>(null);
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const installWindow = window as InstallWindow;
    const ios =
      /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setTouch(matchMedia('(pointer: coarse)').matches);
    setMode(isStandalone() ? 'installed' : installWindow.__rlInstall ? 'prompt' : ios ? 'ios' : 'manual');
    const ready = () => setMode((current) => (current === 'installed' ? current : 'prompt'));
    const installed = () => {
      installWindow.__rlInstall = null;
      setMode('installed');
    };
    window.addEventListener('rl-install-ready', ready);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('rl-install-ready', ready);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);
  return { mode, setMode, touch };
}

export function ProfilePage() {
  const { me: profile, roster } = useClub();
  const { data, me } = useBoardState();
  const [theme, setTheme] = useTheme();
  const [sound, setSoundState] = useState(soundOn);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [installHelp, setInstallHelp] = useState(false);
  const install = useInstall();
  const erase = useMutation({ mutationFn: deleteAccount }).mutateAsync;
  const { data: devices } = useQuery(collectorsQuery);
  const deployed = useDeployedVersion();
  const outdated = deployed !== null && deployed.commit !== loadedCommit;

  const pseudo = profile.duoPseudo ?? profile.email;
  const index = Math.max(0, roster.indexOf(pseudo));
  const stats = data && me ? statsOf(roster, data).find((line) => line.name === me) : undefined;
  const streak = data && me ? streaksOf(roster, data, parisDay()).get(me) : undefined;
  const rank = data?.doublesRanks?.find((r) => r.player === me);
  const tagline = [rank?.label, profile.platform ? platformLabels[profile.platform] : '', roleLabels[profile.role]]
    .filter(Boolean)
    .join(' · ');
  const active = (devices ?? []).length;

  async function installApp() {
    const installWindow = window as InstallWindow;
    const prompt = installWindow.__rlInstall;
    if (install.mode === 'prompt' && prompt) {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      installWindow.__rlInstall = null;
      install.setMode(choice.outcome === 'accepted' ? 'installed' : 'manual');
      return;
    }
    setInstallHelp((shown) => !shown);
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      await erase();
      location.assign('/');
    } catch (e) {
      setBusy(false);
      setDeleting(false);
      toast.error(
        e instanceof TypeError ? 'Connexion Internet indisponible. Réessaie dans un instant.' : (e as Error).message,
      );
    }
  }

  return (
    <div className="flex flex-col gap-3.5 lg:max-w-[720px]">
      <header className="flex items-center gap-3.5 px-1 pt-1 pb-2 lg:px-0">
        <PlayerAvatar
          name={pseudo}
          me
          index={index}
          className="size-16 [&_[data-slot=avatar-fallback]]:font-heading [&_[data-slot=avatar-fallback]]:text-2xl [&_[data-slot=avatar-fallback]]:font-black"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="truncate font-display text-[28px] leading-none lg:text-[40px]">{pseudo}</h1>
          <span className="text-[13px] text-muted-foreground first-letter:uppercase">{tagline}</span>
        </div>
      </header>
      {me && roster.includes(me) && (
        <Link
          to="/joueurs/$position"
          params={{ position: String(roster.indexOf(me) + 1) }}
          aria-label="Ma fiche joueur"
          className="grid grid-cols-3 rounded-card border border-border bg-card py-3.5 text-foreground no-underline hover:bg-accent/60 hover:no-underline"
        >
          <span className="flex flex-col items-center gap-0.5">
            <b
              className={
                stats && stats.remaining === 0
                  ? 'font-numeral text-[28px] text-settled'
                  : 'font-numeral text-[28px] text-cost'
              }
            >
              {stats ? formatNumber(stats.remaining) : '—'}
            </b>
            <small className="kicker">À rendre</small>
          </span>
          <span className="flex flex-col items-center gap-0.5 border-x border-border">
            <b className="font-numeral text-[28px]">{rank?.mmr != null ? formatNumber(rank.mmr) : '—'}</b>
            <small className="kicker">MMR 2v2</small>
          </span>
          <span className="flex flex-col items-center gap-0.5">
            <b className="font-numeral text-[28px] text-streak">{streak ? `${streak.current} j` : '—'}</b>
            <small className="kicker">Série</small>
          </span>
        </Link>
      )}

      <ListGroup title="Mon jeu">
        <ListButton
          label="Pseudo duo"
          value={
            <>
              {profile.duoPseudo}
              {profile.duoPseudoLocked && <LockIcon aria-label="figé" className="size-3.5" />}
            </>
          }
          onClick={() => setEditing(true)}
          chevron={!profile.duoPseudoLocked}
        />
        <ListButton label="Pseudo solo" value={profile.soloPseudo || 'aucun'} onClick={() => setEditing(true)} />
        <ListButton
          label="Plateforme"
          value={profile.platform ? platformLabels[profile.platform] : 'à choisir'}
          onClick={() => setEditing(true)}
        />
      </ListGroup>

      <ListGroup title="Préférences">
        <ListRow label={<label htmlFor="sound-switch">Son et voix</label>}>
          <Switch
            id="sound-switch"
            checked={sound}
            onCheckedChange={(checked) => {
              setSound(checked);
              setSoundState(checked);
            }}
          />
        </ListRow>
        <div className="flex flex-col gap-2.5 border-t border-border px-4 py-3">
          <span className="text-[15px]">Thème</span>
          <Segmented<ThemeChoice>
            label="Thème"
            items={themeChoices.map(([value, label]) => ({ value, label }))}
            value={theme}
            onChange={setTheme}
            size="sm"
          />
        </div>
        {install.mode && install.mode !== 'installed' && (
          <>
            <ListButton
              label={install.touch ? 'Ajouter à l’écran d’accueil' : 'Installer sur le bureau'}
              onClick={installApp}
            />
            {installHelp && (
              <p className="border-t border-border px-4 py-3 text-xs leading-[1.45] text-muted-foreground">
                {install.mode === 'ios'
                  ? 'Sur iPhone ou iPad : touche Partager (le carré avec une flèche), puis « Sur l’écran d’accueil ».'
                  : 'Ouvre le menu du navigateur (⋮ ou …), puis « Installer l’application » ou « Ajouter à l’écran d’accueil ». Sur ordinateur, Chrome et Edge le proposent.'}
              </p>
            )}
          </>
        )}
      </ListGroup>

      <ListGroup title="Mes données">
        <ListLink to="/exercices" label="Historique des exercices" />
        <ListLink to="/connexions" label="Identités de jeu" />
        <ListLink
          to="/direct"
          label="Collecteur Windows et Direct PC"
          value={active ? `${active} associé${active > 1 ? 's' : ''}` : undefined}
        />
      </ListGroup>

      <ListGroup title="Club">
        {profile.role === 'admin' && <ListLink to="/reglages" label="Réglages du club" value="Admin" />}
        <ListButton label="Se déconnecter" value={profile.email} onClick={() => signOut()} chevron={false} />
        <ListButton
          label="Supprimer mon compte…"
          onClick={() => setDeleting(true)}
          chevron={false}
          className="text-destructive"
        />
      </ListGroup>

      <Note className="px-1.5 text-[11px] text-[#8e9097]">
        {versionLabel(deployed ?? { commit: loadedCommit, deployedAt: null }, loadedCommit)}
        {outdated && (
          <>
            {' · '}
            <a
              href="/"
              onClick={(event) => {
                event.preventDefault();
                location.reload();
              }}
            >
              Recharger
            </a>
          </>
        )}
        . Des parties des supports utilisés sont des marques déposées et/ou des travaux soumis aux droits d’auteur
        d’Epic Games, Inc. Tous droits réservés par Epic. Ce produit n’est pas officiel et n’a pas l’approbation d’Epic.
      </Note>

      <ProfileEdit me={profile} open={editing} onOpenChange={setEditing} />
      <Confirm
        open={deleting}
        onOpenChange={setDeleting}
        title="Supprimer mon compte ?"
        action="Oui, supprimer mon compte"
        onConfirm={remove}
        busy={busy}
      >
        Ton adresse e-mail, ton profil, tes connexions et tes collecteurs sont effacés, et tu ne peux plus te connecter.
        Tes matchs, exercices et rangs restent dans l’historique du club, sous ton pseudo duo.
      </Confirm>
    </div>
  );
}
