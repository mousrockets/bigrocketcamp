# Déploiement

L'app tourne sur Cloudflare, dans les limites du plan gratuit. Une fusion dans `main` la met en production.

## Une seule fois, par un mainteneur

1. Dans le tableau de bord Cloudflare, Workers & Pages : créer un Worker à partir du dépôt GitHub (Workers Builds), branche de production `main`.
2. Dossier racine `/`. Commande de build : `npm run build` (Cloudflare installe les dépendances avant). Commande de déploiement : `npm run deploy`, qui note un point de restauration de la base, applique ses migrations, puis déploie (voir « Sauvegarde et restauration »). Node et npm suivent `.node-version` et `packageManager`.
3. Rattacher le domaine de l'instance au Worker (Custom Domains).

Cloudflare déploie ensuite chaque commit de `main` lui-même : aucun jeton Cloudflare n'est stocké dans GitHub.

## Réglages de l'instance

Dans le Worker, Settings :

- **Variables and Secrets** (lues par l'API) : `MAIL_FROM` (expéditeur des codes, par exemple `Les Trois Mousrockets <connexion@mousrockets.com>`), et en secrets `RESEND_API_KEY` ; `RANK_SOURCE_KEY` (au moins 32 caractères) si une source de rangs alimente le MMR 2v2 (`GET /api/ranks/targets`, `POST /api/ranks`, en-tête `X-Rank-Source-Key`). Le jeu ne donne pas le MMR au collecteur : seule la source de rangs le lit. Pour relire les rangs juste après une partie, elle peut demander souvent `GET /api/ranks/activity` (`{"lastRankedMatchAt": "…" | null, "lastReadAt": "…" | null}` : heure de réception du dernier match classé 2v2, ou du dernier compte solo qu'un membre a renseigné, et heure du dernier relevé reçu, quelques lignes lues) ; `GET /api/ranks/targets` donne le même champ, signe que l'app le connaît.
- **Build → Deploy command** : `npm run deploy`. Il note un point de restauration de la base, applique ses migrations, puis déploie.
- `wrangler.jsonc` : l'identifiant de la base D1 de production (`database_id`).

## Les réglages Cloudflare de mousrockets.com

Tout ce qui a été réglé à la main pour l'instance mousrockets.com, chez Cloudflare et autour. Seuls les noms des secrets figurent ici, jamais leurs valeurs. Le reste vit dans `wrangler.jsonc` et part avec chaque déploiement.

### Compte

- Offre gratuite uniquement : Workers, D1 et KV dans leurs limites gratuites (voir « Rester dans le plan gratuit »).

### Domaine `mousrockets.com`

- Acheté le 6 novembre 2026 chez Cloudflare Registrar ; son DNS est chez Cloudflare.
- **DNS → Records** : les enregistrements que Resend demande pour envoyer depuis le domaine, ajoutés pour le vérifier : DKIM (`resend._domainkey`), MX et SPF du sous-domaine d'envoi (`send`). Aucun enregistrement DMARC pour l'instant.
- **SSL/TLS → Edge Certificates → Always Use HTTPS** : activé le 7 novembre 2026. `http://mousrockets.com` répond `301` vers `https://`. HSTS n'est pas activé.

### Base D1 `bigrocketcamp`

- Créée le 6 novembre 2026 avec la juridiction **UE** (`eu`) : les données restent dans l'Union européenne. Son identifiant est dans `wrangler.jsonc`.
- Les migrations s'appliquent à chaque déploiement (`npm run deploy`), jamais à la main, juste après la lecture d'un point de restauration (voir « Sauvegarde et restauration »).

### Worker `bigrocketcamp`

- **Settings → Build** (Workers Builds) : dépôt `mousrockets/bigrocketcamp`, branche `main`, dossier `/`, build `npm run build`, déploiement `npm run deploy`. Aucun jeton Cloudflare dans GitHub.
- **Settings → Domains & Routes** : domaine personnalisé `mousrockets.com`. L'adresse `workers.dev` et les URL d'aperçu sont coupées par `wrangler.jsonc` (`workers_dev`, `preview_urls`).
- **Settings → Variables and Secrets** :
  - variable `MAIL_FROM` : l'expéditeur des codes de connexion, sur le domaine vérifié dans Resend ;
  - secret `RESEND_API_KEY` : la clé d'envoi de Resend ;
  - secret `RANK_SOURCE_KEY` : la clé partagée avec la source de rangs.
- `keep_vars: true` dans `wrangler.jsonc` : un déploiement n'efface plus ces variables. Sans lui, `MAIL_FROM` avait disparu au premier déploiement (#27).
- Réglé par `wrangler.jsonc`, sans rien à faire dans le tableau de bord :
  - la tâche planifiée `5 * * * *`, qui clôt les mois terminés ;
  - les journaux (`observability`) ;
  - la date de la version en ligne (`version_metadata`).

