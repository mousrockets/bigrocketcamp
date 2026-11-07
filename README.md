# Big Rocket Camp

L'app d'un club Rocket League : les résultats de vos matchs, vos rangs, et des pompes à faire après chaque défaite.

## Comment ça marche

- Pendant que vous jouez, un petit programme sur le PC (le [collecteur](docs/collecteur.md)) lit le tableau de fin de match grâce à l'[API Stats officielle de Rocket League](https://www.rocketleague.com/developer/stats-api) et l'envoie à l'app.
- Chaque défaite coûte des pompes. Vous les déclarez dans l'app, qui tient la dette de chacun, les défis du club et le classement.
- Aucun compte Epic ni mot de passe de jeu n'est demandé : on se connecte avec son e-mail et un code.

## Démarrer

Il faut [Node.js](https://nodejs.org), dans la version de `.node-version`.

```sh
npm install
npm run db:migrate   # crée la base locale
npm run db:seed      # des membres fictifs
npm run dev          # l'app sur http://127.0.0.1:10071
npm run check        # lint, types et tests
```

Pour se connecter en local : `dimitri@example.com`, `vincent@example.com` ou `kevin@example.com`. Le code s'affiche dans le terminal de `npm run dev`.

## Contribuer

Décrivez ce que vous voulez à votre agent IA (Codex, Claude…) : il lit [`AGENTS.md`](AGENTS.md), qui contient l'architecture et les règles du projet, et s'en occupe. Les mêmes règles valent pour les humains.

Avec Codex dans le cloud, rien à installer : créez un environnement pour ce dépôt avec la version de Node de `.node-version` et la commande d'installation `npm ci`.

Le déploiement et les réglages de l'instance sont dans [`docs/deploiement.md`](docs/deploiement.md).

## Licence

[MIT](LICENSE).

## Marques

Rocket League, son logo et ses icônes de rang appartiennent à Epic Games, Inc. Les fichiers de `public/rocket-league/` ne sont pas couverts par la licence MIT : voir [leur notice](public/rocket-league/README.md). Ce projet n'est pas officiel et n'a pas l'approbation d'Epic.
