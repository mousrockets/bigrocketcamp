import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { cn } from 'cn';
import { count } from '../../lib/format';
import { versionLabel } from '../../lib/version';
import { signOut } from '../api';
import { platformLabels, useClub } from '../club';
import { epicNotice } from '../components/epic-notice';
import { Badge } from '../components/ui/badge';
import { Item, ItemContent } from '../components/ui/item';
import { Switch } from '../components/ui/switch';
import { useSounds } from '../hooks/use-sounds';
import { collectorsQuery, identitiesQuery, membersQuery } from '../queries';
import { loadedCommit, useDeployedVersion } from '../version';
import {
  Chevron,
  ClubIcon,
  CollectorIcon,
  IdentitiesIcon,
  InstallIcon,
  MembersIcon,
  SignOutIcon,
  SoundsIcon,
} from './icons';
import { InstallHelp, useInstall } from './install';
import { RankAvatar, useMyRank } from './my-rank';
import { RowIcon, RowLabel, RowValue, SettingsCard, SettingsHomePage, SettingsRow, settingsCardClass } from './parts';

/** The Réglages tab: the member's account first, then what the club shares, then this device. */
export function SettingsHome() {
  const club = useClub();
  const isAdmin = club.me.role === 'admin';

  return (
    <SettingsHomePage kicker={club.name}>
      <AccountCard />
      <SettingsCard>
        <CollectorRow />
        <IdentitiesRow />
      </SettingsCard>
      {isAdmin && (
        <SettingsCard>
          <SettingsRow render={<Link to="/reglages/club" />}>
            <RowIcon>
              <ClubIcon />
            </RowIcon>
            <RowLabel>Club</RowLabel>
            <RowValue>{club.name}</RowValue>
            <Chevron />
          </SettingsRow>
          <MembersRow />
        </SettingsCard>
      )}
      <DeviceGroup />
      <SignOutGroup />
      <p className="m-0 text-center text-[11px] text-t3 [line-height:1.5]">
        <Version />
        <br />
        {epicNotice}
      </p>
    </SettingsHomePage>
  );
}

function AccountCard() {
  const { me } = useClub();
  const { tier } = useMyRank();
  const details = [me.email, me.platform && platformLabels[me.platform]].filter(Boolean).join(' · ');
  return (
    <Item
      render={<Link to="/reglages/compte" />}
      className={cn(
        settingsCardClass,
        'flex-nowrap gap-3.5 border-0 p-4 text-t1 [line-height:normal] [a]:hover:bg-white/4 [a]:hover:text-t1',
      )}
    >
      <RankAvatar tier={tier} />
      <ItemContent className="min-w-0 gap-[3px]">
        <span className="flex items-center gap-2">
          <b className="truncate font-semibold text-[20px] tracking-[-.01em]">{me.duoPseudo}</b>
          {me.role === 'admin' && <Badge variant="count">Admin</Badge>}
        </span>
        <span className="truncate text-[13px] text-t3">{details}</span>
      </ItemContent>
      <Chevron />
    </Item>
  );
}

function CollectorRow() {
  const devices = useQuery(collectorsQuery).data ?? [];
  return (
    <SettingsRow render={<Link to="/reglages/collecteur" />}>
      <RowIcon>
        <CollectorIcon />
      </RowIcon>
      <RowLabel>Collecteur</RowLabel>
      {devices.length > 0 && <Badge variant="count">{count(devices.length, 'actif')}</Badge>}
      <Chevron />
    </SettingsRow>
  );
}

function IdentitiesRow() {
  const identities = useQuery(identitiesQuery).data?.identities ?? [];
  const unbound = identities.filter((identity) => !identity.known).length;
  return (
    <SettingsRow render={<Link to="/reglages/identites" />}>
      <RowIcon>
        <IdentitiesIcon />
      </RowIcon>
      <RowLabel>Identités</RowLabel>
      {unbound > 0 && <Badge variant="count">{unbound} à associer</Badge>}
      <Chevron />
    </SettingsRow>
  );
}

function MembersRow() {
  const members = useQuery(membersQuery).data;
  const joined = members?.filter((member) => member.duoPseudo !== null).length;
  return (
    <SettingsRow render={<Link to="/reglages/membres" />}>
      <RowIcon>
        <MembersIcon />
      </RowIcon>
      <RowLabel>Membres</RowLabel>
      {joined !== undefined && <RowValue>{joined}</RowValue>}
      <Chevron />
    </SettingsRow>
  );
}

/** What belongs to this device rather than to the member: sounds, the home screen. */
function DeviceGroup() {
  const [sounds, setSounds] = useSounds();
  const { mode, install, help, closeHelp } = useInstall();
  return (
    <SettingsCard>
      <SettingsRow>
        <RowIcon>
          <SoundsIcon />
        </RowIcon>
        <RowLabel>Sons</RowLabel>
        <Switch size="ios" aria-label="Sons" checked={sounds} onCheckedChange={setSounds} />
      </SettingsRow>
      {mode !== 'installed' && (
        <SettingsRow render={<button type="button" onClick={install} />}>
          <RowIcon>
            <InstallIcon />
          </RowIcon>
          <RowLabel>Ajouter à l’écran d’accueil</RowLabel>
          <Chevron />
        </SettingsRow>
      )}
      <InstallHelp mode={mode} open={help} onClose={closeHelp} />
    </SettingsCard>
  );
}

function SignOutGroup() {
  const leave = useMutation({ mutationFn: signOut });
  return (
    <SettingsCard>
      <SettingsRow render={<button type="button" disabled={leave.isPending} onClick={() => leave.mutate()} />}>
        <RowIcon>
          <SignOutIcon />
        </RowIcon>
        <span className="flex-1">Se déconnecter</span>
      </SettingsRow>
    </SettingsCard>
  );
}

/** The build the API runs, or this page's own until it has answered. */
function Version() {
  const deployed = useDeployedVersion();
  return <>{versionLabel(deployed ?? { commit: loadedCommit, deployedAt: null }, loadedCommit)}</>;
}
