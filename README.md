# Big Rocket Camp

L'app d'un club Rocket League : les résultats de vos matchs, vos rangs, et des défis sportifs à relever après chaque défaite.

> En cours de réécriture. Le prototype, dont l'historique précède le commit `chore: clear the prototype before the rewrite`, comptait déjà les pompes dues après une défaite et lisait les scores en direct.

## Comment ça marche

- Pendant que vous jouez, un petit programme sur le PC lit le tableau de fin de match grâce à l'[API Stats officielle de Rocket League](https://www.rocketleague.com/developer/stats-api) et l'envoie à l'app. Les joueurs sur console présents dans le match sont comptés.
- L'app tient les résultats, les défis et le classement du club.
- Aucun compte Epic ni mot de passe de jeu n'est demandé.

## Démarrer

Il faut [Node.js](https://nodejs.org) 24 ou plus.

```sh
npm install
npm run db:migrate   # crée la base locale
npm run db:seed      # membres et joueurs fictifs
npm run dev          # l'app et l'API sur http://127.0.0.1:10071
npm run check        # lint, types et tests
```

Pour se connecter en local : `vincent@example.com`, `dimitri@example.com` ou `kevin@example.com`. Le code s'affiche dans le terminal de `npm run dev`.

## Le code

| Dossier                 | Contenu                                                 |
| ----------------------- | ------------------------------------------------------- |
| `src/worker`            | L'API : Hono sur un Worker Cloudflare, sous `/api`.     |
| `src/web`               | L'app web : React, Vite, composants shadcn sur Base UI. |
| `src/web/components/ui` | Les composants shadcn, base de toute l'interface.       |

Le même Worker sert l'API et l'app web ([`docs/deploiement.md`](docs/deploiement.md)).

## Contribuer

Les règles sont dans [`AGENTS.md`](AGENTS.md) : elles s'appliquent aux humains comme aux agents IA.

Avec Codex dans le cloud, rien à installer : créez un environnement pour ce dépôt avec Node 24 et la commande d'installation `npm ci`. Codex lit `AGENTS.md` tout seul.

## Licence

[MIT](LICENSE).
