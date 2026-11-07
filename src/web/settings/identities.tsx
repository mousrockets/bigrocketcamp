import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type IdentityChangeInput, identityChange } from '../../lib/contract';
import { formatShortDate } from '../../lib/format';
import { networkError } from '../access/gate';
import { useBoardState } from '../board';
import { useClub } from '../club';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { type Candidate, type Identity, identitiesQuery } from '../queries';
import { changeIdentity, type IdentityChange } from '../writes';
import { ErrorNote, Note, RowLabel, SettingsCard, SettingsGroup, SettingsPage, SettingsRow } from './parts';

// The collector receives every player of a match by their game account. Each member confirms which account is
// theirs, so that the club's defeats count for the right player; only the member can vouch for their own account.

const platformNames: Record<string, string> = { PS4: 'PlayStation', XboxOne: 'Xbox' };

/** "Epic · …a1b2c3": the platform and the end of the id are enough to recognise one's own account. */
export function accountLabel(playerId: string, name?: string): string {
  const [platform = '', id = ''] = playerId.split('|');
  return `${platformNames[platform] ?? platform} · ${name ?? `…${id.slice(-6)}`}`;
}

/** How many accounts to offer at once: the likeliest first. */
const offered = 6;

/** The accounts the member is likely to own: theirs while they have none, then only those named after them. */
function likelyAccounts(candidates: readonly Candidate[], pseudos: readonly string[], hasOne: boolean): Candidate[] {
  const named = (candidate: Candidate) =>
    pseudos.some((pseudo) => candidate.name.toLowerCase().includes(pseudo.toLowerCase()));
  const mine = candidates.filter(named);
  return (hasOne ? mine : [...mine, ...candidates.filter((candidate) => !named(candidate))]).slice(0, offered);
}

export function IdentitiesSettings() {
  const { me } = useClub();
  const { data, error } = useQuery(identitiesQuery);
  const identities = data?.identities ?? [];
  const mine = identities.find((identity) => identity.slot === me.duoPseudo);
  const pseudos = [me.duoPseudo, me.soloPseudo].filter((pseudo): pseudo is string => Boolean(pseudo));
  const accounts = mine?.owned ? likelyAccounts(data?.candidates ?? [], pseudos, mine.known) : [];
  // The member's own player first, then the others in the club's order.
  const players = [...identities.filter((identity) => identity === mine), ...identities.filter((i) => i !== mine)];

  return (
    <SettingsPage kicker="Scores en direct" title="Identités">
      <p className="m-0 px-1 text-[14px] text-t2 leading-[1.45]">
        Le collecteur reçoit les pseudos de chaque partie. Associe chaque compte Epic au bon joueur pour que ses
        défaites comptent.
      </p>
      {error && !data && <ErrorNote errors={[networkError(error)]} />}
      {mine && accounts.length > 0 && <NewAccount slot={mine.slot} accounts={accounts} />}
      {players.map((identity) => (
        <PlayerAccounts key={identity.slot} identity={identity} mine={identity === mine} />
      ))}
    </SettingsPage>
  );
}

/** Confirms identities, then reads them and the board again: the matches now count for their player. */
function useIdentityChange() {
  const queryClient = useQueryClient();
  const { refresh } = useBoardState();
  return useMutation({
    mutationFn: (change: IdentityChange) => changeIdentity(change),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: identitiesQuery.queryKey });
      await refresh();
    },
  });
}

/** An account seen in a match and bound to no player yet, which the member can claim. */
function NewAccount({ slot, accounts }: { slot: string; accounts: Candidate[] }) {
  const confirm = useIdentityChange();
  const form = useForm({
    defaultValues: { slot, playerId: accounts[0]?.playerId ?? '', action: 'confirm' } as IdentityChangeInput,
    validators: { onSubmit: identityChange },
    onSubmit: ({ value }) => confirm.mutateAsync({ ...value, action: 'confirm' }).catch(() => {}),
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="playerId">
        {(field) => {
          const account = accounts.find((candidate) => candidate.playerId === field.state.value) ?? accounts[0];
          return (
            <SettingsCard
              role="group"
              aria-label="Nouveau compte vu"
              className="gap-3.5 bg-[linear-gradient(155deg,rgba(100,168,255,.16),rgba(100,168,255,.04)_55%,rgba(255,255,255,.03))] p-4 shadow-[inset_0_1px_0_rgba(160,200,255,.25),inset_0_0_0_.5px_rgba(100,168,255,.25)]"
            >
              <span className="flex flex-col gap-1">
                <span className="label-caps text-[#8fc0ff]">Nouveau compte vu</span>
                {account && (
                  <>
                    <b className="font-semibold text-[17px]">{accountLabel(account.playerId, account.name)}</b>
                    <span className="text-[13px] text-t3">
                      Dans une partie du {formatShortDate(`${account.day}T12:00:00Z`)}
                    </span>
                  </>
                )}
              </span>
              {accounts.length > 1 && (
                <span className="flex flex-wrap gap-2">
                  {accounts.map((candidate) => (
                    <Button
                      key={candidate.playerId}
                      type="button"
                      variant="pill"
                      size="pill"
                      aria-pressed={candidate.playerId === field.state.value}
                      onClick={() => field.handleChange(candidate.playerId)}
                    >
                      {candidate.name}
                    </Button>
                  ))}
                </span>
              )}
              <Button type="submit" variant="cta" size="cta" className="h-11 text-[15px]" disabled={confirm.isPending}>
                Associer à {slot}
              </Button>
              {confirm.error && <ErrorNote errors={[networkError(confirm.error)]} />}
            </SettingsCard>
          );
        }}
      </form.Field>
    </form>
  );
}

/** A player's confirmed accounts; the member removes their own extra ones. */
function PlayerAccounts({ identity, mine }: { identity: Identity; mine: boolean }) {
  const remove = useIdentityChange();
  return (
    <SettingsGroup
      label={mine ? `${identity.slot} · toi` : identity.slot}
      note={
        <>
          {remove.error && <ErrorNote errors={[networkError(remove.error)]} />}
          {!identity.known && !mine && (
            <Note>Sur console, pas de collecteur : il choisit son compte ici après une partie avec un joueur PC.</Note>
          )}
        </>
      }
    >
      <SettingsCard>
        {identity.aliases.length === 0 && (
          <SettingsRow>
            <RowLabel className="text-[15px] text-t3">Aucun compte associé</RowLabel>
            <Badge variant="due">À associer</Badge>
          </SettingsRow>
        )}
        {identity.aliases.map((alias) => (
          <SettingsRow key={alias.playerId}>
            <RowLabel className="text-[15px]">{accountLabel(alias.playerId)}</RowLabel>
            {alias.primary ? (
              <Badge variant="count">Principal</Badge>
            ) : (
              identity.owned && (
                <Button
                  variant="pill-danger"
                  size="pill"
                  className="h-[30px]"
                  aria-label={`Retirer ${accountLabel(alias.playerId)}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate({ slot: identity.slot, playerId: alias.playerId, action: 'remove' })}
                >
                  Retirer
                </Button>
              )
            )}
          </SettingsRow>
        ))}
      </SettingsCard>
    </SettingsGroup>
  );
}
