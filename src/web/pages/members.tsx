import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from 'cn';
import { useState } from 'react';
import { toast } from 'sonner';
import type { Profile, Role } from '../../lib/members';
import { platformLabels, useClub } from '../club';
import { Confirm } from '../components/club/confirm';
import { BackLink, fieldVariants, hintClass, labelClass, PageHeader, Panel } from '../components/club/page';
import { PlayerAvatar } from '../components/club/player-avatar';
import { Segmented } from '../components/club/segmented';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { membersQuery } from '../queries';
import { sendJson } from '../writes';
import { AdminOnly } from './settings';

// The club's members, their role, and the invitations: who may sign in. A phone keeps each member's actions
// behind ⋯; a wide screen (here and in the club's settings) shows them as buttons on the member's line.

const roleItems: { value: Role; label: string }[] = [
  { value: 'member', label: 'Membre' },
  { value: 'admin', label: 'Administrateur' },
];
const networkError = (e: unknown) =>
  e instanceof TypeError ? 'Connexion Internet indisponible. Réessaie dans un instant.' : (e as Error).message;

/** The design's .sm on a member's line: 38 px, 13 px text. */
const smallButton = 'h-[38px] rounded-xl px-3.5 text-[13px] font-semibold';

function useMembersAdmin() {
  const club = useClub();
  const queryClient = useQueryClient();
  const { data = [] } = useQuery({ ...membersQuery, enabled: club.me.role === 'admin' });
  const [removing, setRemoving] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const send = useMutation({ mutationFn: sendJson }).mutateAsync;
  const refresh = () => queryClient.fetchQuery({ ...membersQuery, staleTime: 0 });

  async function act(task: () => Promise<unknown>, done: string) {
    if (busy) return false;
    setBusy(true);
    try {
      await task();
      toast.success(done);
      return true;
    } catch (e) {
      toast.error(networkError(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  // The signed-in member first, then the roster's order, then the invitations not yet taken up: as in the design.
  const place = (member: Profile) =>
    member.id === club.me.id ? -1 : member.duoPseudo ? club.roster.indexOf(member.duoPseudo) : club.roster.length;
  const members = [...data].sort((a, b) => place(a) - place(b));

  return {
    club,
    members,
    busy,
    removing,
    setRemoving,
    /** Another administrator than oneself: only then may one step down. */
    otherAdmin: members.some((member) => member.role === 'admin' && member.id !== club.me.id),
    invite: (email: string, role: Role) =>
      act(async () => {
        await send({ path: '/api/members', method: 'POST', body: { email, role }, fallback: 'Invitation impossible.' });
        await refresh();
      }, `${email.trim()} peut maintenant se connecter. Aucun e-mail n’est envoyé : préviens la personne.`),
    changeRole: (member: Profile, next: Role) =>
      act(
        async () => {
          await send({
            path: '/api/members',
            method: 'PATCH',
            body: { id: member.id, role: next },
            fallback: 'Changement de rôle impossible.',
          });
          if (member.id === club.me.id) location.reload();
          else await refresh();
        },
        next === 'admin' ? `${member.email} est administrateur.` : `${member.email} n’est plus administrateur.`,
      ),
    remove: (member: Profile) =>
      act(async () => {
        await send({
          path: '/api/members',
          method: 'DELETE',
          body: { id: member.id },
          fallback: 'Retrait impossible.',
        });
        setRemoving(null);
        await refresh();
      }, `${member.email} ne fait plus partie du club.`),
  };
}

type MembersAdmin = ReturnType<typeof useMembersAdmin>;

function AdminBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        'h-auto rounded-[5px] bg-primary/16 px-1.5 py-[3px] text-[10px] leading-normal font-extrabold tracking-[0.08em] text-[#a9cbff] uppercase',
        className,
      )}
    >
      Admin
    </Badge>
  );
}

function MemberLine({ member, admin }: { member: Profile; admin: MembersAdmin }) {
  const { club, busy, otherAdmin, changeRole, setRemoving } = admin;
  const self = member.id === club.me.id;
  const invited = !member.duoPseudo;
  const isAdmin = member.role === 'admin';
  const canChangeRole = !invited && (!self || otherAdmin);
  const name = member.duoPseudo ?? member.email;
  const roleAction = isAdmin ? (self ? 'Quitter l’admin' : 'Retirer l’admin') : 'Rendre admin';
  return (
    <div className="grid grid-cols-[40px_1fr_auto] items-center gap-3 border-t border-border px-3.5 py-3 first:border-t-0 lg:grid-cols-[34px_1fr_auto_auto] lg:px-[18px]">
      {member.duoPseudo ? (
        <PlayerAvatar
          name={member.duoPseudo}
          me={self}
          index={Math.max(0, club.roster.indexOf(member.duoPseudo))}
          className="size-10 lg:size-[34px] lg:[&_[data-slot=avatar-fallback]]:text-xs"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-10 items-center justify-center rounded-full border-[1.5px] border-dashed border-faint text-[13px] font-bold text-muted-foreground lg:size-[34px] lg:text-xs"
        >
          ?
        </span>
      )}
      <span className="flex min-w-0 flex-col gap-[3px] lg:gap-0.5">
        <b className={cn('text-[15px] font-semibold lg:text-sm', invited && 'text-soft')}>
          {member.duoPseudo ?? 'Profil à remplir'}
          {isAdmin && <AdminBadge className={cn('ml-1.5 align-[1px]', self && 'lg:hidden')} />}
        </b>
        <small className="truncate text-xs text-muted-foreground">
          {[
            member.email,
            !self && member.platform ? platformLabels[member.platform] : '',
            self ? 'toi' : invited ? 'invité' : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </small>
      </span>

      {/* A phone: the actions behind ⋯. */}
      {canChangeRole || !self ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xl"
                aria-label={`Actions pour ${invited ? 'l’invitation' : name}`}
                disabled={busy}
                className="rounded-full text-muted-foreground lg:hidden"
              />
            }
          >
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
            </svg>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            {canChangeRole && (
              <DropdownMenuItem onClick={() => changeRole(member, isAdmin ? 'member' : 'admin')}>
                {roleAction}
              </DropdownMenuItem>
            )}
            {!self && (
              <DropdownMenuItem variant="destructive" onClick={() => setRemoving(member)}>
                {invited ? 'Annuler l’invitation…' : 'Retirer du club…'}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="lg:hidden" />
      )}

      {/* A wide screen: the role, then removing. */}
      <span className="hidden lg:block">
        {self && isAdmin ? (
          <AdminBadge />
        ) : (
          canChangeRole && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => changeRole(member, isAdmin ? 'member' : 'admin')}
              className={smallButton}
            >
              {roleAction}
            </Button>
          )
        )}
      </span>
      <span className="hidden lg:block">
        {!self && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setRemoving(member)}
            className={cn(smallButton, 'text-destructive hover:text-destructive')}
          >
            {invited ? 'Annuler' : 'Retirer'}
          </Button>
        )}
      </span>
    </div>
  );
}

