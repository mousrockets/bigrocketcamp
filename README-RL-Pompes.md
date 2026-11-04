# RL-Pompes

Application privée pour chat-pris-tea, nokouki et kevin-74000.

## Utilisation

- Se connecter au site avec le compte ChatGPT autorisé.
- Choisir une date pour les parties ; les compteurs de pompes restent cumulés.
- Déclarer une série en choisissant le joueur et le nombre réalisé.
- Les tests contre des bots restent séparés. Le bonus dernier aux points est désactivé.

## Architecture

Vinext / Cloudflare Workers, stockage D1, authentification Sites. Le collecteur Windows conserve les captures brutes et son historique local puis envoie les résultats par HTTPS toutes les 30 secondes. La clé composée MatchGuid + PrimaryId évite les doublons entre PC. Les séries sont dédupliquées par UUID. Les clés du collecteur installé sont protégées par Windows DPAPI et ne sont pas dans le dépôt.

La console PS5 ne peut pas envoyer directement à ce collecteur. Les données de Kevin pendant une partie avec un PC restent à valider en jeu. L'application ne prétend pas récupérer ses parties PS5 en solo.

## Vérification

`node --test tests/domain.test.mjs` vérifie les calculs, dates, entrées invalides et contraintes SQLite. `node node_modules/typescript/bin/tsc --noEmit` vérifie les types. Le build passe par le helper Sites. Les migrations SQL et leur journal sont versionnés ; ne pas modifier une migration déjà publiée.

Les bases locale et hébergée sont séparées. Ne jamais importer les tests locaux dans la base réelle. L'API d'ingestion exige INGEST_KEY et le collecteur doit également franchir l'accès privé Sites. Les routes de lecture et de déclaration exigent une identité connectée. Tous les membres invités sont considérés comme une équipe de confiance : ils peuvent déclarer une série pour chaque joueur.

## Évolution

Conserver l'identifiant `.openai/hosting.json`, le dépôt privé, les données D1 et ajouter des migrations pour les nouvelles fonctionnalités. Le code et le design peuvent évoluer après publication. Toute modification rétroactive des règles de calcul doit être décidée explicitement.
