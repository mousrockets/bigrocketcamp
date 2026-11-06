import { useState } from 'react';
import { type Platform, platforms } from '../lib/club';
import { apiFetch } from './api';
import { Brand } from './brand';
import { errorOf, platformLabels, useClub } from './club';
import { CollectorSection } from './collectors';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';

const platformItems = platforms.map((value) => ({ value, label: platformLabels[value] }));

const networkError = (e: unknown) =>
  e instanceof TypeError ? 'Connexion Internet indisponible. Réessaie dans un instant.' : (e as Error).message;

export function Profile() {
  const { me } = useClub();
  const firstVisit = me.duoPseudo === null;
  const [duoPseudo, setDuoPseudo] = useState(me.duoPseudo ?? '');
  const [soloPseudo, setSoloPseudo] = useState(me.soloPseudo ?? '');
  const [platform, setPlatform] = useState<Platform | null>(me.platform);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmingDeletion, setConfirmingDeletion] = useState(false);

  async function save() {
    if (busy) return;
    if (!platform) {
      setError('Choisis ta plateforme.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duoPseudo, soloPseudo, platform }),
      });
      if (!response.ok) throw Error(await errorOf(response, 'Enregistrement impossible.'));
      // The roster and the cards depend on the profile: a fresh load shows them as saved.
      if (firstVisit) location.assign('/');
      else location.reload();
    } catch (e) {
      setError(networkError(e));
      setBusy(false);
    }
  }

  async function deleteAccount() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch('/api/profile', { method: 'DELETE' });
      if (!response.ok) throw Error(await errorOf(response, 'Suppression impossible.'));
      location.assign('/');
    } catch (e) {
      setError(networkError(e));
      setBusy(false);
    }
  }

  return (
    <main>
      <header>
        <Brand />
        {!firstVisit && (
          <a className="back-link" href="/">
            ← Retour au tableau
          </a>
        )}
      </header>
      <section className="settings">
        <p className="eyebrow">MON PROFIL</p>
        <h1>{firstVisit ? 'Bienvenue au club !' : 'Mon profil'}</h1>
        <p className="muted">
          {firstVisit
            ? 'Avant tout, choisis ton pseudo duo : tes matchs, tes exercices et ton rang y seront rattachés.'
            : `Connecté avec ${me.email}.`}
        </p>
        <form
          className="settings-panel"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <div className="settings-field">
            <Label htmlFor="duo-pseudo">Pseudo duo</Label>
            <Input
              id="duo-pseudo"
              required
              minLength={2}
              maxLength={32}
              autoComplete="nickname"
              value={duoPseudo}
              disabled={busy || me.duoPseudoLocked}
              onChange={(event) => setDuoPseudo(event.target.value)}
            />
            <p className="small muted">
              {me.duoPseudoLocked
                ? 'Figé : des matchs, exercices ou rangs y sont déjà rattachés.'
                : 'Ton nom dans les parties à deux. Il se change tant qu’aucun match n’y est rattaché.'}
            </p>
          </div>
          <div className="settings-field">
            <Label htmlFor="solo-pseudo">Pseudo solo (facultatif)</Label>
            <Input
              id="solo-pseudo"
              maxLength={32}
              value={soloPseudo}
              disabled={busy}
              onChange={(event) => setSoloPseudo(event.target.value)}
            />
            <p className="small muted">
              Le nom d’affichage Epic de ton compte solo, même sur console si ce compte est lié à Epic : son rang 2v2
              s’affiche sous ton rang duo.
            </p>
          </div>
          <div className="settings-field">
            <Label htmlFor="platform">Plateforme</Label>
            <Select
              items={platformItems}
              value={platform}
              disabled={busy}
              onValueChange={(value) => setPlatform(value as Platform | null)}
            >
              <SelectTrigger id="platform" className="settings-select">
                <SelectValue placeholder="Choisis ta plateforme" />
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
          <Button type="submit" className="primary" disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </form>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
      </section>
      {!firstVisit && <CollectorSection />}
      <section className="settings">
        <h2>Supprimer mon compte</h2>
        <p className="muted small">
          Ton adresse e-mail, ton profil, tes connexions et tes collecteurs sont effacés, et tu ne peux plus te
          connecter. Tes matchs, exercices et rangs restent dans l’historique du club, sous ton pseudo duo.
        </p>
        {confirmingDeletion ? (
          <div className="settings-actions">
            <Button variant="destructive" className="danger" disabled={busy} onClick={deleteAccount}>
              Oui, supprimer mon compte
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setConfirmingDeletion(false)}>
              Annuler
            </Button>
          </div>
        ) : (
          <Button variant="outline" disabled={busy} onClick={() => setConfirmingDeletion(true)}>
            Supprimer mon compte…
          </Button>
        )}
      </section>
    </main>
  );
}