function MembersCard({ admin, title }: { admin: MembersAdmin; title?: string }) {
  return (
    <Panel aria-label="Membres">
      {title && (
        <div className="flex items-baseline justify-between px-[18px] pt-[18px] pb-2.5">
          <h2 className="font-display text-[22px]">{title}</h2>
          <span className="kicker">
            {admin.members.length} compte{admin.members.length > 1 ? 's' : ''}
          </span>
        </div>
      )}
      {admin.members.map((member) => (
        <MemberLine key={member.id} member={member} admin={admin} />
      ))}
    </Panel>
  );
}

function InviteCard({ admin }: { admin: MembersAdmin }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const { busy } = admin;
  return (
    <Panel aria-label="Inviter quelqu’un" className="gap-3 p-4 lg:p-[22px]">
      <h2 className="font-display text-xl">Recruter un coéquipier</h2>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (await admin.invite(email, role)) {
            setEmail('');
            setRole('member');
          }
        }}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:gap-2.5">
          <label htmlFor="invite-email" className={cn(labelClass, 'lg:flex-[1_1_220px]')}>
            Adresse e-mail
            <Input
              id="invite-email"
              type="email"
              inputMode="email"
              autoComplete="off"
              required
              placeholder="coequipier@exemple.fr"
              value={email}
              disabled={busy}
              onChange={(event) => setEmail(event.target.value)}
              className={cn(fieldVariants({ size: 'md' }), 'lg:h-12 lg:rounded-[12px] lg:text-[15px]')}
            />
          </label>
          <Segmented
            label="Rôle"
            items={roleItems}
            value={role}
            disabled={busy}
            onChange={setRole}
            className="lg:hidden [&_button]:h-[38px]"
          />
          <div className={cn(labelClass, 'hidden lg:flex lg:flex-[0_1_160px]')}>
            <label htmlFor="invite-role">Rôle</label>
            <Select
              items={roleItems}
              value={role}
              disabled={busy}
              onValueChange={(value) => value && setRole(value as Role)}
            >
              <SelectTrigger
                id="invite-role"
                className={cn(fieldVariants({ size: 'sm' }), 'w-full data-[size=default]:h-12 [&>svg]:text-foreground')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roleItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="submit"
            variant="action"
            size="cta"
            disabled={busy}
            className="h-[50px] w-full rounded-[14px] text-base shadow-none lg:h-12 lg:w-auto lg:rounded-[12px] lg:px-5 lg:text-[15px]"
          >
            <span className="lg:hidden">Envoyer la convocation</span>
            <span className="hidden lg:inline">Convoquer</span>
          </Button>
        </div>
        <p className={hintClass}>La personne se connecte avec cette adresse et reçoit un code. Aucun mot de passe.</p>
      </form>
    </Panel>
  );
}

function RemoveConfirm({ admin }: { admin: MembersAdmin }) {
  const { removing, setRemoving, busy, remove } = admin;
  return (
    <Confirm
      open={removing !== null}
      onOpenChange={(open) => !open && setRemoving(null)}
      title={
        removing?.duoPseudo
          ? `Retirer ${removing.duoPseudo} du club ?`
          : `Annuler l’invitation de ${removing?.email ?? ''} ?`
      }
      action={removing?.duoPseudo ? 'Retirer du club' : 'Annuler l’invitation'}
      busy={busy}
      onConfirm={() => removing && remove(removing)}
    >
      Cette personne ne pourra plus se connecter et ses connexions seront fermées. Ses matchs et exercices restent dans
      l’historique, sous son pseudo duo.
    </Confirm>
  );
}

/** The members and the invitation, as the club's settings show them on a wide screen. */
export function ClubMembers() {
  const admin = useMembersAdmin();
  return (
    <>
      <MembersCard admin={admin} title="L’effectif" />
      <InviteCard admin={admin} />
      <RemoveConfirm admin={admin} />
    </>
  );
}

export function MembersPage() {
  const admin = useMembersAdmin();
  if (admin.club.me.role !== 'admin') return <AdminOnly />;
  return (
    <div className="flex flex-col gap-3.5 lg:max-w-[720px] lg:gap-5">
      <PageHeader
        back={<BackLink to="/reglages" label="Retour aux réglages" wide="Réglages du club" />}
        kicker="Administration"
        title="L’effectif"
      />
      <MembersCard admin={admin} />
      <InviteCard admin={admin} />
      <RemoveConfirm admin={admin} />
    </div>
  );
}
