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
- Le récap quotidien affiche, par joueur, les parties, victoires, défaites, pompes générées et le nombre de fois où il a le moins de points de tout le match, adversaires compris. Il utilise la date du match en heure de Paris, pas la date de réception. Le bouton « Hier » permet de consulter la journée terminée ; les données reçues tardivement complètent le bon jour.
- Le classement aux points exige un tableau complet confirmé, adversaires compris ; les données anciennes ou incomplètes restent non classables. Les égalités sont indiquées. Le supplément éventuel se configure dans `lib/match-rules.mjs` ; il reste désactivé tant que son activation et le traitement des égalités ne sont pas confirmés. Un gagnant ne reçoit jamais de supplément et un adversaire au score inférieur empêche nos joueurs de prendre le supplément. Le récap ne prétend pas que tous les matchs d’une journée ont déjà été synchronisés.

## Architecture

Vinext / Cloudflare Workers, stockage D1, authentification Sites. Le collecteur Windows conserve les captures brutes et son historique local puis envoie les résultats par HTTPS toutes les 30 secondes. La clé composée MatchGuid + PrimaryId évite les doublons entre PC. Les séries sont dédupliquées par UUID. Les clés du collecteur installé sont protégées par Windows DPAPI et ne sont pas dans le dépôt.

La console PS5 ne peut pas envoyer directement à ce collecteur. Les données de Kevin pendant une partie avec un PC restent à valider en jeu. L'application ne prétend pas récupérer ses parties PS5 en solo.

## Tableaux complets et récap différé

L’API `/api/ingest` accepte désormais aussi les joueurs hors groupe dans `results`, avec les mêmes champs. Un collecteur qui dispose du tableau final complet peut ajouter `matches: [{"MatchGuid":"identifiant-du-match","PlayerCount":4}]` (effectif réel de tous les participants de ce match, adversaires compris). Le serveur vérifie le nombre d’identifiants distincts, la présence des deux équipes, le jour et le vainqueur communs avant d’enregistrer cette confirmation dans `match_rosters`. Un ancien collecteur sans `matches` reste compatible mais ne fournit pas de classement complet. Ne jamais déclarer complet un sous-ensemble contenant seulement les joueurs du groupe.

Le récap est recalculé à partir des données persistées lorsque l’application est ouverte. Les instructions de notification quotidienne en lecture seule sont dans `.openai/tasks/daily-recap.md`. L’horaire demandé est 16 h, Europe/Paris, pour le bilan de la veille. La création effective de la tâche doit être vérifiée avec Sites ; le fichier d’instructions seul ne programme aucun envoi.

## Vérification

`npm test` vérifie les calculs, dates, entrées invalides, migrations SQLite et les routes de déclaration/lecture (identité et binding D1 simulés). La matrice de régression couvre les trois exercices, les dettes nulles ou fractionnaires, les séries inférieures, égales ou supérieures à la dette et les limites de quantité. Les tests du composant React exécutent le formulaire réel : double validation immédiate, reprise après coupure/rechargement, stockage local indisponible et réponses d’actualisation obsolètes. Le rendu de test React ne remplace pas un essai dans un navigateur réel. `node node_modules/typescript/bin/tsc --noEmit` vérifie les types. Les migrations SQL et leur journal sont versionnés ; ne pas modifier une migration déjà publiée.

Les bases locale et hébergée sont séparées. Ne jamais importer les tests locaux dans la base réelle. L'API d'ingestion exige INGEST_KEY et le collecteur doit également franchir l'accès privé Sites. Les routes de lecture et de déclaration exigent une identité connectée. Tous les membres invités sont considérés comme une équipe de confiance : ils peuvent déclarer une série pour chaque joueur.

## Évolution

Conserver l'identifiant `.openai/hosting.json`, le dépôt privé, les données D1 et ajouter des migrations pour les nouvelles fonctionnalités. Le code et le design peuvent évoluer après publication. Toute modification rétroactive des règles de calcul doit être décidée explicitement.
# Historique Epic et rapprochement des sources

La page `/connexions` permet d’autoriser un compte Epic secondaire de vérification, puis les comptes joueurs. Les relevés Epic et PC sont rapprochés sans doublons et sans supprimer les anciens matchs. Les résultats incertains sont signalés et exclus de la dette. Le détail de la connexion chiffrée, des vérifications de présence, des limites de couverture et de la mise en service figure dans [docs/epic-sync.md](docs/epic-sync.md).
