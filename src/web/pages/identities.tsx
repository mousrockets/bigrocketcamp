import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { cn } from 'cn';
import { useState } from 'react';
import { toast } from 'sonner';
import { useBoardState } from '../board/board-context';
import { BackLink, PageHeader, Panel } from '../components/club/page';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { ApiError, identitiesQuery } from '../queries';
import { changeIdentity, type IdentityChange } from '../writes';

// Each player's game identities: what ties the received scoreboards to the right player.

// "platform|id": the platform and the end of the id are enough to recognise one's own account.
export function shortId(id: string) {
  const [platform = '', accountId = ''] = id.split('|');
  return `${platform} · …${accountId.slice(-6)}`;
}

export function IdentitiesPage() {
  const queryClient = useQueryClient();
  const { me } = useBoardState();
  const { data, error } = useQuery(identitiesQuery);
  const identities = data?.identities ?? [];
  const candidates = data?.candidates ?? [];
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

  return (
    <div className="flex flex-col gap-3.5 lg:max-w-[720px]">
      <PageHeader
        back={<BackLink to="/profil" label="Retour au profil" />}
        kicker="Identités de jeu"
        title="Nos joueurs"
      />
      <p className="px-1 text-[13px] leading-[1.45] text-muted-foreground lg:px-0 lg:text-sm">
        Chaque joueur confirme son identifiant de jeu à partir d’un tableau reçu : c’est lui qui rattache les tableaux
        du Direct au bon joueur.
      </p>
      {error && (
        <p role="alert" className="px-1 text-sm text-destructive">
          {error instanceof ApiError ? 'Connexion au club requise.' : error.message}
        </p>
      )}
      {identities.map((identity) => (
        <Panel key={identity.slot} aria-label={identity.slot} className={cn(identity.owned && 'border-primary/35')}>
          <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2.5">
            <b className="font-display text-[19px]">
              {identity.slot}
              {identity.slot === me && (
                <Badge variant="me" className="ml-1.5 align-middle font-sans">
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
              className="flex items-center justify-between gap-2.5 border-t border-border px-4 py-2.5 font-mono text-[13px] text-soft"
            >
              <span>{shortId(alias.playerId)}</span>
              {alias.primary ? (
                <span className="font-sans text-xs text-muted-foreground">principal</span>
              ) : (
                identity.owned && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => act(identity.slot, alias.playerId, 'remove')}
                    className="h-9 rounded-xl px-3 font-sans text-[13px] font-semibold text-destructive"
                  >
                    Retirer
                  </Button>
                )
              )}
            </div>
          ))}
          {identity.owned ? (
            <div className="flex flex-col gap-2 border-t border-border px-4 pt-3 pb-4">
              <Label htmlFor={`pick-${identity.slot}`} className="text-[13px] font-semibold text-soft">
                {identity.known ? 'Ajouter un identifiant depuis un tableau reçu' : 'Mon joueur dans un tableau reçu'}
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
                    className="h-[46px] w-full min-w-0 rounded-xl bg-secondary dark:bg-secondary"
                  >
                    <SelectValue placeholder={candidateItems.length ? 'Choisir mon joueur…' : 'Aucun tableau reçu'} />
                  </SelectTrigger>
                  <SelectContent>
                    {candidateItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="action"
                  disabled={busy || !choices[identity.slot]}
                  onClick={() => act(identity.slot, choices[identity.slot])}
                  className="h-[46px] rounded-xl px-3.5 font-sans text-sm font-bold"
                >
                  Confirmer
                </Button>
              </div>
              <p className="text-xs leading-[1.4] text-muted-foreground">
                Pour une console, choisis ton propre joueur dans un tableau déjà reçu. Confirme uniquement ton compte :
                un pseudo seul n’est pas une preuve d’identité.
              </p>
            </div>
          ) : (
            !identity.known && (
              <p className="px-4 pb-3.5 text-[13px] leading-[1.4] text-muted-foreground">
                Identité à associer avec l’administrateur du club.
              </p>
            )
          )}
        </Panel>
      ))}
      <Link
        to="/direct"
        className="flex min-h-11 items-center justify-between px-1 py-3 text-sm font-semibold no-underline hover:underline"
      >
        Configurer le Direct PC
        <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}
