# AGENTS.md

Règles pour tout agent IA qui travaille sur ce dépôt. Elles valent aussi pour les humains.

## Avec qui tu travailles

- Un contributeur débutant : c'est toi qui prends les décisions techniques, dans le cadre de ce fichier et de la doc. Demande-lui ce qu'il veut obtenir, jamais de choisir entre des options techniques, et explique ce que tu as fait avec des mots simples.
- Un contributeur développeur : donne-lui le détail technique, présente les options et leurs compromis, et laisse-le décider.
- Le vocabulaire et les questions de la personne te disent à qui tu parles. Dans le doute, demande-lui.
- La personne n'a en général pas de maquette. L'architecture et les conventions ci-dessous te disent comment construire ; les écrans existants te disent à quoi ça ressemble.

## Pour commencer

- Lis `README.md` et `docs/`, puis le code concerné, avant d'agir.
- Si l'environnement n'est pas prêt, guide la personne pas à pas :
  - dans le cloud (Codex…) : un environnement pour ce dépôt, avec la version de Node de `.node-version` et la commande d'installation `npm ci` ;
  - en local : cloner le dépôt, installer Node (`.node-version`), puis les commandes ci-dessous.
- S'il lui manque un accès (organisation GitHub, dépôt, connecteur de ton outil), dis-lui exactement quoi demander à un mainteneur.

## Langues

- Anglais : code, noms, commentaires, commits, branches.
- Français : issues, PR (titre et description), docs, textes de l'app, et tes réponses.

## Commandes

- `npm install` : installe les dépendances (Node, voir `.node-version`).
- `npm run db:migrate` puis `npm run db:seed` : crée la base locale et ses données fictives.
- `npm run dev` : lance l'app et l'API sur http://127.0.0.1:10071 (codes de connexion affichés dans le terminal).
- `npm run check` : lint, types et tests. Doit passer avant toute PR.
- `npm test` : les tests seuls ; `npx vitest run --project web` ou `--project api` pour une moitié.
- `npm run fmt` : formate le code.
- `npm run types` : régénère les types du Worker après un changement de `wrangler.jsonc`.
- `npm run db:generate` : écrit la migration suivante dans `migrations/` à partir de `src/lib/schema.ts`.
- `npm run db:studio` : ouvre Drizzle Studio sur la base locale (https://local.drizzle.studio?port=10077).
- `npx shadcn@latest add <nom>` : ajoute un composant shadcn (ils sont déjà presque tous là).

## Workflow

1. Pars toujours du dernier `main`.
2. Une demande = une issue = une branche = une PR. Propose de découper une demande qui mélange plusieurs sujets.
3. Issue : contexte, résultat attendu, critères d'acceptation, assignée à la personne qui la demande (son compte GitHub). Si tu ne peux pas créer l'issue, mets ces points dans la PR.
4. Branche courte en anglais : `feat/…`, `fix/…`, `docs/…`, `refactor/…`, `chore/…`.
5. Change le minimum utile. Un comportement nouveau arrive avec son test ; un bug corrigé, avec le test qui l'aurait détecté.
6. Fais valider le changement par la personne avant de pousser :
   - lance le serveur de dev (`npm run dev`) et laisse-le tourner pendant la validation ;
   - pour un changement visible, envoie-lui des captures de chaque écran touché, sur téléphone et sur ordinateur, dans chacun de ses cas (vide, passé, égalité, erreur…). Si la base locale ne montre pas un cas, ajoute des données fictives, puis retire-les après les captures, du cache hors ligne du navigateur aussi ;
   - dis-lui comment tester elle-même : l'adresse à ouvrir, comment se connecter (le code s'affiche dans le terminal), et quoi essayer ;
   - attends son accord, puis arrête le serveur.
