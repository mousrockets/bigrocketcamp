import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from 'cn';
import { type CSSProperties, useState } from 'react';
import { type Invitation, invitation, type MemberProfile } from '../../lib/contract';
import { count } from '../../lib/format';
import type { Role } from '../../lib/members';
import { networkError } from '../access/gate';
import { useBoardState } from '../board';
import { platformLabels, useClub } from '../club';
import { Avatar, AvatarFallback } from '../components/ui/avatar';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '../components/ui/drawer';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group';
import { clubQuery, membersQuery } from '../queries';
import { highestTier, rankRgb } from '../team/stats';
import { sendJson } from '../writes';
import { Confirm } from './confirm';
import { Chevron } from './icons';
import {
  AdminsOnly,
  ErrorNote,
  FieldRow,
  initials,
  Note,
  RowInput,
  SettingsCard,
  SettingsGroup,
  SettingsPage,
  SettingsRow,
} from './parts';

// Who is in the club, for its admins: the members, those invited who have not come yet, and inviting someone.
// No e-mail leaves the app: the invited person signs in with their address and receives a code.

export function MembersSettings() {
  const { me } = useClub();
  if (me.role !== 'admin') return <AdminsOnly title="Membres" />;
  return <MemberList />;
}

/** Reads the members again after a change; the member's own role also changes what the club lets them do. */
function useMemberChange<Input>(write: (input: Input) => Promise<void>, { self = false } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: membersQuery.queryKey });
      if (self) await queryClient.invalidateQueries({ queryKey: clubQuery.queryKey });
    },
  });
}

function MemberList() {
  const { me } = useClub();
  const { data = [], error } = useQuery(membersQuery);
  // The member first, as everywhere in the app.
  const members = [...data.filter((member) => member.id === me.id), ...data.filter((member) => member.id !== me.id)];
  const [opened, setOpened] = useState<string | null>(null);
  const joined = members.filter((member) => member.duoPseudo !== null);
  const invited = members.filter((member) => member.duoPseudo === null);
  const shown = members.find((member) => member.id === opened) ?? null;

  return (
    <SettingsPage kicker="Le club" title="Membres">
      {error && members.length === 0 && <ErrorNote errors={[networkError(error)]} />}
      {joined.length > 0 && (
        <SettingsGroup label={count(joined.length, 'membre')}>
          <SettingsCard>
            {joined.map((member) => (
              <MemberRow key={member.id} member={member} onOpen={() => setOpened(member.id)} />
            ))}
          </SettingsCard>
        </SettingsGroup>
      )}
      {invited.length > 0 && <Invited members={invited} />}
      <InviteForm />
      <MemberSheet member={shown} onClose={() => setOpened(null)} />
    </SettingsPage>
  );
}

/** Two letters on the colour of the player's highest rank. */
function MemberAvatar({ name, tier }: { name: string | null; tier: number | null }) {
  return (
    <Avatar className="size-9 after:hidden" style={{ '--rank': name ? rankRgb(tier) : '120,120,128' } as CSSProperties}>
      <AvatarFallback className="bg-[radial-gradient(circle_at_50%_30%,rgba(var(--rank),.55),rgba(var(--rank),.15))] font-bold text-[13px] text-t1 shadow-[inset_0_.5px_0_rgba(255,255,255,.3),inset_0_0_0_.5px_rgba(255,255,255,.1)]">
        {name ? initials(name) : '?'}
      </AvatarFallback>
    </Avatar>
  );
}

function useTierOf(): (player: string | null) => number | null {
  const { board } = useBoardState();
  return (player) => {
    const ranks = board?.doublesRanks?.find((rank) => rank.player === player);
    return highestTier(ranks?.tier, ranks?.solo?.tier);
  };
}

const detailsOf = (member: MemberProfile) =>
  [member.email, member.platform && platformLabels[member.platform]].filter(Boolean).join(' · ');

function MemberRow({ member, onOpen }: { member: MemberProfile; onOpen: () => void }) {
  const tierOf = useTierOf();
  return (
    <SettingsRow render={<button type="button" onClick={onOpen} />} className="min-h-16">
      <MemberAvatar name={member.duoPseudo} tier={tierOf(member.duoPseudo)} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <b className="truncate font-semibold text-[16px]">{member.duoPseudo}</b>
          {member.role === 'admin' && <Badge variant="count">Admin</Badge>}
        </span>
        <span className="truncate text-[13px] text-t3">{detailsOf(member)}</span>
      </span>
      <Chevron />
    </SettingsRow>
  );
}

