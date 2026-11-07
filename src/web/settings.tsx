import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { parisDay } from '../lib/domain';
import { defaultLastPlaceRules, lastPlaceRuleOn } from '../lib/match-rules';
import type { Profile, Role } from '../lib/members';
import { Brand } from './brand';
import { platformLabels, useClub, useClubLogo } from './club';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { shortId } from './connections';
import { resizeLogo } from './logo-image';
import { ApiError, identitiesQuery, membersQuery } from './queries';
import { removeClubLogo, sendJson, uploadClubLogo } from './writes';

const roleItems: { value: Role; label: string }[] = [
  { value: 'member', label: 'Membre' },
  { value: 'admin', label: 'Administrateur' },
];

const ruleItems = [
  { value: 'on', label: 'Oui : +5 pour celui du club qui a le moins de points' },
  { value: 'off', label: 'Non : 5 pompes par défaite pour tout le monde' },
];

const dayLabel = (day: string) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'long' }).format(
    new Date(`${day}T12:00:00Z`),
  );

const networkError = (e: unknown) =>
  e instanceof TypeError ? 'Connexion Internet indisponible. Réessaie dans un instant.' : (e as Error).message;

/** This page's wording of a failed read of the members or of their identities. */
const readError = (e: Error) =>
  e instanceof ApiError ? e.reason || 'Identités de jeu indisponibles.' : networkError(e);

