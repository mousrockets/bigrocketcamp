import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { cn } from 'cn';
import { useState } from 'react';
import { toast } from 'sonner';
import { useBoardState } from '../board/board-context';
import { BackLink, PageHeader, PageStack, Panel } from '../components/club/page';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { ApiError, identitiesQuery } from '../queries';
import { changeIdentity, type IdentityChange } from '../writes';

// Each player's game identities: what ties the received scoreboards to the right player. Their own page on a
// phone; the left column of the direct's page on a wide screen.

// "platform|id": the platform and the end of the id are enough to recognise one's own account.
export function shortId(id: string) {
  const [platform = '', accountId = ''] = id.split('|');
  return `${platform} · …${accountId.slice(-6)}`;
}

/** The phone's sizes, or the wide screen's column (`column`): 18 px names and 44 px controls. */
export function IdentityCards({ column = false }: { column?: boolean }) {
  const queryClient = useQueryClient();
  const { me } = useBoardState();
  const { data, error } = useQuery(identitiesQuery);
  const candidates = data?.candidates ?? [];
  // One's own identities first, as in the design.
  const identities = [...(data?.identities ?? [])].sort((a, b) => Number(b.owned) - Number(a.owned));
  const change = useMutation({ mutationFn: changeIdentity }).mutateAsync;
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function act(slot: string, playerId: string | undefined, action: IdentityChange['action'] = 'confirm') {
    if (busy || !playerId) return;
    setBusy(true);
    try {
      await change({ slot, playerId, action });
      toast.success(
        action === 'remove'
          ? 'Identifiant supplémentaire retiré.'
          : 'Identifiant confirmé. Les tableaux du Direct utiliseront cette identité.',
      );
      await queryClient.refetchQueries(identitiesQuery);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const candidateItems = candidates.map((candidate) => ({
    value: candidate.playerId,
    label: `${candidate.name} · ${shortId(candidate.playerId)} · ${candidate.day}`,
  }));
  const inset = column ? 'px-[18px]' : 'px-4';
  const control = column ? 'h-11' : 'h-[46px]';

  return (
    <>
      {error && (
        <p role="alert" className="px-1 text-sm text-destructive">
          {error instanceof ApiError ? 'Connexion au club requise.' : error.message}
        </p>
      )}
      {identities.map((identity) => (
        <Panel key={identity.slot} aria-label={identity.slot} className={cn(identity.owned && 'border-primary/35')}>
          <div className={cn('flex items-center justify-between gap-3 pb-2.5', inset, column ? 'pt-4' : 'pt-3.5')}>
            <b className={cn('font-display', column ? 'text-lg' : 'text-[19px]')}>
              {identity.slot}
              {identity.slot === me && (
                <Badge variant="me" className="ml-1 align-[2px] font-sans">
                  Toi
                </Badge>
              )}
            </b>
            <span
              className={cn(
                'flex items-center gap-1.5 text-xs font-semibold',
                identity.known ? 'text-settled' : 'text-cost-soft',
              )}
            >
              <i
                aria-hidden="true"
                className={cn('size-[7px] rounded-full', identity.known ? 'bg-settled' : 'bg-cost')}
              />
              {identity.known ? 'Enregistrée' : 'À associer'}
            </span>
          </div>
          {identity.aliases.map((alias) => (
            <div
              key={alias.playerId}
              className={cn(
                'flex items-center justify-between gap-2.5 border-t border-border py-2.5 font-mono text-[13px] text-soft',
                inset,
              )}
            >
              <span>{shortId(alias.playerId)}</span>
              {alias.primary
                ? identity.aliases.length > 1 && (
                    <span className="font-sans text-xs text-muted-foreground">principal</span>
                  )
                : identity.owned && (
                    <Button
                      variant="outline"
                      size="md"
                      disabled={busy}
                      onClick={() => act(identity.slot, alias.playerId, 'remove')}
                      className="h-9 rounded-xl px-3 font-sans text-[13px] font-semibold text-destructive hover:text-destructive"
                    >
                      Retirer
                    </Button>
                  )}
            </div>
          ))}
          {identity.owned ? (
            <div className={cn('flex flex-col gap-2 border-t border-border pt-3 pb-4', inset)}>
              <Label htmlFor={`pick-${identity.slot}`} className="text-[13px] font-semibold text-soft">
                {candidateItems.length
                  ? 'Un nouveau tableau a été reçu'
                  : identity.known
                    ? 'Ajouter un identifiant depuis un tableau reçu'
                    : 'Mon joueur dans un tableau reçu'}
              </Label>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Select
                  items={candidateItems}
                  value={choices[identity.slot] ?? null}
                  disabled={busy || !candidateItems.length}
                  onValueChange={(value) =>
                    setChoices((previous) => ({ ...previous, [identity.slot]: (value as string | null) ?? '' }))
                  }
                >
                  <SelectTrigger
                    id={`pick-${identity.slot}`}
                    aria-label={`Identifiant de ${identity.slot}`}
                    className={cn(
                      'w-full min-w-0 rounded-xl bg-secondary px-3 font-medium text-foreground data-placeholder:text-foreground dark:bg-secondary [&>svg]:text-foreground',
                      column ? 'data-[size=default]:h-11 text-sm' : 'data-[size=default]:h-[46px] text-[15px]',
                    )}
                  >
                    <SelectValue placeholder={candidateItems.length ? 'Choisir mon joueur…' : 'Aucun tableau reçu'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {/* Said where the choice is made: one confirms one's own account only. */}
                      <SelectLabel className="max-w-72 leading-[1.4]">
                        Pour une console, choisis ton propre joueur. Confirme uniquement ton compte : un pseudo seul
                        n’est pas une preuve d’identité.
                      </SelectLabel>
                      {candidateItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Button
                  variant="action"
                  disabled={busy || !choices[identity.slot]}
                  onClick={() => act(identity.slot, choices[identity.slot])}
                  className={cn('rounded-xl px-3.5 font-sans text-sm font-bold shadow-none', control)}
                >
                  Confirmer
                </Button>
              </div>
            </div>
          ) : (
            !identity.known && (
              <p className={cn('pb-3.5 text-[13px] text-muted-foreground', inset, !column && 'leading-[1.4]')}>
                Sur console, l’identité s’associe avec l’administrateur du club.
              </p>
            )
          )}
        </Panel>
      ))}
    </>
  );
}

export function IdentitiesPage() {
  return (
    <PageStack className="lg:max-w-[720px]">
      <PageHeader
        back={<BackLink to="/profil" label="Retour au profil" wide="Profil" />}
        kicker="Identités de jeu"
        title="Qui est qui ?"
      />
      <p className="mx-1 text-[13px] leading-[1.45] text-muted-foreground lg:mx-0 lg:text-sm">
        Pour que tes buts (et tes défaites) atterrissent sur le bon compte. Pas de faux nez sur le terrain.
      </p>
      <IdentityCards />
      <Link
        to="/direct"
        className="flex min-h-11 items-center justify-between px-1 py-3 text-sm font-semibold no-underline"
      >
        Configurer le Direct PC
        <span aria-hidden="true">→</span>
      </Link>
    </PageStack>
  );
}