7. Commits au format Conventional Commits (`fix: keep pushups after a reload`). Le premier commit de la PR donne son message au commit fusionné : il résume toute la PR.
8. PR : titre et description en français (quoi, pourquoi, comment vérifier), et `Closes #N`.
9. Dès la PR ouverte, active la correction automatique de sa CI sans le demander à la personne : un échec de la CI, un conflit ou un commentaire de relecture se corrige jusqu'à ce que la PR fusionne. Dans l'app Claude Code, c'est l'interrupteur Auto-fix de la PR ; un outil qui n'en a pas suit lui-même les checks et corrige.
10. La PR fusionne seule, en squash, quand la CI est verte. Le label `rebase` garde des commits volontairement atomiques : mets-le sur une PR longue dont chaque commit compte.
11. Fusion dans `main` = mise en production. Quelques minutes après la fusion, vérifie que `/api/health` de l'instance (voir `docs/deploiement.md`) annonce le dernier commit de `main` : deux fusions rapprochées peuvent laisser en ligne la plus ancienne. Sinon, préviens un mainteneur.
12. Termine en résumant ce qui change pour l'utilisateur.

## Architecture

Une seule app sur Cloudflare : un Worker sert l'API (`/api/…`) et les fichiers de l'app web. La base est D1 (SQLite).

| Dossier                 | Rôle                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| `src/worker`            | L'API : Hono. `app.ts` assemble les routes de `routes/`, une par domaine.                         |
| `src/lib`               | La logique partagée par l'API et l'app : règles du jeu, lecture de la base, formats.              |
| `src/lib/contract`      | Le contrat de l'API : un schéma Zod pour l'entrée et la sortie de chaque route.                   |
| `src/lib/schema.ts`     | Le schéma de la base (Drizzle). `migrations/` en découle.                                         |
| `src/web`               | L'app web : React, Vite, TanStack Router, Query et Form, composants shadcn sur Base UI.           |
| `src/web/components/ui` | Les composants shadcn, base de toute l'interface.                                                 |
| `src/web/components`    | Les composants du projet partagés par plusieurs écrans, faits de composants shadcn.               |
| `src/web/hooks`         | Les hooks React partagés (`use-now`, `use-media-query`, `use-sounds`…).                           |
| `src/web/<écran>`       | Un dossier par écran : `access`, `shell`, `team`, `challenges`, `matches`, `declare`, `settings`. |
| `src/web/sw`            | Le service worker, qui fait s'ouvrir l'app hors ligne.                                            |

Le chemin d'une donnée : la base → une fonction de `src/lib` → une route de `src/worker/routes` qui répond selon son schéma de `src/lib/contract` → le client typé de l'app → une query ou une mutation TanStack Query → un composant.

## Conventions

Une seule façon de faire chaque chose. Si tu ne trouves pas laquelle, cherche un exemple dans le code avant d'inventer.

### Design

- Épuré : chaque information vit à un seul endroit. Aucun texte ne répète ce que l'interface montre déjà.
- Hiérarchie claire : un chiffre principal par bloc, le reste en retrait. Si on ne sait pas quoi lire en premier, c'est raté.
- Quatre onglets, les mêmes sur téléphone et sur ordinateur : L'équipe, Défis, Matchs, Réglages. Le profil du membre vit dans Réglages, nulle part ailleurs.
- Sur téléphone, les codes d'iOS : barre d'onglets flottante en verre, feuilles (`Sheet`, `Drawer`), sélecteurs segmentés (`ToggleGroup`), interrupteurs (`Switch`). Sur ordinateur, une barre latérale (`Sidebar`).
- Chaque joueur a une seule couleur, celle de son rank actuel le plus haut, duo ou solo (`rankRgb` et `highestTier` dans `src/web/team/stats.ts`).
- Ranks : toujours les vraies icônes de `public/rocket-league/ranks/<rang>.png`, jamais une icône inventée.
- Animations subtiles. Les effets forts sont réservés aux célébrations. Toujours `prefers-reduced-motion` (règle globale de `styles.css`).
- Logo Rocket League : jamais modifié, jamais utilisé pour identifier le club. Chaque page qui le montre, ou une icône de rang, affiche la mention d'Epic (`EpicNotice`, `epicNotice`).
- Sombre uniquement. Chaque écran se vérifie sur téléphone (390 × 844) et sur ordinateur (1440 × 900) ; le passage de l'un à l'autre se fait à `lg` (1024 px).