const remove = (member: MemberProfile) =>
  sendJson({ path: '/api/members', method: 'DELETE', body: { id: member.id }, fallback: 'Retrait impossible.' });

/** Addresses invited that never signed in: no profile yet. */
function Invited({ members }: { members: MemberProfile[] }) {
  const cancel = useMemberChange(remove);
  return (
    <SettingsGroup label="En attente" note={cancel.error && <ErrorNote errors={[networkError(cancel.error)]} />}>
      <SettingsCard>
        {members.map((member) => (
          <SettingsRow key={member.id} className="min-h-16">
            <MemberAvatar name={null} tier={null} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <b className="truncate font-semibold text-[16px]">{member.email}</b>
              <span className="truncate text-[13px] text-t3">Pas encore venu</span>
            </span>
            <Button
              variant="pill"
              size="pill"
              aria-label={`Annuler l’invitation de ${member.email}`}
              disabled={cancel.isPending}
              onClick={() => cancel.mutate(member)}
            >
              Annuler
            </Button>
          </SettingsRow>
        ))}
      </SettingsCard>
    </SettingsGroup>
  );
}

const roles: { value: Role; label: string }[] = [
  { value: 'member', label: 'Membre' },
  { value: 'admin', label: 'Admin' },
];

/** iOS's segmented control: Membre or Admin, with a thumb that slides to the choice. */
function RoleSwitch({
  value,
  onChange,
  disabled,
  className,
}: {
  value: Role;
  onChange: (role: Role) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <ToggleGroup
      aria-label="Rôle"
      spacing={0}
      disabled={disabled}
      value={[value]}
      onValueChange={(next: string[]) => {
        const [picked] = next;
        if (picked) onChange(picked as Role);
      }}
      className={cn(
        'relative grid h-8 w-[180px] shrink-0 grid-cols-2 gap-0 rounded-[9px] bg-[rgba(118,118,128,.22)] p-0.5',
        className,
      )}
    >
      <i
        aria-hidden="true"
        className="absolute top-0.5 left-0.5 h-7 w-[calc(50%-2px)] rounded-[7px] bg-[rgba(120,120,128,.55)] shadow-[inset_0_.5px_0_rgba(255,255,255,.18)] transition-transform duration-400 ease-(--ease)"
        style={{ transform: `translateX(${value === 'admin' ? '100%' : '0'})` }}
      />
      {roles.map((role) => (
        <ToggleGroupItem
          key={role.value}
          value={role.value}
          className="relative z-1 h-full min-w-0 rounded-[7px]! px-0! font-semibold text-[13px] text-t2 hover:bg-transparent hover:text-t1 aria-pressed:bg-transparent aria-pressed:text-t1"
        >
          {role.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function InviteForm() {
  const invite = useMemberChange((input: Invitation) =>
    sendJson({ path: '/api/members', method: 'POST', body: input, fallback: 'Invitation impossible.' }),
  );
  const [invitedEmail, setInvitedEmail] = useState('');
  const form = useForm({
    defaultValues: { email: '', role: 'member' } as Invitation,
    validators: { onSubmit: invitation },
    onSubmit: async ({ value, formApi }) => {
      try {
        await invite.mutateAsync(value);
        setInvitedEmail(value.email.trim());
        formApi.reset();
      } catch {
        // The refusal stays on the mutation, which the page shows.
      }
    },
  });

  return (
    <form
      noValidate
      className="contents"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <SettingsGroup
        label="Inviter un joueur"
        note={
          <>
            <form.Subscribe selector={(state) => state.fieldMeta.email?.errors ?? []}>
              {(errors) => <ErrorNote errors={errors} />}
            </form.Subscribe>
            {invite.error && <ErrorNote errors={[networkError(invite.error)]} />}
            <Note>La personne se connecte avec cette adresse et reçoit un code. Aucun mot de passe.</Note>
            {invitedEmail && !invite.error && (
              <p role="status" className="m-0 px-4 text-[12px] text-win leading-[1.45]">
                {invitedEmail} peut maintenant se connecter. Préviens-le !
              </p>
            )}
          </>
        }
      >
        <SettingsCard>
          <form.Field name="email">
            {(field) => (
              <FieldRow id="invite-email" label="E-mail" invalid={!field.state.meta.isValid}>
                <RowInput
                  id="invite-email"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  placeholder="joueur@exemple.fr"
                  aria-invalid={!field.state.meta.isValid || undefined}
                  disabled={invite.isPending}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              </FieldRow>
            )}
          </form.Field>
          <form.Field name="role">
            {(field) => (
              <FieldRow label="Rôle">
                <span className="flex-1" />
                <RoleSwitch
                  value={field.state.value ?? 'member'}
                  disabled={invite.isPending}
                  onChange={(role) => field.handleChange(role)}
                />
              </FieldRow>
            )}
          </form.Field>
        </SettingsCard>
      </SettingsGroup>
      <Button type="submit" variant="cta" size="cta" disabled={invite.isPending}>
        Envoyer l’invitation
      </Button>
    </form>
  );
}

/** A member opened from the list: their role, and removing them from the club. */
function MemberSheet({ member, onClose }: { member: MemberProfile | null; onClose: () => void }) {
  const { me } = useClub();
  const tierOf = useTierOf();
  const self = member?.id === me.id;
  const changeRole = useMemberChange(
    (role: Role) =>
      sendJson({
        path: '/api/members',
        method: 'PATCH',
        body: { id: member?.id ?? '', role },
        fallback: 'Changement de rôle impossible.',
      }),
    { self },
  );
  const [confirming, setConfirming] = useState(false);
  const removal = useMemberChange(remove);

  return (
    <Drawer
      open={member !== null}
      onOpenChange={(open) => {
        if (open) return;
        changeRole.reset();
        onClose();
      }}
      showSwipeHandle
    >
      <DrawerContent className="mx-auto max-w-[520px] rounded-t-[22px] border-0 bg-[#16171b] pt-2 lg:mb-6 lg:rounded-[22px]">
        {member && (
          <>
            <DrawerHeader className="flex-row items-center gap-3 px-5 pt-4 text-left group-data-[swipe-axis=y]/drawer-popup:text-left md:text-left">
              <MemberAvatar name={member.duoPseudo} tier={tierOf(member.duoPseudo)} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <DrawerTitle className="truncate font-semibold font-sans text-[18px]">
                  {member.duoPseudo}
                  {self && ' · toi'}
                </DrawerTitle>
                <DrawerDescription className="truncate text-[13px] text-t3">{detailsOf(member)}</DrawerDescription>
              </span>
            </DrawerHeader>
            <div className="flex flex-col gap-2 px-4 pt-6">
              <SettingsCard>
                <FieldRow label="Rôle">
                  <span className="flex-1" />
                  <RoleSwitch
                    value={member.role}
                    disabled={changeRole.isPending}
                    onChange={(role) => changeRole.mutate(role)}
                  />
                </FieldRow>
              </SettingsCard>
              {changeRole.error && <ErrorNote errors={[networkError(changeRole.error)]} />}
            </div>
            <DrawerFooter className="px-5 pt-6 pb-[max(20px,env(safe-area-inset-bottom))]">
              {!self && (
                <Button
                  variant="ghost"
                  className="min-h-11 px-1.5 font-medium text-[15px] text-destructive hover:bg-transparent hover:text-destructive dark:hover:bg-transparent"
                  onClick={() => setConfirming(true)}
                >
                  Retirer du club…
                </Button>
              )}
            </DrawerFooter>
            <Confirm
              open={confirming}
              onOpenChange={setConfirming}
              title={`Retirer ${member.duoPseudo} ?`}
              action="Retirer du club"
              pending={removal.isPending}
              error={removal.error}
              onConfirm={() =>
                removal.mutate(member, {
                  onSuccess: () => {
                    setConfirming(false);
                    onClose();
                  },
                })
              }
            >
              Il ne peut plus se connecter et ses connexions sont fermées. Ses matchs et exercices restent dans
              l’historique, sous son pseudo duo.
            </Confirm>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
