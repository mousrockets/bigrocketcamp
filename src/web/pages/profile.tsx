import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { cn } from 'cn';
import { type ReactNode, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { type Platform, platforms } from '../../lib/club';
import { formatNumber, parisDay } from '../../lib/domain';
import type { OwnProfile } from '../../lib/members';
import { versionLabel } from '../../lib/version';
import { signOut } from '../api';
import { useBoardState } from '../board/board-context';
import { setSound, soundOn } from '../board/feedback';
import { statsOf, streaksOf, tierOf } from '../board/model';
import { platformLabels, useClub } from '../club';
import { Confirm } from '../components/club/confirm';
import { ListButton, ListGroup, ListLink, ListRow, listRowClasses } from '../components/club/list';
import { fieldVariants, Note, Panel } from '../components/club/page';
import { PlayerAvatar } from '../components/club/player-avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { collectorsQuery } from '../queries';
import { type ThemeChoice, themeChoices, useTheme } from '../theme';
import { loadedCommit, useDeployedVersion } from '../version';
import { deleteAccount, saveProfile } from '../writes';
import { ProfileEdit } from './profile-edit';

// The member's own page: their figures, their game, their preferences, their data and their account. A phone
// stacks it under the member's name; a wide screen puts a summary card on the left and the lists on the right,
// where the solo pseudo and the platform change in place.

type InstallMode = 'installed' | 'prompt' | 'ios' | 'manual';
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
// index.html keeps the install prompt here: browsers fire it before React starts.
type InstallWindow = Window & { __rlInstall?: InstallPrompt | null };

const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
const networkError = (e: unknown) =>
  e instanceof TypeError ? 'Connexion Internet indisponible. Réessaie dans un instant.' : (e as Error).message;

function useInstall() {
  const [mode, setMode] = useState<InstallMode | null>(null);
  const [touch, setTouch] = useState(false);
  const [mac, setMac] = useState(false);
  useEffect(() => {
    const installWindow = window as InstallWindow;
    const ios =
      /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setTouch(matchMedia('(pointer: coarse)').matches);
    setMac(/mac/i.test(navigator.platform));
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
  return { mode, setMode, touch, mac };
}

/** The design's closed padlock, beside a duo pseudo that matches already hold. */
function LockedIcon() {
  return (
    <svg
      role="img"
      aria-label="Figé"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/** The three figures: what is owed, the 2v2 rating, the streak. */
function Figures({
  owed,
  mmr,
  streak,
  wide,
}: {
  owed: number | undefined;
  mmr: number | null | undefined;
  streak: number | undefined;
  wide?: boolean;
}) {
  const figure = cn('font-numeral', wide ? 'text-[30px]' : 'text-[28px]');
  const cell = cn('flex flex-col gap-0.5', !wide && 'items-center');
  return (
    <>
      <span className={cell}>
        <b className={cn(figure, owed === 0 ? 'text-settled' : 'text-cost')}>
          {owed != null ? formatNumber(owed) : '—'}
        </b>
        <small className="kicker">À rendre</small>
      </span>
      <span className={cn(cell, !wide && 'border-x border-border')}>
        <b className={figure}>{mmr != null ? formatNumber(mmr) : '—'}</b>
        <small className="kicker">MMR 2v2</small>
      </span>
      <span className={cell}>
        <b className={cn(figure, 'text-streak')}>{streak != null ? `${streak} j` : '—'}</b>
        <small className="kicker">Série</small>
      </span>
    </>
  );
}

/** A wide screen's solo pseudo, changed in place: saved when the field is left or Enter is pressed. */
function SoloField({ me, busy, onSave }: { me: OwnProfile; busy: boolean; onSave: (solo: string) => void }) {
  const [solo, setSolo] = useState(me.soloPseudo ?? '');
  const commit = () => {
    if (solo.trim() !== (me.soloPseudo ?? '')) onSave(solo.trim());
  };
  return (
    <label htmlFor="solo-inline" className={cn(listRowClasses.row, 'hidden lg:flex')}>
      <span>Pseudo solo</span>
      <Input
        id="solo-inline"
        maxLength={32}
        placeholder="Nom d’affichage Epic"
        value={solo}
        disabled={busy}
        onChange={(event) => setSolo(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
        }}
        className={cn(fieldVariants({ size: 'xs' }), 'w-[220px] max-w-full')}
      />
    </label>
  );
}

const platformItems = platforms.map((value) => ({ value, label: platformLabels[value] }));

function PlatformField({ me, busy, onSave }: { me: OwnProfile; busy: boolean; onSave: (platform: Platform) => void }) {
  return (
    <div className={cn(listRowClasses.row, 'hidden lg:flex')}>
      <label htmlFor="platform-inline">Plateforme</label>
      <Select
        items={platformItems}
        value={me.platform}
        disabled={busy}
        onValueChange={(value) => value && value !== me.platform && onSave(value as Platform)}
      >
        <SelectTrigger
          id="platform-inline"
          className={cn(
            fieldVariants({ size: 'xs' }),
            'w-[220px] max-w-full data-[size=default]:h-[42px] data-placeholder:text-foreground [&>svg]:text-foreground',
          )}
        >
          <SelectValue placeholder="À choisir" />
        </SelectTrigger>
        <SelectContent>
          {platformItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** The theme, which the design leaves out: a row whose value opens the three choices. */
function ThemeRow() {
  const [theme, setTheme] = useTheme();
  const label = themeChoices.find(([value]) => value === theme)?.[1];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<button type="button" className={cn(listRowClasses.row, listRowClasses.action, 'cursor-pointer')} />}
      >
        <span>Thème</span>
        <span className={listRowClasses.value}>
          {label}
          <span aria-hidden="true">›</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as ThemeChoice)}>
          {themeChoices.map(([value, choice]) => (
            <DropdownMenuRadioItem key={value} value={value} closeOnClick>
              {choice}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** One version of the page per screen width, side by side in the page: only one shows. */
const phoneOnly = 'contents lg:hidden';
const wideOnly = 'hidden lg:contents';

export function ProfilePage() {
  const { me: profile, roster } = useClub();
  const { data, me } = useBoardState();
  const [sound, setSoundState] = useState(soundOn);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [installHelp, setInstallHelp] = useState(false);
  const install = useInstall();
  const erase = useMutation({ mutationFn: deleteAccount }).mutateAsync;
  const save = useMutation({ mutationFn: saveProfile }).mutateAsync;
  const { data: devices } = useQuery(collectorsQuery);
  const deployed = useDeployedVersion();
  const outdated = deployed !== null && deployed.commit !== loadedCommit;

  const pseudo = profile.duoPseudo ?? profile.email;
  const index = Math.max(0, roster.indexOf(pseudo));
  const stats = data && me ? statsOf(roster, data).find((line) => line.name === me) : undefined;
  const streak = data && me ? streaksOf(roster, data, parisDay()).get(me) : undefined;
  const rank = data?.doublesRanks?.find((r) => r.player === me);
  const tagline = [rank?.label ? tierOf(rank.label) : '', 'bras en construction'].filter(Boolean).join(' · ');
  const active = (devices ?? []).length;
  const activeLabel = active ? `${active} actif${active > 1 ? 's' : ''}` : undefined;
  const ownCard = me && roster.includes(me) ? String(roster.indexOf(me) + 1) : null;
  const figures = { owed: stats?.remaining, mmr: rank?.mmr, streak: streak?.current };
  const admin = profile.role === 'admin';

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
      toast.error(networkError(e));
    }
  }

  /** A change made in place on a wide screen; the roster and the board depend on it, so the page reloads. */
  async function saveInPlace(change: { soloPseudo?: string; platform?: Platform }) {
    if (busy || !profile.platform) return;
    setBusy(true);
    try {
      await save({
        duoPseudo: profile.duoPseudo ?? '',
        soloPseudo: change.soloPseudo ?? profile.soloPseudo ?? '',
        platform: change.platform ?? profile.platform,
      });
      location.reload();
    } catch (e) {
      toast.error(networkError(e));
      setBusy(false);
    }
  }

  const avatarFont =
    '[&_[data-slot=avatar-fallback]]:font-heading [&_[data-slot=avatar-fallback]]:font-black [&_[data-slot=avatar-fallback]]:[font-stretch:75%]';
  const signOutRow = (
    <ListButton label="Se déconnecter" value={profile.email} onClick={() => signOut()} chevron={false} />
  );
  const deleteRow = (
    <ListButton
      label="Supprimer mon compte…"
      onClick={() => setDeleting(true)}
      chevron={false}
      className="text-destructive hover:text-destructive"
    />
  );
  const group = (title: string, children: ReactNode, className: string) => (
    <div className={className}>
      <ListGroup title={title}>{children}</ListGroup>
    </div>
  );

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-start lg:gap-6">
      <div className={phoneOnly}>
        <header className="flex items-center gap-3.5 px-1 pt-1 pb-2">
          <PlayerAvatar
            name={pseudo}
            me
            index={index}
            className={cn('size-16 [&_[data-slot=avatar-fallback]]:text-2xl', avatarFont)}
          />
          <div className="flex min-w-0 flex-col gap-[3px]">
            <h1 className="font-display text-[28px] leading-none">{pseudo}</h1>
            <span className="text-[13px] text-muted-foreground">{tagline}</span>
          </div>
        </header>
        {ownCard && (
          <Link
            to="/joueurs/$position"
            params={{ position: ownCard }}
            aria-label="Ma fiche joueur"
            className="grid grid-cols-3 rounded-card border border-border bg-card py-3.5 text-foreground no-underline hover:text-foreground"
          >
            <Figures {...figures} />
          </Link>
        )}
      </div>

      <Panel aria-label="Résumé" className="hidden flex-[1_1_350px] items-center gap-3.5 px-6 py-7 text-center lg:flex">
        <PlayerAvatar
          name={pseudo}
          me
          index={index}
          className={cn('size-24 [&_[data-slot=avatar-fallback]]:text-[34px]', avatarFont)}
        />
        <h1 className="font-display text-[34px] leading-none">{pseudo}</h1>
        <span className="text-sm text-muted-foreground">{tagline}</span>
        <div className="mt-2 grid w-full grid-cols-3 border-t border-border pt-4">
          <Figures {...figures} wide />
        </div>
        {ownCard && (
          <Link
            to="/joueurs/$position"
            params={{ position: ownCard }}
            className="flex min-h-10 items-center text-sm font-semibold"
          >
            Voir ma fiche joueur →
          </Link>
        )}
      </Panel>

      <div className="contents lg:flex lg:min-w-0 lg:flex-[2_1_460px] lg:flex-col lg:gap-5">
        <ListGroup title="Mon jeu">
          {profile.duoPseudoLocked ? (
            <ListRow label="Pseudo duo">
              {profile.duoPseudo}
              <LockedIcon />
            </ListRow>
          ) : (
            <ListButton label="Pseudo duo" value={profile.duoPseudo} onClick={() => setEditing(true)} />
          )}
          <ListButton
            label="Pseudo solo"
            value={profile.soloPseudo || 'aucun'}
            onClick={() => setEditing(true)}
            className="lg:hidden"
          />
          <SoloField me={profile} busy={busy} onSave={(soloPseudo) => saveInPlace({ soloPseudo })} />
          <ListButton
            label="Plateforme"
            value={profile.platform ? platformLabels[profile.platform] : 'à choisir'}
            onClick={() => setEditing(true)}
            className="lg:hidden"
          />
          <PlatformField me={profile} busy={busy} onSave={(platform) => saveInPlace({ platform })} />
        </ListGroup>

        <ListGroup title="Préférences">
          <ListRow label={<label htmlFor="sound-switch">Son, voix et punchlines</label>}>
            <Switch
              id="sound-switch"
              checked={sound}
              onCheckedChange={(checked) => {
                setSound(checked);
                setSoundState(checked);
              }}
            />
          </ListRow>
          <ThemeRow />
          {install.mode && install.mode !== 'installed' && (
            <>
              <ListButton
                label={
                  install.touch ? 'Ajouter à l’écran d’accueil' : `Installer l’app sur ce ${install.mac ? 'Mac' : 'PC'}`
                }
                onClick={installApp}
              />
              {installHelp && (
                <p className="border-t border-border px-4 py-3 text-xs leading-[1.45] text-muted-foreground lg:px-[18px]">
                  {install.mode === 'ios'
                    ? 'Sur iPhone ou iPad : touche Partager (le carré avec une flèche), puis « Sur l’écran d’accueil ».'
                    : 'Ouvre le menu du navigateur (⋮ ou …), puis « Installer l’application » ou « Ajouter à l’écran d’accueil ». Sur ordinateur, Chrome et Edge le proposent.'}
                </p>
              )}
            </>
          )}
        </ListGroup>

        {group(
          'Mes données',
          <>
            <ListLink to="/exercices" label="Historique des exercices" />
            <ListLink to="/connexions" label="Identités de jeu" />
            <ListLink to="/direct" label="Collecteur Windows et Direct PC" value={activeLabel} />
          </>,
          phoneOnly,
        )}
        {group(
          'Club',
          <>
            {admin && <ListLink to="/reglages" label="Réglages du club" value="Admin" />}
            {signOutRow}
            {deleteRow}
          </>,
          phoneOnly,
        )}
        {group(
          'Mes données et le club',
          <>
            <ListLink to="/exercices" label="Historique des exercices" />
            <ListLink to="/direct" label="Identités de jeu, collecteur et Direct PC" value={activeLabel} />
            {admin && <ListLink to="/reglages" label="Réglages du club et membres" value="Admin" />}
          </>,
          wideOnly,
        )}
        {group(
          'Compte',
          <>
            {signOutRow}
            {deleteRow}
          </>,
          wideOnly,
        )}

        <Note className="mt-1.5 px-1.5 text-[11px] text-subtle lg:mt-0 lg:leading-normal">
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
          d’Epic Games, Inc. Tous droits réservés par Epic. Ce produit n’est pas officiel et n’a pas l’approbation
          d’Epic.
        </Note>
      </div>

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
