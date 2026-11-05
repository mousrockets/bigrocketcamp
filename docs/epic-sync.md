# Historique communautaire Epic

Le serveur conserve les observations de chaque source, identifiées par match et identifiant de plateforme. Il réconcilie leur union sans supprimer les matchs absents de la fenêtre Epic. Un relevé Epic final est prioritaire ; les statistiques viennent intégralement de ce relevé, jamais de maxima indépendants. Les résultats PC contradictoires sans confirmation Epic et les identités ambiguës sont visibles à vérifier et exclus de la dette. Le passage test vers match reste compatible. Un classement au minimum exige un tableau complet et cohérent d’une même source.

## Connexion

Ouvrir `/connexions` avec sa connexion ChatGPT habituelle. Autoriser le compte secondaire qui ne sert jamais à jouer, puis les comptes joueurs, sous le même membre de RL-Pompes. Chaque compte Epic doit être distinct. La liaison n’ouvre aucune session de jeu. Le propriétaire d’une liaison peut la renouveler ou la retirer ; retirer la liaison conserve les observations historiques. Un compte déjà associé ne peut pas être remplacé par un autre sans retrait préalable.

L’autorisation device Epic demande seulement `basic_profile`. Les autorisations et codes device sont chiffrés AES-GCM avec contexte propriétaire/compte ; la clé de 32 octets, encodée base64, est un secret d’exécution Sites `EPIC_VAULT_KEY`. Ne pas changer la clé en place : les autorisations existantes deviendraient illisibles. Aucun jeton ni code device dans le navigateur, les journaux, les tâches ou Git. Seuls le code utilisateur et le lien Epic officiel sont affichés. `INGEST_KEY` reste indépendant pour l’ancien collecteur.

## Lecture prudente

`sync_epic_histories` utilise le compte secondaire pour demander la présence du joueur, renouvelle son jeton puis vérifie une deuxième fois sa présence immédiatement avant l’authentification de jeu. Seul `Offline` explicite du bon identifiant autorise la lecture. Compte absent, présence masquée/inconnue, Online, Away ou erreur bloquent la lecture. Une relation d’amitié Epic peut être nécessaire pour rendre la présence accessible. Aucun contournement automatique ni login sans vérification. Le compte secondaire doit rester inutilisé pour jouer.

Une course reste possible si le joueur lance le jeu juste après la vérification : cette méthode communautaire n’offre pas de garantie officielle de non-interférence. Les verrous D1 empêchent les lectures simultanées de cette application. `LoginBanned` impose dix minutes d’attente persistante ; les autres erreurs ne provoquent pas de boucle de reconnexion. Chaque session est fermée après lecture, y compris en cas d’erreur.

## Lecture automatique

Le secret d’exécution Sites `EPIC_COLLECTION_PAUSED=true` bloque toutes les connexions de collecte, y compris les déclenchements manuels et MCP, avant toute utilisation des autorisations. `get_sync_status` et l’API d’état indiquent la pause. Elle conserve les autorisations chiffrées et les données reçues. Une pause de diagnostic ne doit pas être levée automatiquement ; la tâche horaire doit également rester désactivée jusqu’à décision explicite du propriétaire.

Le tableau de l’équipe est le premier contenu sous l’en-tête. L’affichage relit les données reçues toutes les 3 secondes, sans chevaucher les lectures périodiques lentes. Une mutation de l’utilisateur peut toujours forcer une lecture plus récente ; une ancienne réponse ne la remplace pas.

Tant que le tableau est visible par un membre connecté, il demande une lecture (`action: 'auto'`) chaque minute. Le serveur l’espace d’au moins une minute de façon atomique pour l’ensemble des visiteurs et utilise les liaisons du propriétaire du compte secondaire, avec les mêmes vérifications de présence. Le rang 2v2 est actualisé à chaque passage. Un joueur hors ligne déjà lu récemment n’est pas reconnecté inutilement, mais son historique est relu au plus tard après 5 minutes : une courte session peut avoir échappé aux contrôles de présence. Après une session en ligne observée, ses matchs arrivent au premier passage où il est de nouveau hors ligne.