### Source de rangs

La source de rangs de mousrockets.com est un autre Worker du même compte, avec son propre stockage KV et sa tâche planifiée chaque minute. Elle est mise en ligne à la main, pas par Workers Builds. Son dépôt est privé, car il touche au compte Epic jetable, et ses réglages y sont documentés. L'app ne l'appelle jamais : c'est la source qui interroge l'app, avec `RANK_SOURCE_KEY`.

### Resend, pour les e-mails

- Un compte dédié à l'app. Le domaine `mousrockets.com` y est vérifié, dans la région **Ireland (eu-west-1)**, pour que les envois restent dans l'UE.
- La clé d'API n'a que le droit d'envoyer (« Sending access »), et seulement depuis ce domaine.

## Sauvegarde et restauration

Les mois clos (`monthly_mmr_results`) et les dettes (`drink_debts`) ne doivent jamais se perdre.

### Ce que Cloudflare garde tout seul

D1 garde l'historique de la base (Time Travel), sans rien activer ni payer : on peut la remettre dans l'état où elle était à n'importe quelle minute des **7 derniers jours** sur l'offre gratuite, celle du club, et des 30 derniers jours sur l'offre payante Workers Paid ([Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)). Au-delà, seul un export (plus bas) permet de revenir en arrière.

### Avant chaque migration

`npm run deploy` lit d'abord le point de restauration actuel de la base (`wrangler d1 time-travel info`), puis applique les migrations, puis déploie le Worker. Le journal du build (Workers & Pages → `bigrocketcamp` → Deployments) affiche donc, avant les migrations :

```text
⚠️ The current bookmark is '<point>'
⚡️ To restore to this specific bookmark, run:
 `wrangler d1 time-travel restore bigrocketcamp --bookmark=<point>`
```

Si ce point ne peut pas être lu, le déploiement s'arrête avant de toucher la base.

### Revenir en arrière

Restaurer remplace toute la base : ce qui est arrivé après le point choisi (matchs reçus, pompes déclarées, dettes réglées) disparaît. On ne le fait que si une migration a abîmé des données, en prévenant le club. Un mainteneur, connecté avec `npx wrangler login` :

1. Remet en ligne la version précédente du Worker (Workers & Pages → `bigrocketcamp` → Deployments → Rollback), pour que le code en ligne corresponde à la base restaurée.
2. Restaure la base au point du journal du build : `npx wrangler d1 time-travel restore bigrocketcamp --bookmark=<point> --config wrangler.jsonc`. La commande demande confirmation, puis affiche le point d'avant la restauration, pour l'annuler au besoin.
3. Ouvre aussitôt une PR qui retire ou corrige la migration fautive : sinon, la fusion suivante la rejoue.

Pour revenir à une heure précise plutôt qu'à un point du journal, `--timestamp` remplace `--bookmark`, avec le fuseau de Paris : `--timestamp=2026-11-20T19:00:00+01:00` (`+02:00` en été). `npx wrangler d1 time-travel info bigrocketcamp --timestamp=… --config wrangler.jsonc` montre d'abord le point correspondant, sans rien changer.

### Un export complet, hors de Cloudflare

Time Travel vit chez Cloudflare, avec la base, et ne remonte pas loin. De temps en temps (au début de chaque mois, après la clôture) et avant une migration délicate, un mainteneur en garde une copie complète :

```sh
npx wrangler d1 export bigrocketcamp --remote --config wrangler.jsonc --output ../bigrocketcamp-AAAA-MM-JJ.sql
```

L'export bloque la base le temps de sa lecture : quelques secondes, à faire en dehors des soirées de jeu. Pour s'en servir, on l'importe dans une base neuve (`npx wrangler d1 create <nom> --jurisdiction eu`, puis `npx wrangler d1 execute <nom> --remote --file <export>.sql`), vers laquelle `wrangler.jsonc` pointe ensuite.

L'export contient des données personnelles : adresses e-mail, pseudos, toute l'activité des membres.

