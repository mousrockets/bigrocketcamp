import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EllipsisIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { Profile, Role } from '../../lib/members';
import { platformLabels, useClub } from '../club';
import { Confirm } from '../components/club/confirm';
import { BackLink, fieldClass, Note, PageHeader, Panel } from '../components/club/page';
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
import { Label } from '../components/ui/label';
import { identitiesQuery, membersQuery } from '../queries';
import { sendJson } from '../writes';
import { shortId } from './identities';
import { AdminOnly } from './settings';

// The club's members, their role, and the invitations: who may sign in.

const roleItems: { value: Role; label: string }[] = [
  { value: 'member', label: 'Membre' },
  { value: 'admin', label: 'Administrateur' },
];
const networkError = (e: unknown) =>
  e instanceof TypeError ? 'Connexion Internet indisponible. Réessaie dans un instant.' : (e as Error).message;

export function MembersPage() {
  const club = useClub();
  const isAdmin = club.me.role === 'admin';
  const queryClient = useQueryClient();
  const { data: members = [] } = useQuery({ ...membersQuery, enabled: isAdmin });
  const { data: identityData } = useQuery({ ...identitiesQuery, enabled: isAdmin });
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [removing, setRemoving] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const send = useMutation({ mutationFn: sendJson }).mutateAsync;
  const refresh = () => queryClient.fetchQuery({ ...membersQuery, staleTime: 0 });

  async function act(task: () => Promise<unknown>, done: string) {
    if (busy) return;
    setBusy(true);
    try {
      await task();
      toast.success(done);
    } catch (e) {
      toast.error(networkError(e));
    } finally {
      setBusy(false);
    }
  }

  const invite = () =>
    act(async () => {
      await send({ path: '/api/members', method: 'POST', body: { email, role }, fallback: 'Invitation impossible.' });
      setEmail('');
      setRole('member');
      await refresh();
    }, `${email.trim()} peut maintenant se connecter.`);
  const changeRole = (member: Profile, next: Role) =>
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
    );
  const remove = (member: Profile) =>
    act(async () => {
      await send({ path: '/api/members', method: 'DELETE', body: { id: member.id }, fallback: 'Retrait impossible.' });
      setRemoving(null);
      await refresh();
    }, `${member.email} ne fait plus partie du club.`);
  const identitiesOf = (slot: string) =>
    identityData?.identities
      .find((identity) => identity.slot === slot)
      ?.aliases.map((alias) => shortId(alias.playerId))
      .join(', ');

  if (!isAdmin) return <AdminOnly />;
  return (
    <div className="flex flex-col gap-3.5 lg:max-w-[720px]">
      <PageHeader
        back={<BackLink to="/reglages" label="Retour aux réglages" />}
        kicker="Administration"
        title="Membres"
      />
      <Panel aria-label="Membres">
        {members.map((member) => {
          const self = member.id === club.me.id;
          const index = club.roster.indexOf(member.duoPseudo ?? '');
          const ids = member.duoPseudo ? identitiesOf(member.duoPseudo) : '';
          return (
            <div
              key={member.id}
              className="grid grid-cols-[40px_1fr_auto] items-center gap-3 border-t border-border px-3.5 py-3 first:border-t-0"
            >
              {member.duoPseudo ? (
                <PlayerAvatar name={member.duoPseudo} me={self} index={Math.max(0, index)} className="size-10" />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex size-10 items-center justify-center rounded-full border-[1.5px] border-dashed border-faint text-muted-foreground"
                >
                  ?
                </span>
              )}
              <span className="flex min-w-0 flex-col gap-0.5">
                <b className={member.duoPseudo ? 'text-[15px] font-semibold' : 'text-[15px] font-semibold text-soft'}>
                  {member.duoPseudo ?? 'Profil à remplir'}
                  {member.role === 'admin' && (
                    <Badge
                      variant="secondary"
                      className="ml-1.5 h-auto rounded-[5px] bg-primary/16 px-1.5 py-0.5 align-middle text-[10px] font-extrabold tracking-[0.08em] text-[#a9cbff] uppercase"
                    >
                      Admin
                    </Badge>
                  )}
                </b>
                <small className="truncate text-xs text-muted-foreground">
                  {[
                    member.email,
                    member.platform ? platformLabels[member.platform] : '',
                    member.soloPseudo ? `solo : ${member.soloPseudo}` : '',
                    self ? 'toi' : member.duoPseudo ? '' : 'invité',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
                {member.duoPseudo && (
                  <small className="truncate text-xs text-muted-foreground">
                    Identités de jeu : {ids || 'aucune confirmée pour l’instant'}
                  </small>
                )}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xl"
                      aria-label={`Actions pour ${member.duoPseudo ?? member.email}`}
                      disabled={busy}
                      className="text-muted-foreground"
                    />
                  }
                >
                  <EllipsisIcon />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-52">
                  <DropdownMenuItem onClick={() => changeRole(member, member.role === 'admin' ? 'member' : 'admin')}>
                    {member.role === 'admin' ? 'Retirer le rôle admin' : 'Rendre admin'}
                  </DropdownMenuItem>
                  {!self && (
                    <DropdownMenuItem variant="destructive" onClick={() => setRemoving(member)}>
                      Retirer du club…
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
      </Panel>
      <Note>
        Un membre retiré ne peut plus se connecter et ses connexions sont fermées. Ses matchs et exercices restent dans
        l’historique, sous son pseudo duo. Chaque membre confirme lui-même ses identités de jeu, depuis un tableau de
        fin de match reçu.
      </Note>
      <Panel aria-label="Inviter quelqu’un" className="gap-3 p-4">
        <h2 className="font-display text-xl">Inviter quelqu’un</h2>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            invite();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-email" className="text-[13px] font-semibold text-soft">
              Adresse e-mail
            </Label>
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
              className={fieldClass}
            />
          </div>
          <Segmented label="Rôle" items={roleItems} value={role} disabled={busy} onChange={setRole} />
          <Button type="submit" variant="action" size="xl" disabled={busy} className="w-full">
            Inviter
          </Button>
          <p className="text-xs leading-[1.4] text-muted-foreground">
            Aucun e-mail d’invitation n’est envoyé : préviens la personne. Elle se connecte ensuite sur {location.host}{' '}
            avec cette adresse, reçoit un code et choisit son pseudo duo. Aucun mot de passe.
          </p>
        </form>
      </Panel>
      <Confirm
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Retirer ${removing?.duoPseudo ?? removing?.email ?? ''} du club ?`}
        action="Retirer du club"
        busy={busy}
        onConfirm={() => removing && remove(removing)}
      >
        Cette personne ne pourra plus se connecter et ses connexions seront fermées. Ses matchs et exercices restent
        dans l’historique, sous son pseudo duo.
      </Confirm>
    </div>
  );
}
