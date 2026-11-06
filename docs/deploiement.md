# Déploiement

L'app tourne sur Cloudflare, dans les limites du plan gratuit. Une fusion dans `main` la met en production.

## Une seule fois, par un mainteneur

1. Dans le tableau de bord Cloudflare, Workers & Pages : créer un Worker à partir du dépôt GitHub (Workers Builds), branche de production `main`.
2. Dossier racine `/`. Commande de build : `npm run build` (Cloudflare installe les dépendances avant). Commande de déploiement : `npx wrangler deploy`. Node et npm suivent `.node-version` et `packageManager`.
3. Rattacher le domaine de l'instance au Worker (Custom Domains).

Cloudflare déploie ensuite chaque commit de `main` lui-même : aucun jeton Cloudflare n'est stocké dans GitHub.

## Côté GitHub

- Dépôt public : la protection de `main` n'existe pas pour les dépôts privés du plan gratuit.
- Protection de `main` : PR obligatoire, check `CI / check` obligatoire, validation des CODEOWNERS, historique linéaire.
- Réglages : auto-merge autorisé ; fusion en squash et par rebase autorisées, merge commit interdit.

## Rester dans le plan gratuit

Les limites qui comptent : 100 000 requêtes par jour, 10 ms de CPU par requête (attente réseau exclue), 5 millions de lignes lues par jour en base. L'app ne relit jamais toute la base pour afficher une page : elle lit des totaux tenus à jour à chaque match.
