// What each line of the Stats table counts, shown on a hover or a tap of its name. Only what the code or the game
// says for sure: a line whose meaning the game does not tell (« Contacts carrosserie », some stat feed events) has
// none, rather than a guess.

/** By the line's label. */
export const statHints: Readonly<Record<string, string>> = {
  Matchs: 'Les matchs classés et de tournoi joués dans les saisons, modes et comptes choisis.',
  Victoires: 'La part des matchs gagnés.',
  MVP: 'La part des matchs où tu as été MVP : celui que le jeu a nommé, sinon le meilleur score de l’équipe gagnante.',
  'Win streak max': 'La plus longue série de victoires d’affilée.',
  'Lose streak max': 'La plus longue série de défaites d’affilée.',
  'Tournois gagnés': 'Les tournois remportés, déclarés dans Matchs.',
  Score: 'Le score du tableau du jeu.',
  Buts: 'Les buts marqués dans le but adverse.',
  Assists: 'Les passes décisives, comptées par le jeu.',
  Tirs: 'Les tirs cadrés comptés par le jeu : ceux qui seraient entrés sans arrêt.',
  'Précision des tirs': 'La part de tes tirs qui finissent en but, sur les matchs où le jeu a compté les tirs.',
  Poteaux: 'Les tirs qui touchent un poteau ou la barre du but adverse, un par tir.',
  Arrêts: 'Les arrêts comptés par le jeu.',
  'Buts encaissés': 'Les buts marqués par l’équipe adverse.',
  'Clean sheets': 'La part des matchs sans encaisser de but.',
  'Buts contre son camp': 'Les buts que tu as marqués dans le but de ton équipe.',
  'Touches de balle': 'Les fois où tu as touché la balle, selon le jeu.',
  'Premiers au coup d’envoi':
    'Les coups d’envoi où tu touches la balle le premier. À deux en même temps, chacun compte.',
  Démos: 'Les voitures adverses que tu as détruites.',
  Possession: 'La part du temps de jeu où ton équipe a touché la balle en dernier.',
  'Touches aériennes': 'Tes touches avec la balle à plus de 3 mètres de haut.',
  'Touches en défense': 'Tes touches dans le tiers du terrain de ton but.',
  'Touches en attaque': 'Tes touches dans le tiers du terrain du but adverse.',
  'Pastilles ramassées':
    'Les pastilles de boost ramassées. Le jeu ne les envoie pas : on les compte aux hausses du boost, relevé 10 fois par seconde. Deux pastilles dans le même dixième de seconde n’en font qu’une.',
  'Grosses pastilles': 'Les pastilles qui donnent plus de 12 de boost : les grosses en donnent 100, les petites 12.',
  'Boost ramassé': 'Le boost gagné aux pastilles, sur 100 pour un plein.',
  'Boost moyen': 'Ton boost moyen pendant le jeu, de 0 à 100.',
  'À 0 de boost': 'La part du temps de jeu avec le réservoir vide.',
  'À 100 de boost': 'La part du temps de jeu avec le réservoir plein.',
  'En train de booster': 'La part du temps de jeu où tu boostes.',
  Supersonique: 'La part du temps de jeu à vitesse supersonique, celle qui démolit.',
  'Au sol': 'La part du temps de jeu les roues au sol.',
  'En l’air': 'La part du temps de jeu ni au sol, ni au mur.',
  'Au mur': 'La part du temps de jeu sur un mur.',
  Dérapages: 'Les dérapages commencés, au frein à main.',
  'Prolongations gagnées': 'La part des prolongations gagnées.',
  'FF reçus': 'La part des matchs où l’équipe adverse a abandonné.',
  'FF donnés': 'La part des matchs où ton équipe a abandonné.',
  'Matchs quittés': 'La part des matchs que tu as quittés avant la fin.',
  'Matchs après minuit': 'Les matchs finis entre minuit et 5 h, heure de Paris.',
  'Frappe la plus puissante': 'La balle la plus rapide après une de tes touches.',
  'But le plus rapide': 'La vitesse de la balle de ton but le plus rapide.',
  'But le plus lointain':
    'Pour ton but le plus lointain, la distance au sol entre ta dernière touche et la ligne de but.',
  'But le plus rapide après le coup d’envoi': 'Le moins de temps entre un coup d’envoi et un de tes buts.',
};

/** By the game's name of a stat feed event, for the lines of « Le fil du jeu ». */
export const eventHints: Readonly<Record<string, string>> = {
  AerialGoal: 'Un but marqué d’une touche en l’air.',
  BackwardsGoal: 'Un but marqué en roulant en marche arrière.',
  BicycleGoal: 'Un but marqué d’un retourné.',
  BicycleHit: 'Une touche en retourné : la voiture bascule en arrière pour frapper la balle.',
  Demolish: 'Une voiture détruite en la percutant à vitesse supersonique.',
  EpicSave: 'Un arrêt de justesse, la balle tout près de la ligne de but.',
  FirstTouch: 'Le premier toucher d’un coup d’envoi.',
  FlipReset: 'Une touche de la balle avec les quatre roues, en l’air, qui rend le saut.',
  HatTrick: 'Trois buts dans le même match.',
  LongGoal: 'Un but tiré depuis ta moitié de terrain.',
  OvertimeGoal: 'Un but marqué en prolongation.',
  Playmaker: 'Trois assists dans le même match.',
  Savior: 'Trois arrêts dans le même match.',
  TurtleGoal: 'Un but marqué avec la voiture sur le toit.',
};

/** By the game's name of a stat feed event the player took, for the lines « Subi : … ». */
export const sufferedHints: Readonly<Record<string, string>> = {
  Demolish: 'Les fois où un adversaire t’a démoli.',
};