Les lectures et demandes automatiques sont suspendues lorsque l’onglet est caché et reprennent dès son retour. Le tableau affiche la date de réception Epic réelle, sans la confondre avec l’actualisation de l’écran. Pendant une partie, seule l’ancienne collecte PC peut fournir des résultats en direct ; la méthode Epic nécessite toujours la fermeture du jeu. La tâche horaire reste le filet de sécurité quand aucune page n’est ouverte.

Epic renvoie au plus 20 matchs récents, sans pagination vérifiée. Une première lecture ne garantit jamais toute une journée. Une fenêtre pleine sans recouvrement avec la précédente est signalée comme lacune, durablement ; un petit relevé ultérieur ne suffit pas à la déclarer résolue. Les entrées incomplètes, sans résultat, sans propriétaire identifié ou issues d’une playlist non reconnue sont ignorées et signalées. Les anciennes données restent disponibles. Playlists reconnues : 1, 2, 3, 4, 10, 11, 13, 27, 28, 29, 30, 34.

## Service cloud

Le tableau affiche uniquement le classement **2v2 classé** (playlist 11), avec rang, division, MMR et date du dernier relevé. `Skills/GetPlayerSkill v1` est demandé depuis la session du compte secondaire, sans connecter le joueur ; cette lecture publique peut fonctionner pendant que le joueur est en ligne. Un compte lié fournit l’identité de référence ; sinon un identifiant unique déjà observé dans les matchs du groupe suffit. Une identité ambiguë reste à vérifier.

Le MMR affiché est `round(Mu * 20 + 100)`, conversion de l’échelle TrueSkill documentée dans rlru `MatchSkills`. Le champ PsyNet nommé `MMR` est aussi sur l’échelle interne et ne doit pas être affiché directement comme un nombre de points de jeu. Le rang provient de `Tier`, pas d’un seuil de MMR supposé ; la division PsyNet 0 à 3 devient I à IV. Le rang Légende supersonique n’affiche pas de division. Les matchs de placement restent indiqués comme tels. Une lecture manquante n’est jamais présentée comme un MMR nul : le dernier relevé valide est conservé avec sa date et son état d’actualisation. Aucun historique d’exercices ou calcul de dette ne dépend du classement.

Le Site MCP expose `get_sync_status`, `sync_epic_histories` et `get_daily_recap`. L’accès Sites et l’identité ChatGPT sont obligatoires pour les appels ; la découverte n’expose aucune donnée. La synchronisation manuelle et MCP n’utilise que les connexions appartenant à l’appelant et son compte secondaire ; la lecture automatique utilise celles du propriétaire du compte secondaire. Les publications préservent l’audience privée partagée.

Vérifier le plugin du Site, les deux autorisations et une lecture sûre avant d’activer la tâche horaire décrite dans `.openai/tasks/epic-sync.md`. Ne jamais annoncer une collecte autonome opérationnelle sur la seule base de la publication. Le récap quotidien à 8 h Europe/Paris reste distinct et porte sur la veille. Les exécutions ordinaires ne redéploient pas le Site.

Protocole communautaire adapté de LEX0RE/rockpload, révision `3b9057cd762fdef0a737b25ed13a1074f491ee2e` (protocole dank/rlapi), et de LEX0RE/rlru, révision `2f9dde21c47f02dd9a9c2b0f9301bc0abf0d5597`. La version de jeu, le client OAuth, sa valeur publique de client secret et la clé de signature de protocole sont des métadonnées publiques du client communautaire ; aucun de ces littéraux n’est une autorisation personnelle. Une mise à jour du jeu peut nécessiter une mise à jour de ces métadonnées. Les tests ne contiennent que des données synthétiques.
