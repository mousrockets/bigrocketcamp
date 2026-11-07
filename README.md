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
npm run db:studio    # parcourir la base locale dans Drizzle Studio
```

Drizzle Studio s'ouvre sur https://local.drizzle.studio?port=10077, et lit la base locale que `npm run dev` utilise, jamais celle de production. Chrome peut demander d'autoriser l'accès au réseau local. Safari et Brave le bloquent : voir la [doc de Drizzle](https://orm.drizzle.team/docs/drizzle-kit-studio).

Pour se connecter en local : `vincent@example.com`, `dimitri@example.com` ou `kevin@example.com`. Le code s'affiche dans le terminal de `npm run dev`.

## Le code

| Dossier                 | Contenu                                                 |
| ----------------------- | ------------------------------------------------------- |
| `src/worker`            | L'API : Hono sur un Worker Cloudflare, sous `/api`.     |
| `src/web`               | L'app web : React, Vite, composants shadcn sur Base UI. |
| `src/web/components/ui` | Les composants shadcn, base de toute l'interface.       |
| `src/lib/schema.ts`     | Le schéma de la base (Drizzle).                         |
| `migrations`            | Les migrations de la base, appliquées par wrangler.     |

Le même Worker sert l'API et l'app web ([`docs/deploiement.md`](docs/deploiement.md)).

## Contribuer

Les règles sont dans [`AGENTS.md`](AGENTS.md) : elles s'appliquent aux humains comme aux agents IA.

Avec Codex dans le cloud, rien à installer : créez un environnement pour ce dépôt avec la version de Node de `.node-version` et la commande d'installation `npm ci`. Codex lit `AGENTS.md` tout seul.

## Licence

[MIT](LICENSE).

## Marques

Rocket League, son logo et ses icônes de rang appartiennent à Epic Games, Inc. Les fichiers de `public/rocket-league/` ne sont pas couverts par la licence MIT : voir [leur notice](public/rocket-league/README.md). Ce projet n'est pas officiel et n'a pas l'approbation d'Epic.
