# Clôture mensuelle Les Trois Mousrockets

Site lié : Les Trois Mousrockets, https://example.chatgpt.site.
Exécution le premier de chaque mois à 00 h 05, Europe/Paris.

1. Avec les outils du Site lié, appeler `close_monthly_mmr` sans argument. Il clôture les mois terminés selon les bornes Europe/Paris avec les observations déjà importées par la tâche distincte de fin de mois. Il ne consulte aucune source externe et n’ouvre aucune session Epic. L’appel est idempotent et peut être réessayé après une erreur réseau.
2. Lire `get_monthly_mmr` pour vérifier que le dernier mois terminé est archivé et que les boissons correspondent au résultat. Trois MMR récents sont nécessaires : observations publiques des quinze dernières minutes du mois reçues dans la marge, ou confirmations manuelles du dernier jour. Les observations après minuit ne sont jamais antidatées. Dernier unique : une boisson à chacun des deux autres. Ex æquo au minimum ou relevé manquant : aucune dette automatique. Ne pas inventer, compléter ou modifier les MMR et ne pas rouvrir un résultat archivé.
3. Signaler au propriétaire un échec ou les MMR manquants, avec le lien du Site. Aucune sollicitation des autres joueurs, aucun email ni message à un tiers. Ne pas confondre absence de relevé et absence de partie jouée.

Ne jamais lancer de connexion/collecte Epic, demander de jeton, restaurer le coffre, changer les règles, modifier des fichiers ou republier pendant cette tâche. Les données existantes suffisent. Si les outils du Site ne sont pas accessibles, signaler le blocage sans tenter une écriture directe dans les tables. L’interface réalisera aussi un rattrapage à sa prochaine ouverture.