export function Settings() {
  const club = useClub();
  const [name, setName] = useState(club.name);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const logo = useClubLogo();
  const isAdmin = club.me.role === 'admin';
  const queryClient = useQueryClient();
  const membersRead = useQuery({ ...membersQuery, enabled: isAdmin });
  const identitiesRead = useQuery({ ...identitiesQuery, enabled: isAdmin });
  const members: Profile[] = membersRead.data ?? [];
  const identities = identitiesRead.data?.identities ?? [];
  const failedRead = membersRead.error ?? identitiesRead.error;
  const send = useMutation({ mutationFn: sendJson }).mutateAsync;
  const uploadLogoImage = useMutation({ mutationFn: uploadClubLogo }).mutateAsync;
  const resetLogo = useMutation({ mutationFn: removeClubLogo }).mutateAsync;
  const today = parisDay();
  const lastPlaceRules = club.rules?.lastPlace ?? defaultLastPlaceRules;
  const ruleToday = lastPlaceRuleOn(lastPlaceRules, today);
  const comingRule = lastPlaceRules.find((rule) => rule.effectiveFrom > today);
  const [lastPlaceChoice, setLastPlaceChoice] = useState((comingRule ?? ruleToday).enabled ? 'on' : 'off');

  /** Reads the members again after a change; a failure is the action's. */
  const refresh = () => queryClient.fetchQuery({ ...membersQuery, staleTime: 0 });

  useEffect(() => {
    if (failedRead) setError(readError(failedRead));
  }, [failedRead]);

  async function act(task: () => Promise<void>, done: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await task();
      setNotice(done);
    } catch (e) {
      setError(networkError(e));
    } finally {
      setBusy(false);
    }
  }

  const renameClub = () =>
    act(async () => {
      await send({ path: '/api/club', method: 'PUT', body: { name }, fallback: 'Nom du club invalide.' });
      // The name shows in every header: a fresh load updates them all.
      location.reload();
    }, 'Nom du club enregistré.');

  const uploadLogo = () =>
    act(async () => {
      if (!logoFile) return;
      await uploadLogoImage(await resizeLogo(logoFile));
      // The logo shows in every header: a fresh load updates them all.
      location.reload();
    }, 'Logo enregistré.');

  const removeLogo = () =>
    act(async () => {
      await resetLogo();
      location.reload();
    }, 'Logo retiré.');

  const saveRules = () =>
    act(async () => {
      await send({
        path: '/api/club/rules',
        method: 'PUT',
        body: { lastPlace: { enabled: lastPlaceChoice === 'on' } },
        fallback: 'Règle invalide.',
      });
      // The board counts the pushups with these rules: a fresh load reads them again.
      location.reload();
    }, 'Règle enregistrée.');

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
    identities
      .find((identity) => identity.slot === slot)
      ?.aliases.map((alias) => shortId(alias.playerId))
      .join(', ');

  if (!isAdmin) {
    return (
      <main>
        <header>
          <Brand />
          <Link className="back-link" to="/" reloadDocument>
            ← Retour au tableau
          </Link>
        </header>
        <section className="settings">
          <h1>Réglages du club</h1>
          <p className="muted">Cette page est réservée aux administrateurs du club.</p>
        </section>
      </main>
    );
  }

  return (
    <main>
      <header>
        <Brand />
        <Link className="back-link" to="/" reloadDocument>
          ← Retour au tableau
        </Link>
      </header>
      <section className="settings">
        <p className="eyebrow">ADMINISTRATION</p>
        <h1>Réglages du club</h1>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="win" role="status">
            {notice}
          </p>
        )}
        <form
          className="settings-panel"
          onSubmit={(event) => {
            event.preventDefault();
            renameClub();
          }}
        >
          <div className="settings-field">
            <Label htmlFor="club-name">Nom du club</Label>
            <Input
              id="club-name"
              required
              minLength={2}
              maxLength={60}
              value={name}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
            <p className="small muted">Affiché en haut de chaque page et sur l’écran de connexion.</p>
          </div>
          <Button type="submit" className="primary" disabled={busy || name.trim() === club.name}>
            Renommer le club
          </Button>
        </form>
        <form
          className="settings-panel"
          onSubmit={(event) => {
            event.preventDefault();
            uploadLogo();
          }}
        >
          <div className="settings-field">
            <Label htmlFor="club-logo">Logo du club</Label>
            <div className="logo-setting">
              <img className="club-logo" src={logo} alt="Logo actuel" width={64} height={64} />
              <Input
                id="club-logo"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic"
                disabled={busy}
                onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
              />
            </div>
            <p className="small muted">
              L’image est recadrée en carré et allégée sur ton appareil avant l’envoi (quelques dizaines de Ko).
            </p>
          </div>
          <div className="settings-actions">
            <Button type="submit" className="primary" disabled={busy || !logoFile}>
              Envoyer le logo
            </Button>
            {club.logo && (
              <Button type="button" variant="outline" disabled={busy} onClick={removeLogo}>
                Revenir à l’image par défaut
              </Button>
            )}
          </div>
        </form>
      </section>

      <section className="settings">
        <h2>Règles des défis</h2>
        <form
          className="settings-panel"
          onSubmit={(event) => {
            event.preventDefault();
            saveRules();
          }}
        >
          <p className="small muted">Une défaite vaut toujours 5 pompes.</p>
          <div className="settings-field">
            <Label htmlFor="last-place-rule">+5 pour le joueur du club le moins bien classé de son équipe</Label>
            <Select
              items={ruleItems}
              value={lastPlaceChoice}
              disabled={busy}
              onValueChange={(value) => setLastPlaceChoice((value as string | null) ?? 'on')}
            >
              <SelectTrigger id="last-place-rule" className="settings-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ruleItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="small muted">
              Aujourd’hui : {ruleToday.enabled ? '+5 activé' : '+5 désactivé'}
              {ruleToday.enabled && ruleToday.ties === 'none' && ', sauf égalité'}.
              {comingRule &&
                ` À partir du ${dayLabel(comingRule.effectiveFrom)} : ${comingRule.enabled ? '+5 activé' : '+5 désactivé'}.`}
            </p>
            <p className="small muted">
              Un changement s’applique à partir de demain : les matchs déjà joués, ceux d’aujourd’hui compris, gardent
              leurs pompes.
            </p>
          </div>
          <Button
            type="submit"
            className="primary"
            disabled={busy || lastPlaceChoice === ((comingRule ?? ruleToday).enabled ? 'on' : 'off')}
          >
            Enregistrer la règle
          </Button>
        </form>
      </section>

      <section className="settings">
        <h2>Membres</h2>
        <ul className="member-list">
          {members.map((member) => {
            const self = member.id === club.me.id;
            return (
              <li key={member.id}>
                <div>
                  <b>{member.duoPseudo ?? 'Profil à remplir'}</b>
                  {member.role === 'admin' && <span className="member-role">admin</span>}
                  <p className="small muted">
                    {member.email}
                    {member.platform && ` · ${platformLabels[member.platform]}`}
                    {member.soloPseudo && ` · solo : ${member.soloPseudo}`}
                    {self && ' · toi'}
                  </p>
                  {member.duoPseudo && (
                    <p className="small muted">
                      Identités de jeu : {identitiesOf(member.duoPseudo) || 'aucune confirmée pour l’instant'}
                    </p>
                  )}
                </div>
                <div className="settings-actions">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => changeRole(member, member.role === 'admin' ? 'member' : 'admin')}
                  >
                    {member.role === 'admin' ? 'Retirer le rôle admin' : 'Rendre admin'}
                  </Button>
                  {!self &&
                    (removing === member.id ? (
                      <>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="danger"
                          disabled={busy}
                          onClick={() => remove(member)}
                        >
                          Confirmer le retrait
                        </Button>
                        <Button variant="outline" size="sm" disabled={busy} onClick={() => setRemoving(null)}>
                          Annuler
                        </Button>
                      </>
                    ) : (
                      <Button variant="outline" size="sm" disabled={busy} onClick={() => setRemoving(member.id)}>
                        Retirer du club…
                      </Button>
                    ))}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="small muted">
          Un membre retiré ne peut plus se connecter et ses connexions sont fermées. Ses matchs et exercices restent
          dans l’historique, sous son pseudo duo.
        </p>
        <p className="small muted">
          Chaque membre confirme lui-même ses identités de jeu sur la page{' '}
          <Link to="/connexions" reloadDocument>
            Nos joueurs
          </Link>
          , en choisissant son joueur dans un tableau de fin de match reçu.
        </p>
      </section>

      <section className="settings">
        <h2>Inviter quelqu’un</h2>
        <form
          className="settings-panel"
          onSubmit={(event) => {
            event.preventDefault();
            invite();
          }}
        >
          <div className="settings-field">
            <Label htmlFor="invite-email">Adresse e-mail</Label>
            <Input
              id="invite-email"
              type="email"
              inputMode="email"
              autoComplete="off"
              required
              value={email}
              disabled={busy}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="settings-field">
            <Label htmlFor="invite-role">Rôle</Label>
            <Select
              items={roleItems}
              value={role}
              disabled={busy}
              onValueChange={(value) => setRole((value as Role | null) ?? 'member')}
            >
              <SelectTrigger id="invite-role" className="settings-select">
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
          <Button type="submit" className="primary" disabled={busy}>
            Inviter
          </Button>
          <p className="small muted">
            Aucun e-mail d’invitation n’est envoyé : préviens la personne. Elle se connecte ensuite sur {location.host}{' '}
            avec cette adresse et choisit son pseudo duo.
          </p>
        </form>
      </section>
    </main>
  );
}
