# RL-Pompes

Application privée pour chat-pris-tea, nokouki et kevin-74000.

## Utilisation

- Se connecter au site avec le compte ChatGPT autorisé.
- Choisir une date pour les parties ; les compteurs de pompes restent cumulés.
- Déclarer un exercice en choisissant le joueur, puis les pompes, le gainage ou les abdos réalisés.
- 1 minute de gainage réduit la dette de 15 pompes ; 20 abdos la réduisent de 10 pompes. Les défaites continuent de générer 5 pompes.
- Le gainage se saisit en minutes par tranches de 0,25 minute (15 secondes). Les équivalences fractionnaires sont conservées, sans arrondir la dette à l’entier.
- Si une série dépasse la dette, l’aperçu distingue son équivalent de la réduction effective (plafonnée au solde). La confirmation affiche le solde actualisé, jamais une réduction supérieure à la dette. Toute la série reste dans les totaux et l’historique. Les réponses d’actualisation obsolètes ne remplacent pas un solde plus récent.
- La dette et les trois totaux d’efforts restent cumulés depuis le début. Le filtre de date sélectionne les matchs et l’historique des exercices.
- Le gainage est stocké en secondes entières, les autres exercices en répétitions. Les anciennes séries et les déclarations de l’ancien client sont des pompes. Les tentatives répétées avec le même UUID ne doublent pas une série ; un type ou une quantité différents avec le même UUID sont refusés.
- Les tests contre des bots restent séparés. Le bonus dernier aux points est désactivé.

## Architecture

Vinext / Cloudflare Workers, stockage D1, authentification Sites. Le collecteur Windows conserve les captures brutes et son historique local puis envoie les résultats par HTTPS toutes les 30 secondes. La clé composée MatchGuid + PrimaryId évite les doublons entre PC. Les séries sont dédupliquées par UUID. Les clés du collecteur installé sont protégées par Windows DPAPI et ne sont pas dans le dépôt.

La console PS5 ne peut pas envoyer directement à ce collecteur. Les données de Kevin pendant une partie avec un PC restent à valider en jeu. L'application ne prétend pas récupérer ses parties PS5 en solo.

## Vérification

`npm test` vérifie les calculs, dates, entrées invalides, migrations SQLite et les routes de déclaration/lecture (identité et binding D1 simulés). La matrice de régression couvre les trois exercices, les dettes nulles ou fractionnaires, les séries inférieures, égales ou supérieures à la dette et les limites de quantité. Les tests du composant React exécutent le formulaire réel : double validation immédiate, reprise après coupure/rechargement, stockage local indisponible et réponses d’actualisation obsolètes. Le rendu de test React ne remplace pas un essai dans un navigateur réel. `node node_modules/typescript/bin/tsc --noEmit` vérifie les types. Les migrations SQL et leur journal sont versionnés ; ne pas modifier une migration déjà publiée.

Les bases locale et hébergée sont séparées. Ne jamais importer les tests locaux dans la base réelle. L'API d'ingestion exige INGEST_KEY et le collecteur doit également franchir l'accès privé Sites. Les routes de lecture et de déclaration exigent une identité connectée. Tous les membres invités sont considérés comme une équipe de confiance : ils peuvent déclarer une série pour chaque joueur.

## Évolution

Conserver l'identifiant `.openai/hosting.json`, le dépôt privé, les données D1 et ajouter des migrations pour les nouvelles fonctionnalités. Le code et le design peuvent évoluer après publication. Toute modification rétroactive des règles de calcul doit être décidée explicitement.
