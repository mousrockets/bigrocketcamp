# Classement MMR mensuel et boissons

Seul le MMR **2v2** compte. Le mois civil va du premier jour à 00 h au premier jour du mois suivant à 00 h, en **Europe/Paris**, changement d’heure compris. La compétition commence en novembre 2026 ; aucun mois antérieur ne produit de dette.

La connexion Epic reste retirée. Les MMR historiques figés ne décident jamais d’un résultat mensuel. Le site relève le MMR 2v2 sur trois **profils publics RLStats.net**, via leurs URLs de pseudonymes et plateformes explicitement configurées dans `lib/public-ranks.mjs`. Il ne transmet aucun identifiant Epic interne enregistré, cookie, jeton ni mot de passe. La page publique indique le rang, la division et l’heure réelle de mise à jour. La saisie manuelle de son propre MMR reste possible depuis son identité ChatGPT associée ; rang et division sont alors facultatifs.

Une lecture publique est prévue **le dernier jour du mois à 23 h 59 Europe/Paris**. Une observation publique doit dater des quinze dernières minutes du mois, et arriver au plus tard à la fin de la marge de cinq minutes. La date de la page décide du mois, pas l’heure de réception : un MMR mesuré après minuit ne permet pas de reconstituer le mois précédent. La dernière observation valide est retenue. Il s’agit du dernier relevé public reçu, dépendant du délai de mise à jour de RLStats, et non d’une preuve du résultat exact de chaque partie terminée à minuit.

En recours manuel, chacun peut confirmer sa valeur **le dernier jour du mois, après ses dernières parties**. Une saisie manuelle tardive appartient au mois suivant ; la date du navigateur ne permet pas de revenir en arrière. Si un seul des trois relevés nécessaires manque ou est trop ancien, le bilan est archivé comme incomplet et aucune dette automatique n’est créée. Un MMR nul explicitement fourni est une valeur valide ; une absence ne devient jamais zéro.

Avec trois valeurs de fin de mois :

- un dernier unique doit **une boisson à chacun des deux autres joueurs** (deux boissons, soft ou alcool au choix) ;
- plusieurs joueurs ex æquo au minimum : **aucune dette pour le mois**.

Les résultats sont figés après une marge de cinq minutes, permettant aux écritures déjà reçues de se terminer. L’opération de clôture est idempotente et transactionnelle : deux déclenchements ne doublent ni bilan ni boissons. Les nouvelles observations ne modifient pas les mois archivés. L’interface rattrape les mois terminés à son ouverture et pendant qu’elle reste visible, sans aucune lecture externe sur son minuteur. Une tâche Sites distincte appelle `close_monthly_mmr` le premier du mois à 00 h 05, heure de Paris, puis lit `get_monthly_mmr`. Cet outil fait aussi le relevé public ; les tâches de capture en fin de mois peuvent donc l’appeler sans fermer le mois en cours.

Les lectures publiques respectent une limite globale de trois minutes entre lots, y compris en cas de panne ou d’appels simultanés. Une réponse 403/429, un challenge, une redirection, un profil différent, une saison ambiguë, une date absente ou un tableau incomplet arrête cette lecture sans contournement. Les anciennes valeurs restent affichées avec leur date. Aucune requête n’est envoyée aux API privées de Rocket League ou Tracker Network. Un changement de pseudo public nécessite de mettre à jour le profil configuré ; l’historique des matchs reste attribué exclusivement par ses identifiants stables, indépendamment de cette source de classement.

Dans l’historique, le payeur ou le destinataire peut marquer une boisson offerte. Seul l’auteur de cette confirmation peut l’annuler pendant 24 h. Un envoi répété conserve la première confirmation. Les boissons ne modifient jamais la dette de pompes ou l’historique des exercices.

Les déclarations utilisent un identifiant conservé dans le navigateur jusqu’à confirmation : un réessai après une coupure ne crée pas un second relevé et ne rétablit pas une ancienne valeur, même si deux relevés ont le même horodatage. Aucun jeton Epic, mot de passe ou nouvel accès aux comptes n’est nécessaire.
