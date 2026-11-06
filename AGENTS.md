# AGENTS.md

Règles pour tout agent IA qui travaille sur ce dépôt. Elles valent aussi pour les humains.

## Avec qui tu travailles

- Un contributeur débutant : c'est toi qui prends les décisions techniques, dans le cadre de ce fichier et de la doc. Demande-lui ce qu'il veut obtenir, jamais de choisir entre des options techniques, et explique ce que tu as fait avec des mots simples.
- Un contributeur développeur : donne-lui le détail technique, présente les options et leurs compromis, et laisse-le décider.
- Le vocabulaire et les questions de la personne te disent à qui tu parles. Dans le doute, demande-lui.

## Langues

- Anglais : code, noms, commentaires, commits, branches.
- Français : issues, PR (titre et description), docs, et tes réponses.

## Commandes

- `npm install` : installe les dépendances (Node, voir `.node-version`).
- `npm run dev` : lance l'app et l'API sur http://127.0.0.1:10071.
- `npm run check` : lint, types et tests. Doit passer avant toute PR.
- `npm run fmt` : formate le code.
- `npm run types` : régénère les types du Worker après un changement de `wrangler.jsonc`.

## Workflow

1. Pars toujours du dernier `main`.
2. Une demande = une issue = une branche = une PR. Propose de découper une demande qui mélange plusieurs sujets.
3. Issue : contexte, résultat attendu, critères d'acceptation. Si tu ne peux pas créer l'issue, mets ces points dans la PR.
4. Branche courte en anglais : `feat/…`, `fix/…`, `docs/…`, `refactor/…`, `chore/…`.
5. Change le minimum utile. Un comportement nouveau arrive avec son test ; un bug corrigé, avec le test qui l'aurait détecté.
6. Commits au format Conventional Commits (`fix: keep pushups after a reload`). Le premier commit de la PR donne son message au commit fusionné : il résume toute la PR.
7. PR : titre et description en français (quoi, pourquoi, comment vérifier), et `Closes #N`.
8. La PR fusionne seule, en squash, quand la CI est verte. Le label `rebase` garde des commits volontairement atomiques.
9. Fusion dans `main` = mise en production. Termine en résumant ce qui change pour l'utilisateur.

## Stack

- TypeScript strict uniquement : aucun fichier JavaScript.
- Node 24 et npm. Tests : Vitest, exécuté dans le moteur des Workers Cloudflare.
- API : Hono sur un Worker Cloudflare, dans `src/worker`. App web : React et Vite, dans `src/web`.
- Interface : uniquement des composants shadcn (Base UI) de `src/web/components/ui`, adaptés au style du projet. Un composant du projet se construit à partir d'eux. Pour en ajouter un : `npx shadcn@latest add <nom>`.
- Tout élément cliquable affiche un curseur en forme de main (règle globale de `src/web/styles.css`).
- Toujours les versions les plus récentes possibles : voir « Mises à jour » dans `docs/deploiement.md`.

## Validation d'un mainteneur

Seuls `.github/`, `wrangler.jsonc` et ce fichier l'exigent (`.github/CODEOWNERS`). Tout le reste fusionne sans attendre.

## Jamais

- Un secret, un jeton ou une donnée réelle de joueur dans le code, les tests, les logs ou une PR. Les exemples utilisent des joueurs fictifs.
- Une donnée propre à une équipe dans le code : nom, logo et membres sont des réglages de l'app.
- Contourner une protection : anti-bot, CAPTCHA, limite de requêtes.
- Pousser sur `main`, réécrire l'historique, désactiver un test pour faire passer la CI.

## Code

Lisible sans commentaire : noms explicites, fonctions courtes. Un commentaire dit pourquoi, jamais quoi.
