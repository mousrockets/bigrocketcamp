# Classement MMR mensuel et boissons

Seul le MMR **2v2** compte. Le mois civil va du premier jour à 00 h au premier jour du mois suivant à 00 h, en **Europe/Paris**, changement d’heure compris. La compétition commence en novembre 2026 ; aucun mois antérieur ne produit de dette.

La connexion Epic reste retirée. Les MMR historiques figés ne décident jamais d’un résultat mensuel. Chaque joueur, depuis le compte ChatGPT propriétaire de son identité de jeu, déclare son MMR actuel dans le site. Le rang et la division sont facultatifs et ne sont pas devinés à partir du MMR.

Pour la clôture, chacun doit confirmer sa valeur **le dernier jour du mois, après ses dernières parties**. La dernière déclaration reçue par le serveur avant minuit est retenue. Une saisie tardive appartient au mois suivant ; la date du navigateur ne permet pas de revenir en arrière. Si un seul des trois relevés du dernier jour manque, le bilan est archivé comme incomplet et aucune dette automatique n’est créée. Un MMR nul est une valeur valide.

Avec trois valeurs de fin de mois :

- un dernier unique doit **une boisson à chacun des deux autres joueurs** (deux boissons, soft ou alcool au choix) ;
- plusieurs joueurs ex æquo au minimum : **aucune dette pour le mois**.

Les résultats sont figés après une marge de cinq minutes, permettant aux écritures déjà reçues de se terminer. L’opération de clôture est idempotente et transactionnelle : deux déclenchements ne doublent ni bilan ni boissons. Les nouvelles déclarations ne modifient pas les mois archivés. L’interface rattrape les mois terminés à son ouverture et pendant qu’elle reste visible. Une tâche Sites distincte doit appeler `close_monthly_mmr` le premier du mois à 00 h 05, heure de Paris, puis lire `get_monthly_mmr` ; son activation doit être vérifiée après publication.

Dans l’historique, le payeur ou le destinataire peut marquer une boisson offerte. Seul l’auteur de cette confirmation peut l’annuler pendant 24 h. Un envoi répété conserve la première confirmation. Les boissons ne modifient jamais la dette de pompes ou l’historique des exercices.

Les déclarations utilisent un identifiant conservé dans le navigateur jusqu’à confirmation : un réessai après une coupure ne crée pas un second relevé et ne rétablit pas une ancienne valeur, même si deux relevés ont le même horodatage. Aucun jeton Epic, mot de passe ou nouvel accès aux comptes n’est nécessaire.
