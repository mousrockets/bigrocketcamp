# Déploiement

L'app tourne sur Cloudflare, dans les limites du plan gratuit. Une fusion dans `main` la met en production.

## Une seule fois, par un mainteneur

1. Dans le tableau de bord Cloudflare, Workers & Pages : créer un Worker à partir du dépôt GitHub (Workers Builds), branche de production `main`.
2. Dossier racine `/`. Commande de build : `npm run build` (Cloudflare installe les dépendances avant). Commande de déploiement : `npx wrangler deploy`. Node et npm suivent `.node-version` et `packageManager`.
3. Rattacher le domaine de l'instance au Worker (Custom Domains).

Cloudflare déploie ensuite chaque commit de `main` lui-même : aucun jeton Cloudflare n'est stocké dans GitHub.

## Réglages de l'instance

Dans le Worker, Settings :

- **Variables and Secrets** (lues par l'API) : `MAIL_FROM` (expéditeur des codes, par exemple `Les Trois Mousrockets <connexion@mousrockets.com>`), et en secrets `RESEND_API_KEY` ; `RANK_SOURCE_KEY` (au moins 32 caractères) si une source de rangs alimente le MMR 2v2 (`GET /api/ranks/targets`, `POST /api/ranks`, en-tête `X-Rank-Source-Key`). Le jeu ne donne pas le MMR au collecteur : seule la source de rangs le lit. Pour relire les rangs juste après une partie, elle peut demander souvent `GET /api/ranks/activity` (`{"lastRankedMatchAt": "…" | null, "lastReadAt": "…" | null}` : heure de réception du dernier match classé 2v2, et heure du dernier relevé reçu, quelques lignes lues) ; `GET /api/ranks/targets` donne le même champ, signe que l'app le connaît.
- **Build → Deploy command** : `npm run deploy`. Il applique les migrations de la base avant de déployer.
- `wrangler.jsonc` : l'identifiant de la base D1 de production (`database_id`).

## Version déployée

`GET /api/health` renvoie `{"status":"ok","commit":"a1b2c3d","deployedAt":"…"}`, et le pied de page du tableau l'affiche. Le commit vient de `WORKERS_CI_COMMIT_SHA`, que Workers Builds fournit à la commande de build (`dev` pour un build local) ; la date est celle de la version du Worker (binding `version_metadata`). Quand l'API annonce un autre commit que celui de la page chargée, le pied de page affiche les deux (« Version 535fe91 · page chargée : 0eb8ca1 · … ») avec un lien « Recharger ». Le tableau se recharge de lui-même dès qu'il est masqué ou laissé 30 secondes sans interaction (une frappe, un défilement ou un appui repoussent le délai), jamais pendant un envoi ni dans les 10 secondes où une série peut être annulée. Le formulaire d'exercice et une déclaration en attente d'envoi sont gardés.

## App installable

L'app s'installe sur l'écran d'accueil (manifeste `public/manifest.webmanifest`, icônes dans `public/icons`). Un service worker écrit à la main (`src/web/sw`, construit en `/sw.js` par `scripts/vite-service-worker.ts`) la fait s'ouvrir avec un réseau faible ou absent :

- **Pages** : le réseau d'abord ; s'il échoue ou met plus de 4 secondes, la copie de l'app, et la réponse tardive remplace la copie pour la fois suivante. Une page rechargée prend donc la version déployée dès que le réseau répond : un ancien service worker ne bloque jamais une version, et le rechargement décrit plus haut garde le formulaire d'exercice.
- **Fichiers du build** (`/assets/…`, dont le nom change avec le contenu) : copiés à l'installation, lus depuis la copie.
- **Autres fichiers du site** (icônes, images) : le réseau d'abord, puis la copie.
- **`/api/*`** : jamais touché ni copié, sessions comprises. Hors ligne, l'app affiche « Club injoignable » et réessaie seule au retour du réseau.

Chaque build qui change un fichier change `/sw.js` : le navigateur installe le nouveau service worker, qui prend la main aussitôt et supprime les anciennes copies. Pour retirer un jour le service worker, il faut publier un `/sw.js` qui se désinscrit, pas supprimer le fichier.

## Le club et ses membres

Le nom du club, son logo, ses membres et les règles des défis sont des réglages de l'app, en base : un administrateur les gère dans la page Réglages (lien en bas du tableau). Le logo est recadré et allégé dans le navigateur avant l'envoi, puis gardé dans D1 ; sans logo envoyé, l'app montre `public/club-photo.jpg`. Un changement de règle s'applique à partir du lendemain : les matchs déjà joués gardent leurs pompes. Seuls les membres invités se connectent, avec leur adresse e-mail et un code reçu par mail ; personne ne s'inscrit seul.

Chaque membre remplit son profil : pseudo duo, pseudo solo et plateforme. Le pseudo duo est son emplacement de joueur : les matchs, exercices et rangs y sont rattachés, et les joueurs du tableau sont les membres qui en ont un, dans l'ordre d'arrivée. Il se change tant qu'aucune donnée de jeu n'y est liée, puis il est figé.

Une nouvelle instance n'a encore aucun membre : on crée le premier administrateur une fois, puis il invite les autres depuis l'app.

```sh
npx wrangler d1 execute bigrocketcamp --remote --command "INSERT INTO members (id, email, role) VALUES (lower(hex(randomblob(16))), '<adresse>', 'admin')"
```

## Reprendre les données du prototype

1. Exporter chaque table du prototype en JSON (un tableau par table, fichier `<table>.json`), hors du dépôt.
2. `node scripts/import-prototype.ts <dossier> > import.sql` : les lignes vont dans les tables actuelles (`results` devient `prototype_results`, `match_rosters` devient `prototype_match_rosters`), sans les colonnes retirées par les migrations. Seuls les relevés de la source de rangs sont repris.
3. `npx wrangler d1 execute bigrocketcamp --remote --file import.sql`, puis créer le premier administrateur (voir plus haut).
4. Supprimer l'export et `import.sql` : ils contiennent des données personnelles.

## Côté GitHub

- Dépôt public : la protection de `main` n'existe pas pour les dépôts privés du plan gratuit.
- Protection de `main` : PR obligatoire, check `CI / check` obligatoire, validation des CODEOWNERS, historique linéaire.
- Réglages : auto-merge autorisé ; fusion en squash et par rebase autorisées, merge commit interdit.

## Rester dans le plan gratuit

Les limites qui comptent : 100 000 requêtes par jour, 10 ms de CPU par requête (attente réseau exclue), 5 millions de lignes lues et 100 000 écrites par jour en base. Ce que coûte une requête ne doit pas grandir avec l'historique :

- **Un compteur de version** (`sync_state`) avance à chaque changement que le tableau affiche, par des triggers SQLite : rien à oublier dans le code. Un tableau ouvert envoie sa version ; sans changement, la requête lit 4 lignes.
- **Attente longue** : `GET /api/state?since=N&wait=25` garde la requête jusqu'à 25 s et répond dès qu'une version plus récente existe (vérifiée toutes les 2 s). Un match reçu s'affiche en 2 à 3 secondes ; un tableau ouvert sans activité coûte une requête toutes les 25 s. Onglet caché : aucune requête.
- **Seulement les changements** : la réponse ne contient que les lignes modifiées depuis `N` (colonne `seq`) et ce qui a disparu (`sync_removals`), plus les petites parties (rangs, mois en cours, collecteurs). À l'ouverture, le tableau lit tout par pages de 2 000 lignes, puis le garde dans le navigateur (IndexedDB) : la fois suivante, il ne lit que ce qui a changé.
- **Résultats de match stockés** (`match_results`) : chaque match est réconcilié seul quand un collecteur l'envoie, au lieu de réconcilier toutes les observations à chaque affichage. Un nouveau joueur ou un identifiant confirmé fait reconstruire les matchs par lots de 80 au fil des requêtes.
- Une page chargée avant cette version reçoit encore le tableau entier (`GET /api/state` sans `since`, avec ETag), le temps de se recharger.

`npx vitest run src/worker/load.test.ts --silent=false` mesure les lignes lues et écrites par requête ; le test échoue si le coût d'un tableau ouvert grandit avec l'historique.

## Mises à jour

On utilise toujours les versions les plus récentes possibles, chacune testée par la CI.

- **Dépendances et actions GitHub** : Dependabot ouvre chaque lundi une PR groupée pour les versions mineures, et une PR par version majeure. Une faille connue déclenche aussitôt une PR de sécurité. Toutes fusionnent seules si la CI passe.
- **Node** : la dernière LTS, dans `.node-version`, utilisée par la CI et par les builds Cloudflare. Dependabot ne la suit pas : chaque nouvelle LTS (fin octobre) se monte à la main. `engines` garde l'ancienne LTS en minimum, pour les contributeurs pas encore à jour.
- **Moteur des Workers** : il ne suit pas Node, mais le `compatibility_date` de `wrangler.jsonc`, que Dependabot ne touche pas. Après chaque montée de `wrangler` ou de `@cloudflare/vitest-plugin`, avancer cette date à celle du plus ancien `workerd` installé (`npm ls workerd` : la version `1.AAAAMMJJ.x` donne la date), lire les [changements de compatibilité](https://developers.cloudflare.com/workers/configuration/compatibility-flags/) intervenus entre les deux dates, lancer `npm run types` puis `npm run check`.
