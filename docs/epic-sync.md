# Historique communautaire Epic

Le serveur conserve les observations de chaque source, identifiées par match et identifiant de plateforme. Il réconcilie leur union sans supprimer les matchs absents de la fenêtre Epic. Un relevé Epic final est prioritaire ; les statistiques viennent intégralement de ce relevé, jamais de maxima indépendants. Les résultats PC contradictoires sans confirmation Epic et les identités ambiguës sont visibles à vérifier et exclus de la dette. Le passage test vers match reste compatible. Un classement au minimum exige un tableau complet et cohérent d’une même source.

## Connexion

Ouvrir `/connexions` avec sa connexion ChatGPT habituelle. Autoriser le compte secondaire qui ne sert jamais à jouer, puis les comptes joueurs, sous le même membre de RL-Pompes. Chaque compte Epic doit être distinct. La liaison n’ouvre aucune session de jeu. Le propriétaire d’une liaison peut la renouveler ou la retirer ; retirer la liaison conserve les observations historiques. Un compte déjà associé ne peut pas être remplacé par un autre sans retrait préalable.

L’autorisation device Epic demande seulement `basic_profile`. Les autorisations et codes device sont chiffrés AES-GCM avec contexte propriétaire/compte ; la clé de 32 octets, encodée base64, est un secret d’exécution Sites `EPIC_VAULT_KEY`. Ne pas changer la clé en place : les autorisations existantes deviendraient illisibles. Aucun jeton ni code device dans le navigateur, les journaux, les tâches ou Git. Seuls le code utilisateur et le lien Epic officiel sont affichés. `INGEST_KEY` reste indépendant pour l’ancien collecteur.

## Lecture prudente

`sync_epic_histories` utilise le compte secondaire pour demander la présence du joueur, renouvelle son jeton puis vérifie une deuxième fois sa présence immédiatement avant l’authentification de jeu. Seul `Offline` explicite du bon identifiant autorise la lecture. Compte absent, présence masquée/inconnue, Online, Away ou erreur bloquent la lecture. Une relation d’amitié Epic peut être nécessaire pour rendre la présence accessible. Aucun contournement automatique ni login sans vérification. Le compte secondaire doit rester inutilisé pour jouer.

Une course reste possible si le joueur lance le jeu juste après la vérification : cette méthode communautaire n’offre pas de garantie officielle de non-interférence. Les verrous D1 empêchent les lectures simultanées de cette application. `LoginBanned` impose dix minutes d’attente persistante ; les autres erreurs ne provoquent pas de boucle de reconnexion. Chaque session est fermée après lecture, y compris en cas d’erreur.

Epic renvoie au plus 20 matchs récents, sans pagination vérifiée. Une première lecture ne garantit jamais toute une journée. Une fenêtre pleine sans recouvrement avec la précédente est signalée comme lacune, durablement ; un petit relevé ultérieur ne suffit pas à la déclarer résolue. Les entrées incomplètes, sans résultat, sans propriétaire identifié ou issues d’une playlist non reconnue sont ignorées et signalées. Les anciennes données restent disponibles. Playlists reconnues : 1, 2, 3, 4, 10, 11, 13, 27, 28, 29, 30, 34.

## Service cloud

Le Site MCP expose `get_sync_status`, `sync_epic_histories` et `get_daily_recap`. L’accès Sites et l’identité ChatGPT sont obligatoires pour les appels ; la découverte n’expose aucune donnée. La synchronisation n’utilise que les connexions appartenant à l’appelant et son compte secondaire. Les publications préservent l’audience privée partagée.

Vérifier le plugin du Site, les deux autorisations et une lecture sûre avant d’activer la tâche horaire décrite dans `.openai/tasks/epic-sync.md`. Ne jamais annoncer une collecte autonome opérationnelle sur la seule base de la publication. Le récap quotidien à 8 h Europe/Paris reste distinct et porte sur la veille. Les exécutions ordinaires ne redéploient pas le Site.

Protocole communautaire adapté de LEX0RE/rockpload, révision `3b9057cd762fdef0a737b25ed13a1074f491ee2e` (protocole dank/rlapi), et de LEX0RE/rlru, révision `2f9dde21c47f02dd9a9c2b0f9301bc0abf0d5597`. La version de jeu, le client OAuth, sa valeur publique de client secret et la clé de signature de protocole sont des métadonnées publiques du client communautaire ; aucun de ces littéraux n’est une autorisation personnelle. Une mise à jour du jeu peut nécessiter une mise à jour de ces métadonnées. Les tests ne contiennent que des données synthétiques.