### Ton

- Fun assumé, en français : tutoiement, phrases courtes. Une blague courte vaut mieux qu'une explication.
- Les mots du jeu en anglais quand c'est l'usage chez les joueurs français : rank, peak, MMR, streak, FF, GG, kickoff, free play.
- Les nombres, heures et dates passent par `src/lib/format.ts` (« 1 509 », « 19 h 42 », « il y a 8 min »).

### Interface

- Tout se construit avec les composants shadcn de `src/web/components/ui`, stylés pour l'app. Jamais d'élément HTML stylé à la main là où un composant existe (bouton, champ, carte, onglets, liste, dialogue, menu…).
- Un style qui revient devient une variante du composant shadcn (`variant`, `size` dans son `cva`), pas une copie de classes. Un ensemble qui revient devient un composant du projet dans `src/web/components`.
- Un onglet se construit dans `TabPage` (`src/web/components/tab-page.tsx`) : lumière du haut, en-tête, mention d'Epic. Ses blocs sont des `Card` (variante `glass` pour une carte de liste, `tile` pour une tuile), ses titres de section suivent le modèle « petites capitales + titre » des onglets existants.
- Un écran de Réglages se construit avec les pièces de `src/web/settings/parts.tsx` (groupes, lignes, interrupteurs, retour).
- Une action ouvre une feuille par-dessus l'onglet (`Dialog` : feuille du bas sur téléphone, fenêtre sur ordinateur), à l'adresse de l'onglet avec un paramètre de recherche, comme Déclarer (`?declarer=true`, `src/web/declare`).
- Un lien qui ressemble à un bouton est un `Link` avec `buttonVariants(...)`, jamais un `Button` : un lien doit rester un lien pour les lecteurs d'écran.
- Les couleurs, polices et animations sont des variables de `src/web/styles.css` (`text-t1`, `text-t2`, `text-t3`, `bg-gate`, `text-cost`, `text-win`, `text-link`, `border-line`, `font-display`, `num`, `title-display`, `label-caps`, `animate-rise`…). Jamais de couleur en dur dans un composant, sauf les teintes des ranks (`src/web/team/stats.ts`).
- Le sens des couleurs : orange, ce qui coûte des pompes ; vert, ce qui est réglé ou gagné ; bleu, un lien ; rouge, une erreur ou le direct.
- Tout élément cliquable affiche un curseur en forme de main (règle globale de `styles.css`).

### Données

- Chaque appel à l'API passe par le client typé de `src/web/api.ts` (`api`, ou `guestApi` avant la connexion) et par TanStack Query. Jamais de `fetch` ailleurs.
  - Lire : une `queryOptions` dans `src/web/queries.ts`, qui relit la réponse avec son schéma : `dataOf(api.members.$get(), memberList, 'Liste des membres indisponible.')`.
  - Écrire : une fonction de `src/web/writes.ts`, passée à `useMutation` : `sent(api.profile.$put({ json: profile }), 'Enregistrement impossible.')`.
- Le tableau de bord (résultats, séries, ranks) est la query de `src/web/board.tsx` : partagée par les onglets via `useBoardState()`, gardée dans le navigateur par `src/web/persistence.ts` pour s'ouvrir hors ligne.
- Chaque route de l'API valide son entrée avec le schéma de `src/lib/contract`, et sa réponse respecte le schéma de sortie (`satisfies`). Une nouvelle route ajoute ses deux schémas au contrat, puis sa query ou sa mutation.
- L'app et l'API sont déployées l'une après l'autre : une app plus ancienne ou plus récente que l'API ne perd jamais de donnée. Un champ ajouté à une réponse est facultatif pour l'app, une valeur ajoutée à une liste fermée a un repli (`.catch()`), et un champ n'est jamais retiré ni renommé sans période où les deux existent.
- Les formulaires utilisent TanStack Form (`useForm`), avec le schéma Zod du contrat comme validation et les composants `Field` de shadcn pour l'affichage (exemple : `src/web/access/welcome.tsx`). Un message d'erreur est en français et dit quoi corriger.
- La navigation passe par TanStack Router (`src/web/router.tsx`) : chaque page a sa route, chaque lien est un `Link`.
- Les jours du club sont ceux de Paris : `src/lib/days.ts`.

