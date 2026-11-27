# La base locale

`npm run dev` lit la base D1 locale, dans `.wrangler/state` (ignoré par git). Elle contient l'une de ces deux choses :

- **le club fictif** de `scripts/dev-seed.ts`, pour tout le monde ;
- **une copie minimisée de la production**, pour un mainteneur qui a accès au compte Cloudflare de l'instance.

| Commande               | Ce qu'elle fait                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `npm run db:migrate`   | Applique les migrations de la branche à la base locale.                                         |
| `npm run db:seed`      | Ajoute le club fictif (sans rien effacer ni dupliquer).                                         |
| `npm run db:reset`     | Vide la base locale, applique les migrations et ajoute le club fictif.                          |
| `npm run db:pull-prod` | Remplace la base locale par une copie minimisée de la production, puis applique les migrations. |

Les deux dernières remplacent toute la base locale, données ajoutées à la main comprises. Le serveur de dev peut rester lancé : il lit la nouvelle base aussitôt.

## Le club fictif

`npm run db:seed` écrit, pour les trois joueurs fictifs (`dimitri@example.com`, administrateur, `vincent@example.com` et `kevin@example.com`), les deux mois précédents et le mois en cours jusqu'à maintenant :

- environ 500 matchs, comme un collecteur les envoie : 2v2 et 3v3 classés, tournois, FF, prolongations, et quelques soirées d'un ancien collecteur, sans horloge ni playlist. L'app les construit elle-même à la première ouverture du tableau ;
- des séries de pompes, d'abdos et de gainage, avec quelques réactions et sons. Kévin, le moins assidu, traîne en général une dette ; les deux autres sont à jour ;
- les rangs duo et solo de chacun, qui montent et descendent, avec leurs peaks ;
- les mois clos par le code de l'app (`monthlyRanking`), avec les verres dus : tous offerts pour le plus ancien, un seul pour le dernier ;
- des tournois gagnés, déclarés comme dans Matchs.

Ses volumes et ses répartitions (matchs par soirée, heures, écarts de buts, FF, prolongations, scores) suivent ceux de la production, relevés en agrégats ; aucune ligne de la production n'y entre, même pseudonymisée : le dépôt est public. Les adversaires ont des pseudos inventés et des ID en `|seed-…|`.

Chaque jour tire ses données d'une suite aléatoire qui lui est propre, et la simulation part toujours du 1er août 2026 : relancé plus tard, le seed réécrit les mêmes jours à l'identique et n'ajoute que les jours depuis. Les dates suivent le jour du seed : le mois en cours n'est jamais vide.

Pour ajouter un cas, on change `scripts/dev-seed.ts` (un joueur, une règle, une probabilité), on vérifie avec `npx vitest run scripts/dev-seed.test.ts`, puis `npm run db:reset`. Le seed importe le code de l'app (jours de Paris, règles des pompes, clôture des mois) par Vite (`runnerImport`) : il suit ces règles sans les recopier.

Après un `db:reset`, comme après une copie de la production, le navigateur garde l'ancien tableau : se déconnecter avant, ou vider les données du site après.

## Copier la production

### Avant de la lancer

- Seul un mainteneur avec accès au compte Cloudflare peut la lancer : `npx wrangler whoami` doit montrer ce compte, sinon `npx wrangler login`.
- Un agent (Claude, Codex…) ne la lance que si un mainteneur le lui demande, jamais de lui-même : elle lit la production et la bloque le temps de l'export.
- L'export bloque la base de production quelques secondes : à faire en dehors des soirées de jeu.
- Pour ne pas mélanger le tableau gardé par le navigateur avec la nouvelle base, se déconnecter de l'app locale (Réglages) avant l'import.

### Ce qu'elle fait

1. `wrangler d1 export --remote` écrit l'export de la production dans `.wrangler/database-copy/`, ignoré par git et lisible par son seul propriétaire.
2. `scripts/production-copy.ts` en tire le SQL de la copie et supprime l'export aussitôt :
   - les lignes des sessions, des codes de connexion et d'appairage, des collecteurs appairés et des abonnements aux notifications sont retirées : personne ne peut se faire passer pour un membre, et le serveur local ne peut pas envoyer de notification au téléphone d'un membre ;
   - chaque adresse e-mail devient une adresse fictive à `example.com`, tirée du pseudo duo du membre (sinon de son prénom) : `nokouki@example.com`. Les vraies adresses n'atteignent jamais la base locale ;
   - tout le reste est gardé tel quel : pseudos, prénoms, ID de jeu, matchs (noms des adversaires compris), pompes, rangs, dettes, réglages du club.
3. Le même fichier vide la base locale, puis y écrit la copie : si l'import échoue, la base locale reste comme avant.
4. Les migrations de la branche s'appliquent par-dessus, quand la production est en retard sur elle.
5. `.wrangler/database-copy/` est supprimé, même en cas d'échec.

La commande affiche ensuite les adresses des membres, avec leur rôle. On se connecte avec l'une d'elles ; le code s'affiche sur la page de connexion, et dans le terminal de `npm run dev`.

### Après l'import

- Les sessions ne sont pas copiées : l'app locale redemande de se connecter.
- Si l'app montre encore l'ancien tableau, ou un mélange des deux bases, vider les données du site `127.0.0.1:10071` dans le navigateur (outils de développement → Application → Storage → Clear site data). L'app garde le tableau dans IndexedDB (`big-rocket-camp`, `src/web/persistence.ts`), et ne lit ensuite que ce qui a changé depuis sa version.

### Données personnelles

La copie contient des données personnelles réelles : les pseudos, les prénoms, les ID de jeu et l'activité des membres, et les noms des adversaires croisés en match.

- **Finalité** : développer et déboguer l'app sur des données réalistes. Rien d'autre.
- **Où** : seulement dans `.wrangler/state` du Mac d'un mainteneur, disque chiffré (FileVault). Jamais copiée ailleurs.
- **Jamais** dans le code, les tests, les journaux, une issue, une PR ou une discussion, même privée. Les captures d'une PR se prennent sur les joueurs fictifs : `npm run db:reset` d'abord.
- **Durée** : jusqu'au prochain `db:pull-prod` ou `db:reset`. On relance l'un ou l'autre au moins une fois par mois : un membre effacé en production disparaît ainsi de la copie, puisque chaque import remplace toute la base locale.
