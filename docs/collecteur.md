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

| Réponse | Corps                                   | Sens                                                                                                                              |
| ------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `200`   | `{"token":"…","player":"<pseudo duo>"}` | Associé. Le jeton fait 32 octets aléatoires en base64url (43 caractères) ; seul son SHA-256 est stocké, dans `collector_devices`. |
| `400`   | `{"error":"…"}`                         | Le corps ne contient pas un code de 8 caractères de l'alphabet. Ne compte pas comme un essai.                                     |
| `401`   | `{"error":"…"}`                         | Code inconnu, expiré, déjà utilisé, ou bloqué. Le membre doit générer un nouveau code.                                            |

**Essais limités** : un code faux ne peut pas être rattaché au code visé, donc chaque essai faux compte pour tous les codes en attente. Après 5 essais faux pendant sa validité, un code est refusé même s'il est juste.

## Requêtes du collecteur associé

Le jeton voyage uniquement dans l'en-tête, jamais dans une URL :

```http
Authorization: Bearer <jeton>
```

- **`GET /api/collector/status`** → `200 {"player":"<pseudo duo>"}`, ou `401` si le jeton est inconnu ou révoqué (le collecteur repasse alors en mode « à associer »).
- **`POST /api/live`** : le tableau de fin de match (schéma `liveMatchInput` dans `src/lib/live-stats.ts`). Depuis la version 0.3.0, `state.Game` porte aussi `TimeSeconds` (temps restant) et `bOvertime` au dernier état avant la fin : un match gagné avec du temps restant hors prolongation est un abandon des adversaires (« pompes esquivées », 5 de moins). Après la fin, l'horloge ne descend que si elle montrait au plus une seconde : le jeu peut la remettre à 0:00 après un abandon. Depuis la version 0.4.0, `clockTrace` liste aussi les derniers changements de l'horloge avant la fin et les premiers après (`TimeSeconds`, `bOvertime`, `ended`), gardés tels quels pour vérifier comment le jeu termine un abandon. Un collecteur plus ancien ne les envoie pas : ni abandon ni prolongation ne sont alors connus. Depuis la version 0.5.0, `departures` liste les joueurs identifiés vus avant la fin et absents de la dernière mise à jour avant `MatchEnded` (8 au plus, leur dernière ligne, omis quand personne n'est parti) : un joueur du club parti avant la fin prend une défaite (5 pompes, sans bonus ni pompes esquivées), et des adversaires tous partis avant la fin font un FF. Une liste illisible est ignorée, le match compte quand même. Le collecteur envoie aussi `{"left":true, state, startedAt, leftAt, seenIds}` quand son joueur quitte le match avant la fin (schéma `liveLeftInput`) : seul le départ du membre qui l'envoie est gardé, et un départ ne compte plus dès qu'une source envoie une ligne finale de ce joueur. Avec un jeton, pas de contrôle d'origine. Réponses : `200 {"ok":true,"match":"…","received":N}`, `400` envoi invalide, `403` le tableau ne contient aucun identifiant de joueur du membre, `413` corps de plus de 64 000 caractères, `401` jeton inconnu ou révoqué.
- `GET /api/live` accepte aussi le jeton : `{"players":["<emplacements du membre>"]}`.

Chaque requête authentifiée met à jour le dernier contact du collecteur (à la minute près).

## Côté membre

- Réglages → Collecteur liste les collecteurs associés (date d'association, dernier contact) avec un bouton « Révoquer ».
- Supprimer son compte, ou en être retiré par un administrateur, supprime ses collecteurs et son code en attente.
