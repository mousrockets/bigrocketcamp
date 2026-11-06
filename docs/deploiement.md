# Déploiement

L'app tourne sur Cloudflare, dans les limites du plan gratuit. Une fusion dans `main` la met en production.

## Une seule fois, par un mainteneur

1. Dans le tableau de bord Cloudflare, Workers & Pages : créer un Worker à partir du dépôt GitHub (Workers Builds), branche de production `main`.
2. Dossier racine `/`. Commande de build : `npm run build` (Cloudflare installe les dépendances avant). Commande de déploiement : `npx wrangler deploy`. Node et npm suivent `.node-version` et `packageManager`.
3. Rattacher le domaine de l'instance au Worker (Custom Domains).

Cloudflare déploie ensuite chaque commit de `main` lui-même : aucun jeton Cloudflare n'est stocké dans GitHub.

## Réglages de l'instance

Dans le Worker, Settings :

- **Build → Variables** (lues au build, visibles dans l'app) : `VITE_CLUB_NAME` (nom du club) et `VITE_CLUB_ROSTER` (pseudos des joueurs, en minuscules, séparés par des virgules) et `VITE_CLUB_PLATFORMS` (joueurs sur console, par exemple `kevin-74000:PS5`). Sans elles, l'app prend les valeurs de `.env`.
- **Variables and Secrets** (lues par l'API) : `MAIL_FROM` (expéditeur des codes, par exemple `Les Trois Mousrockets <connexion@mousrockets.com>`), et en secrets `RESEND_API_KEY`, `INGEST_KEY` (ancien collecteur PC) et `PUBLIC_MMR_IMPORT_KEY` (relevé mensuel du MMR), ces deux derniers seulement s'ils servent ; `RANK_SOURCE_KEY` (au moins 32 caractères) si une source de rangs alimente le MMR 2v2 (`GET /api/ranks/targets`, `POST /api/ranks`, en-tête `X-Rank-Source-Key`).
- **Build → Deploy command** : `npm run deploy`. Il applique les migrations de la base avant de déployer.
- `wrangler.jsonc` : l'identifiant de la base D1 de production (`database_id`).

## Les membres

Seuls les membres se connectent, avec leur adresse e-mail et un code reçu par mail. On en ajoute un ainsi :

```sh
npx wrangler d1 execute bigrocketcamp --remote --command "INSERT INTO members (id, email) VALUES ('<id>', '<adresse>')"
```

L'`id` relie le membre à ses données : pour une instance venue du prototype, c'est l'identifiant ChatGPT du membre, visible dans la colonne `owner` de `player_identities`.

## Reprendre les données du prototype

1. Exporter chaque table du prototype en JSON (un tableau par table, fichier `<table>.json`), hors du dépôt.
2. `node scripts/import-prototype.ts <dossier> > import.sql`
3. `npx wrangler d1 execute bigrocketcamp --remote --file import.sql`, puis ajouter les membres.
4. Supprimer l'export et `import.sql` : ils contiennent des données personnelles.

## Côté GitHub

- Dépôt public : la protection de `main` n'existe pas pour les dépôts privés du plan gratuit.
- Protection de `main` : PR obligatoire, check `CI / check` obligatoire, validation des CODEOWNERS, historique linéaire.
- Réglages : auto-merge autorisé ; fusion en squash et par rebase autorisées, merge commit interdit.

## Rester dans le plan gratuit

Les limites qui comptent : 100 000 requêtes par jour, 10 ms de CPU par requête (attente réseau exclue), 5 millions de lignes lues par jour en base. L'app ne relit jamais toute la base pour afficher une page : elle lit des totaux tenus à jour à chaque match.

## Mises à jour

On utilise toujours les versions les plus récentes possibles, chacune testée par la CI.

- **Dépendances et actions GitHub** : Dependabot ouvre chaque lundi une PR groupée pour les versions mineures, et une PR par version majeure. Une faille connue déclenche aussitôt une PR de sécurité. Toutes fusionnent seules si la CI passe.
- **Node** : la dernière LTS, dans `.node-version`, utilisée par la CI et par les builds Cloudflare. Dependabot ne la suit pas : chaque nouvelle LTS (fin octobre) se monte à la main. `engines` garde l'ancienne LTS en minimum, pour les contributeurs pas encore à jour.
- **Moteur des Workers** : il ne suit pas Node, mais le `compatibility_date` de `wrangler.jsonc`, que Dependabot ne touche pas. Après chaque montée de `wrangler` ou de `@cloudflare/vitest-plugin`, avancer cette date à celle du plus ancien `workerd` installé (`npm ls workerd` : la version `1.AAAAMMJJ.x` donne la date), lire les [changements de compatibilité](https://developers.cloudflare.com/workers/configuration/compatibility-flags/) intervenus entre les deux dates, lancer `npm run types` puis `npm run check`.
