import { useEffect, useState } from 'react';
import type { Profile, Role } from '../lib/members';
import { apiFetch } from './api';
import { Brand } from './brand';
import { errorOf, platformLabels, useClub } from './club';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';

const roleItems: { value: Role; label: string }[] = [
  { value: 'member', label: 'Membre' },
  { value: 'admin', label: 'Administrateur' },
];

const networkError = (e: unknown) =>
  e instanceof TypeError ? 'Connexion Internet indisponible. Réessaie dans un instant.' : (e as Error).message;

async function send(path: string, method: string, body: unknown, fallback: string): Promise<void> {
  const response = await apiFetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw Error(await errorOf(response, fallback));
}

export function Settings() {
  const club = useClub();
  const [name, setName] = useState(club.name);
  const [members, setMembers] = useState<Profile[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const isAdmin = club.me.role === 'admin';

  async function refresh() {
    const response = await apiFetch('/api/members', { cache: 'no-store' });
    if (!response.ok) throw Error(await errorOf(response, 'Liste des membres indisponible.'));
    setMembers(((await response.json()) as { members: Profile[] }).members);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: loads the list once.
  useEffect(() => {
    if (isAdmin) refresh().catch((e) => setError(networkError(e)));
  }, []);

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
      await send('/api/club', 'PUT', { name }, 'Nom du club invalide.');
      // The name shows in every header: a fresh load updates them all.
      location.reload();
    }, 'Nom du club enregistré.');

  const invite = () =>
    act(async () => {
      await send('/api/members', 'POST', { email, role }, 'Invitation impossible.');
      setEmail('');
      setRole('member');
      await refresh();
    }, `${email.trim()} peut maintenant se connecter.`);

  const changeRole = (member: Profile, next: Role) =>
    act(
      async () => {
        await send('/api/members', 'PATCH', { id: member.id, role: next }, 'Changement de rôle impossible.');
        if (member.id === club.me.id) location.reload();
        else await refresh();
      },
      next === 'admin' ? `${member.email} est administrateur.` : `${member.email} n’est plus administrateur.`,
    );

  const remove = (member: Profile) =>
    act(async () => {
      await send('/api/members', 'DELETE', { id: member.id }, 'Retrait impossible.');
      setRemoving(null);
      await refresh();
    }, `${member.email} ne fait plus partie du club.`);

  if (!isAdmin) {
    return (
      <main>
        <header>
          <Brand />
          <a className="back-link" href="/">
            ← Retour au tableau
          </a>
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
        <a className="back-link" href="/">
          ← Retour au tableau
        </a>
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
