# Synchronisation cloud Les Trois Mousrockets

Cette tâche est à activer seulement après vérification du plugin du Site, des autorisations et d’une lecture hors ligne réelle. Cadence retenue : une fois par heure, Europe/Paris. Ne pas créer de doublon et préserver la tâche de récap quotidien à 8 h.

1. Utiliser les outils du plugin du Site Les Trois Mousrockets, anciennement RL-Pompes, lié au projet `REDACTED_PROJECT_ID`. Lire `get_sync_status` pour vérifier les connexions. Une tâche cloud doit pouvoir accéder à ce plugin avec l’identité du propriétaire ; le simple accès HTTP de service n’apporte pas cette identité.
2. Appeler une seule fois `sync_epic_histories`. L’outil vérifie lui-même la présence via le compte secondaire, bloque les comptes en ligne ou inconnus et applique les verrous et délais Epic. Ne jamais remplacer cette vérification par un login direct ou une commande locale. Ne pas lancer de flux d’autorisation en tâche de fond.
3. Relire `get_sync_status` et rapporter fidèlement les lectures réussies, comptes en attente, autorisations à renouveler et couverture partielle. Une fenêtre récente n’établit pas une journée complète. Si le plugin ou l’accès manque, signaler le blocage sans utiliser d’identifiants stockés ailleurs.
4. Aucune notification pour une lecture ordinaire ou un joueur en ligne. Une intervention nécessaire (autorisation expirée, plugin déconnecté, rupture de collecte persistante) peut être signalée une fois de façon concise en français, avec https://example.chatgpt.site/connexions. Le récap quotidien conserve son propre horaire.

Ne jamais lire ou exposer les colonnes chiffrées des tables `epic_accounts` et `epic_grants`, changer les règles de pompes, publier du code, ni redéployer pendant l’exécution.
