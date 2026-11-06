# API du collecteur Windows

Le collecteur natif envoie les matchs d'un membre sans navigateur. Il s'associe une fois au compte du membre, puis s'authentifie avec son propre jeton, révocable depuis le Profil.

## Association

1. Dans **Profil → Collecteur Windows**, le membre clique sur « Associer le collecteur ». La page affiche un code de 8 caractères, en deux groupes de 4 (`ABCD EFGH`).
   - Alphabet : `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (ni `0`, `O`, `1`, `I`, `L`).
   - Valable 10 minutes, une seule fois. Un nouveau code remplace le précédent du même membre.
   - En base, seul son SHA-256 est stocké (`collector_pairing_codes`).
2. Le collecteur envoie le code :

```http
POST /api/collector/pair
Content-Type: application/json

{"code":"ABCD EFGH"}
```

Casse, espaces et tirets sont ignorés. Pas de session, pas d'en-tête `Origin` exigé.

| Réponse | Corps | Sens |
|---|---|---|
| `200` | `{"token":"…","player":"<pseudo duo>"}` | Associé. Le jeton fait 32 octets aléatoires en base64url (43 caractères) ; seul son SHA-256 est stocké, dans `collector_devices`. |
| `400` | `{"error":"…"}` | Le corps ne contient pas un code de 8 caractères de l'alphabet. Ne compte pas comme un essai. |
| `401` | `{"error":"…"}` | Code inconnu, expiré, déjà utilisé, ou bloqué. Le membre doit générer un nouveau code. |

**Essais limités** : un code faux ne peut pas être rattaché au code visé, donc chaque essai faux compte pour tous les codes en attente. Après 5 essais faux pendant sa validité, un code est refusé même s'il est juste.

## Requêtes du collecteur associé

Le jeton voyage uniquement dans l'en-tête, jamais dans une URL :

```http
Authorization: Bearer <jeton>
```

- **`GET /api/collector/status`** → `200 {"player":"<pseudo duo>"}`, ou `401` si le jeton est inconnu ou révoqué (le collecteur repasse alors en mode « à associer »).
- **`POST /api/live`** : même corps, même validation et même attribution au membre que depuis la page `/direct`. Avec un jeton, pas de contrôle d'origine. Réponses : `200 {"ok":true,"match":"…","received":N}`, `400` envoi invalide, `403` le tableau ne contient aucun identifiant de joueur du membre, `413` corps de plus de 64 000 caractères, `401` jeton inconnu ou révoqué.
- `GET /api/live` accepte aussi le jeton : `{"players":["<emplacements du membre>"]}`.

Chaque requête authentifiée met à jour le dernier contact du collecteur (à la minute près).

## Côté membre

- Le Profil liste les collecteurs associés (date d'association, dernier contact) avec un bouton « Révoquer ».
- Supprimer son compte, ou en être retiré par un administrateur, supprime ses collecteurs et son code en attente.