- Il se garde hors du dépôt (d'où le `../`), sur un stockage privé et chiffré auquel seuls les mainteneurs ont accès.
- Jamais dans Git, une issue, une PR, une discussion, un mail ou un salon de discussion, même privés.
- On ne garde que les trois derniers exports et on supprime les autres : un membre effacé de l'app doit finir par disparaître des copies aussi.

### Migrations et Worker en ligne

Les migrations passent avant le nouveau Worker : pendant le déploiement, et pour de bon si `wrangler deploy` échoue, l'ancien code tourne sur la base migrée. Une migration reste donc compatible avec le Worker en ligne : elle ajoute (table, colonne facultative ou avec une valeur par défaut), mais ne supprime ni ne renomme rien que le code en ligne lit ou écrit encore. Pour retirer ou renommer, une première PR arrête de s'en servir ; une suivante, une fois la première en ligne, le retire de la base.

## Version déployée

`GET /api/health` renvoie `{"status":"ok","commit":"a1b2c3d","deployedAt":"…"}`. Le commit vient de `WORKERS_CI_COMMIT_SHA`, que Workers Builds fournit à la commande de build (`dev` pour un build local) ; la date est celle de la version du Worker (binding `version_metadata`). Quand l'API annonce un autre commit que celui de la page chargée, l'app se recharge d'elle-même dès qu'elle est masquée ou laissée 30 secondes sans interaction (une frappe, un défilement ou un appui repoussent le délai) ; l'app installée se recharge aussi au retour après 5 minutes d'absence (`src/web/shell/fresh-version.ts`).

## App installable

L'app s'installe sur l'écran d'accueil (manifeste `public/manifest.webmanifest`, icônes dans `public/icons`). Un service worker écrit à la main (`src/web/sw`, construit en `/sw.js` par `scripts/vite-service-worker.ts`) la fait s'ouvrir avec un réseau faible ou absent :

- **Pages** : le réseau d'abord ; s'il échoue ou met plus de 4 secondes, la copie de l'app, et la réponse tardive remplace la copie pour la fois suivante. Une page rechargée prend donc la version déployée dès que le réseau répond : un ancien service worker ne bloque jamais une version, et le rechargement décrit plus haut garde le formulaire d'exercice.
- **Fichiers du build** (`/assets/…`, dont le nom change avec le contenu) : copiés à l'installation, lus depuis la copie.
- **Autres fichiers du site** (icônes, images) : le réseau d'abord, puis la copie.
- **`/api/*`** : jamais touché ni copié, sessions comprises. Hors ligne, l'app affiche « Club injoignable » et réessaie seule au retour du réseau.

Chaque build qui change un fichier change `/sw.js` : le navigateur installe le nouveau service worker, qui prend la main aussitôt et supprime les anciennes copies. Pour retirer un jour le service worker, il faut publier un `/sw.js` qui se désinscrit, pas supprimer le fichier.

## Le club et ses membres

Le nom du club, son logo, ses membres et les règles des défis sont des réglages de l'app, en base : un administrateur les gère dans l'onglet Réglages. Le logo est recadré et allégé dans le navigateur avant l'envoi, puis gardé dans D1 ; sans logo envoyé, l'app montre la marque « BRC » de Big Rocket Camp. Un changement de règle s'applique à partir du lendemain : les matchs déjà joués gardent leurs pompes. Seuls les membres invités se connectent, avec leur adresse e-mail et un code reçu par mail ; personne ne s'inscrit seul.

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
- **Résultats de match stockés** (`match_results`) : chaque match est réconcilié seul quand un collecteur l'envoie, au lieu de réconcilier toutes les observations à chaque affichage. Un nouveau joueur, un identifiant confirmé ou un changement du code qui calcule les matchs (empreinte de `src/lib/match-builds.ts` et de ce qu'il importe, minifiés : `scripts/match-build-code.ts`) fait reconstruire les matchs par lots de 80 au fil des requêtes.
- Une page chargée avant cette version reçoit encore le tableau entier (`GET /api/state` sans `since`, avec ETag), le temps de se recharger.

`npx vitest run src/worker/load.test.ts --silent=false` mesure les lignes lues et écrites par requête ; le test échoue si le coût d'un tableau ouvert grandit avec l'historique.

## Mises à jour

On utilise toujours les versions les plus récentes possibles, chacune testée par la CI.

- **Dépendances et actions GitHub** : Dependabot ouvre chaque lundi une PR groupée pour les versions mineures, et une PR par version majeure. Une faille connue déclenche aussitôt une PR de sécurité. Toutes fusionnent seules si la CI passe.
- **Node** : la dernière LTS, dans `.node-version`, utilisée par la CI et par les builds Cloudflare. Dependabot ne la suit pas : chaque nouvelle LTS (fin octobre) se monte à la main. `engines` garde l'ancienne LTS en minimum, pour les contributeurs pas encore à jour.
- **Moteur des Workers** : il ne suit pas Node, mais le `compatibility_date` de `wrangler.jsonc`, que Dependabot ne touche pas. Après chaque montée de `wrangler` ou de `@cloudflare/vitest-plugin`, avancer cette date à celle du plus ancien `workerd` installé (`npm ls workerd` : la version `1.AAAAMMJJ.x` donne la date), lire les [changements de compatibilité](https://developers.cloudflare.com/workers/configuration/compatibility-flags/) intervenus entre les deux dates, lancer `npm run types` puis `npm run check`.