### Base

- Requêtes avec Drizzle. Le SQL brut n'est permis que là où Drizzle ne sait pas l'exprimer, avec un commentaire qui dit pourquoi.
- Changer la base :
  - modifier `src/lib/schema.ts`, puis `npm run db:generate`, et relire la migration générée ;
  - les triggers et les reprises de données s'écrivent à la main dans la migration ;
  - une migration qui touche des données existantes arrive avec un test qui la rejoue sur des données de forme réelle ;
  - les mois clos (`monthly_mmr_results`) et les dettes (`drink_debts`) ne changent jamais.

### Tests

- Vitest, en deux projets (`vitest.config.ts`) :
  - `api` : `src/lib`, `src/worker` et `scripts`, exécutés dans le moteur des Workers avec une base D1 neuve ;
  - `web` : `src/web`, dans un navigateur simulé, avec Testing Library. `renderInApp` (`src/web/test-utils.tsx`) affiche un composant avec un club, un tableau et un routeur.
- Un test décrit ce que voit ou fait un membre (« montre la dette du membre »), et cherche les éléments par leur rôle et leur texte, comme un lecteur d'écran.
- Les joueurs des tests sont fictifs (`src/lib/club-fixture.ts`, `src/web/test-utils.tsx`).

### Données personnelles (RGPD)

- Aucun cookie ni traceur qui ne soit strictement nécessaire : seul le cookie de session existe.
- Les journaux de l'API ne contiennent ni texte ni jeton d'un membre, ni adresse e-mail.
- Aucun secret ni contenu dans une URL : jeton, texte, titre.
- Une donnée personnelle nouvelle (champ, table, envoi à un service) se signale à un mainteneur avant la PR : il faut savoir pourquoi on la garde, combien de temps, et comment l'effacer.

### Code

- Lisible sans commentaire : noms explicites, fonctions courtes. Un commentaire dit pourquoi, jamais quoi.
- Le moins de code maison possible : si une bibliothèque du projet (shadcn, TanStack, Zod, Drizzle, Hono, date-fns) le fait, on s'en sert.
- TypeScript strict uniquement : aucun fichier JavaScript.

## Stack

- Node (la dernière LTS, dans `.node-version`) et npm.
- API : Hono sur un Worker Cloudflare, Zod, Drizzle ORM sur D1.
- App web : React, Vite, Tailwind, shadcn (Base UI), TanStack Router, Query et Form, Zod, date-fns.
- Tests : Vitest, Testing Library.
- Toujours les versions les plus récentes possibles : voir « Mises à jour » dans `docs/deploiement.md`.

## Validation d'un mainteneur

- `.github/`, `wrangler.jsonc` et ce fichier l'exigent (`.github/CODEOWNERS`).
- Tout le reste fusionne sans attendre, écrans compris : un écran changé ou nouveau se construit avec les composants, variantes et variables existants, dans le style des écrans voisins.

## Jamais

- Un secret, un jeton ou une donnée réelle de joueur dans le code, les tests, les logs ou une PR. Les exemples utilisent des joueurs fictifs.
- Une donnée propre à une équipe dans le code : nom, logo et membres sont des réglages de l'app.
- Contourner une protection : anti-bot, CAPTCHA, limite de requêtes.
- Pousser sur `main`, réécrire l'historique, désactiver un test pour faire passer la CI.
