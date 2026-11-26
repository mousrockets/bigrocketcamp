// The Golden Rules: SquishyMuffinz's 2v2 advice, gathered from his Road to SSL series and sorted in four tiers, from
// what is never up for debate to what wins games at the top. Each rule says its idea first, then how to apply it.
// In French, the game's own English words stay, between asterisks: the page sets them in italics.

export const rulesLanguages = ['fr', 'en'] as const;
export type RulesLanguage = (typeof rulesLanguages)[number];

/** A rule in one language: the idea to keep in mind, then the detail. */
interface RuleWords {
  gist: string;
  detail: string;
}

export interface GoldenRule {
  number: number;
  name: string;
  words: Record<RulesLanguage, RuleWords>;
}

export interface GoldenTier {
  number: number;
  name: string;
  rules: GoldenRule[];
}

const rule = (number: number, name: string, fr: [string, string], en: [string, string]): GoldenRule => ({
  number,
  name,
  words: { fr: { gist: fr[0], detail: fr[1] }, en: { gist: en[0], detail: en[1] } },
});

/** What the page says around the rules, in each language. */
export const goldenRulesWords: Record<RulesLanguage, { lede: string; source: string }> = {
  fr: {
    lede: 'À relire avant chaque session ranked. Oui, toi aussi.',
    source: 'D’après 29 épisodes de Road to SSL (2024 et 2026) de SquishyMuffinz.',
  },
  en: {
    lede: 'Read them again before every ranked session. Yes, you too.',
    source: 'Drawn from 29 episodes of SquishyMuffinz’s Road to SSL (2024 and 2026).',
  },
};

export const goldenTiers: GoldenTier[] = [
  {
    number: 1,
    name: 'The Non-Negotiable Core',
    rules: [
      rule(
        1,
        'Proximity',
        [
          'Si l’adversaire est plus proche de la balle, tu attends et tu *shadow* ; si c’est toi, tu y vas.',
          'Tu as le feu vert pour *challenge* quand la balle roule seule au sol (plus sur le toit de sa voiture, aucun *flick* possible) ou quand l’adversaire vient de cramer son *flip*.',
        ],
        [
          'If they’re closer to the ball, wait and shadow; if you’re closer, go.',
          'Your green light to challenge is when the ball is rolling loose on the floor (off their car, zero flick threat) or the second their flip is burned.',
        ],
      ),
      rule(
        2,
        'Play Your Role',
        [
          'En 2v2, joue ton rôle : à deux, vous formez une défense sur deux niveaux (*layered defense*).',
          '*First man* : tu mets la pression et tu forces l’adversaire à donner le ballon (plus haut en *rank*, joue directement la balle pour ne pas te faire *fake*). *Second man* : attends que ton *mate* force le jeu pour récupérer une *free ball*, et ne le laisse jamais trop longtemps en 1v2.',
        ],
        [
          'Play your role to build a layered defense.',
          'As first man, force the play (at higher ranks, play the ball to stay unfakeable). As second man, wait for your teammate’s force to collect a free ball, and don’t leave them in a 1v2 for too long.',
        ],
      ),
      rule(
        3,
        'Last Man',
        [
          'En *last man*, ne plonge jamais sur la balle sauf si tu es sûr de gagner le *challenge* : ton job, c’est de gagner du temps jusqu’au retour de ton *mate*.',
          'Garde ton *momentum* quand tu *shadow*, mets des *fake challenges* et des *drive challenges* pour ne pas être trop passif, et bannis pour de bon le *backflip challenge*.',
        ],
        [
          'Never dive as last man back unless you have a clean win—your job is to stall time until your teammate gets back.',
          'Never stop your momentum while shadowing, throw in fake challenges or drive challenges so you aren’t too passive, and never go for a backflip challenge.',
        ],
      ),
      rule(
        4,
        'Back Wall',
        [
          'Dès qu’une action défensive devient compliquée (balle qui flotte, *aerial*, *flip reset*), monte haut sur le *back wall*.',
          'De là, tu couvres 100 % de la cage et tu vois tout le terrain. Seule exception : quand la balle reste collée au sol, en *low 50s*.',
        ],
        [
          'Whenever a defensive play feels awkward (floating ball, aerial, flip reset), drive high up onto the back wall—it’s your absolute best friend.',
          'You cover 100% of the net with full vision of the field. Only exception: when the ball stays super grounded in low 50s.',
        ],
      ),
    ],
  },
  {
    number: 2,
    name: 'Reading the Game & Positioning',
    rules: [
      rule(
        5,
        'Read the Car',
        [
          'Regarde la voiture adverse plutôt que la balle (et sers-toi du *stick* droit pour prendre l’info).',
          'Sa position dit où partira la balle : à droite de la balle, elle part à gauche ; dessous, elle monte. En attaque, attaque dans le dos de sa voiture : c’est son point faible.',
        ],
        [
          'Keep your eyes locked on the opponent’s car rather than the ball (and use your right stick for info).',
          'Their car dictates where the ball goes (right side of the ball → goes left; under it → goes up). On offense, attack the back of their car—that’s their weak spot where they can’t accelerate.',
        ],
      ),
      rule(
        6,
        'Spacing',
        [
          'Ne te retrouve jamais dans la même zone que ton *mate*.',
          'Reste un peu en retrait, vers le centre : c’est là que ressortent presque tous les 50/50. Dans le doute, mieux vaut presque toujours être un peu trop en retrait que trop avancé.',
        ],
        [
          'Never sit in the same pocket of space as your teammate.',
          'Stay slightly behind them toward the center of the field—almost every 50/50 spills out middle. When in doubt, it’s almost always better to be slightly too far back than too pushed up.',
        ],
      ),
      rule(
        7,
        'Best & Worst Case',
        [
          'Place-toi pour couvrir un maximum d’options à la fois.',
          'Le meilleur cas (ton *mate* gagne son *challenge*) comme le pire (il *whiff* ou perd son 50/50).',
        ],
        [
          'Position yourself to cover as many options as possible at once.',
          'Both the best case (your teammate wins the challenge) and the worst case (they whiff or lose the 50/50).',
        ],
      ),
      rule(
        8,
        'Do Nothing',
        [
          'Garde tes quatre roues au sol et arrête de *pre-jump* : en face, ce ne sont pas des pros.',
          'En défense comme en attaque, ta patience pousse l’adversaire à trop réfléchir et à te donner une *free ball*.',
        ],
        [
          'Keep all four wheels on the floor and stop pre-jumping—remember, they’re not pros.',
          'On both defense and offense, sitting patiently forces opponents to overthink and hand you the ball for free.',
        ],
      ),
      rule(
        9,
        'Single-Jump 50s',
        [
          'Ne *flip* pas dans les *challenges*.',
          'Fais un *single jump* en penchant ta voiture sur le côté pour bloquer le centre de la balle : tu retombes aussitôt sur tes quatre roues et tu *recover* le premier.',
        ],
        [
          'Don’t flip into 50/50s.',
          'Tap jump (single jump) and tilt your car sideways to block the center of the ball so you land instantly on four wheels and recover first.',
        ],
      ),
    ],
  },
  {
    number: 3,
    name: 'Control, Economy & Offense',
    rules: [
      rule(
        10,
        'Bounce Dribble',
        [
          'Frappe la balle juste après le rebond, pas pendant (sinon, c’est un *pinch*).',
          'C’est la base de toutes les mécaniques : des *power shots* à plus de 110 km/h, des *air dribbles* peu risqués, ou un *fake* sur le premier rebond.',
        ],
        [
          'Hit the ball a fraction of a second right after it bounces (not as it hits the floor, or you’ll pinch it).',
          'It’s the foundation of every mechanic: 110+ kph power shots, low-risk air dribbles, or faking the first bounce.',
        ],
      ),
      rule(
        11,
        'Control & Follow-Up',
        [
          'Quand tu as le temps, arrête de *boom* la balle (ne *boom* que si tu es *low boost* et sous pression).',
          'Fais des *soft touches* que tu peux suivre toi-même pour rester dangereux, et joue vers ton *corner* quand tu dois gagner du temps : le *corner*, c’est *safe*.',
        ],
        [
          'When you have time, stop booming the ball away (only boom a clear when you’re low boost under heavy pressure).',
          'Take soft touches you can follow up yourself to stay threatening, and play the ball into your corner—the corner is safe when you need to stall.',
        ],
      ),
      rule(
        12,
        'Play the Space',
        [
          'Arrête de ne regarder que la cage.',
          'Active les *big nameplates* (les grands noms au-dessus des voitures, dans les options) pour repérer les espaces vides (murs, *corners*, au-dessus d’eux) : exploiter l’espace finit toujours par ouvrir la cage.',
        ],
        [
          'Stop tunnel-visioning the net.',
          'Turn on big nameplates to scan for empty space (walls, corners, over their heads)—abusing open space naturally opens up free nets.',
        ],
      ),
      rule(
        13,
        'Boost Economy',
        [
          'Ne brûle jamais de *boost* pour aller chercher un gros *boost*, et fais toujours passer la bonne touche de balle avant le *boost*.',
          'Prends les *small pads* pour rester dans le jeu, évite les *flips* inutiles quand tu n’as plus de *boost*, et garde environ 30 de *boost* après un *solo play* pour *recover*.',
        ],
        [
          'Never boost to boost, and always prioritize a good touch over grabbing boost.',
          'Pick up small pads to stay in the play, stop randomly flipping with zero boost (it locks you in the air for 1.5 seconds), and try to keep ~30 boost after a solo play to recover.',
        ],
      ),
      rule(
        14,
        'Soft Cheat',
        [
          'Ne *hard cheat* jamais en *solo queue* (sauf en vocal, quand ton *mate* annonce qu’il tue la balle au *kickoff*).',
          'Fais un *front flip* propre jusqu’au premier *small pad* : tu arrives avec 40 à 50 de *boost*, prêt à couvrir toutes les sorties de *kickoff*.',
        ],
        [
          'Don’t hard cheat in solo queue (unless you’re in comms and your teammate is intentionally killing the ball).',
          'Do one clean front-flip to the first small pad so you arrive with 40–50 boost, ready to react to any kickoff outcome.',
        ],
      ),
    ],
  },
  {
    number: 4,
    name: 'High-Rank & SSL Execution',
    rules: [
      rule(
        15,
        'Boost Starve',
        [
          'Voler le *back boost* adverse vaut souvent mieux qu’un tir difficile.',
          'Deux adversaires *starve*, à zéro *boost*, ne peuvent ni défendre sur le *back wall* ni contre-attaquer.',
        ],
        [
          'Stealing the opponent’s back corner boost is often more game-winning than forcing a low-percentage shot.',
          'If both opponents are starved on zero boost, they can’t contest the back wall or counterattack.',
        ],
      ),
      rule(
        16,
        'Flip = Threat',
        [
          'En attaque, garde ton *flip* le plus longtemps possible : tant que tu l’as, tu menaces un *flip* rapide, un *fake* tardif, un *ground pinch* ou un *musty*.',
          'Prendre un *flip reset* sans même t’en servir suffit souvent à faire *pre-jump* toute la défense.',
        ],
        [
          'On offense, save your flip as long as possible to threaten multiple options at once (early flip, late fake, ground pinch, musty).',
          'A reset fake—getting the reset and not even using it—is often enough to make the whole defense pre-jump.',
        ],
      ),
      rule(
        17,
        'Low-Risk Aerials',
        [
          'Sors tes mécaniques quand elles créent vraiment du danger, et sans abuser de l’*air roll*.',
          'En 2v2, les deux *plays* les plus rentables : l’*air dribble into 50/50* (bloque la balle avec le toit pour *recover* avec du *boost*) et l’*air dribble bump* sur le *last man*. En défense aérienne, fais du *floating* (*shadow* à leur hauteur dans les airs), et cache-toi derrière la balle pour leur couper la vue.',
        ],
        [
          'Use mechanics when they actually create danger (central, threatening spots) and don’t over-air-roll.',
          'The two highest-value plays in 2v2 are the air dribble into a 50/50 (block it with the roof of your car to recover fast with boost) and the air dribble bump on the last man. On aerial defense, float (shadow at their elevation) and hide behind the ball to cut off their vision.',
        ],
      ),
      rule(
        18,
        'Wincon & Lead Management',
        [
          'Quand tu mènes de 2 ou 3 buts, tu n’as plus besoin de marquer : ralentis le jeu, joue dans les *corners* et multiplie les *fakes* face à des adversaires qui vont *full speed*.',
          'Quand tu es mené, ils vont défendre : mets plus de *bumps* et de *demos*.',
        ],
        [
          'When you have a 2 or 3-goal lead, you don’t need to score—slow the game down, play the corners, and abuse fakes against opponents going full speed.',
          'When you’re down, expect them to play defensive and go for more bumps/demos.',
        ],
      ),
      rule(
        19,
        'Body Language & Adapt',
        [
          'Rends tes rotations claires pour ton *mate*, sans qu’elles deviennent trop lisibles pour l’adversaire.',
          'Si ton *mate* est très agressif, adapte-toi en jouant plus en retrait au lieu de *double commit* (sauf pour contrer un *air dribble bump*).',
        ],
        [
          'Make your rotations obvious to your teammate with clear car body language, without making them too easy for opponents to read.',
          'If your teammate is super aggressive, adapt by playing more passive instead of double committing (the one exception: double commit to stop an air dribble bump).',
        ],
      ),
      rule(
        20,
        'Zero Tilt & Queue Dodge',
        [
          'Zéro *flame* dans le *quick chat* : un *mate* qui *tilt* est un *mate* qui décroche.',
          'Si les serveurs laguent, si tu enchaînes deux défaites ou si tu retombes sur le même *lobby* toxique, fais 2 minutes de pause pour *reset* la *queue*.',
        ],
        [
          'Never flame your teammate in quick chat—the second they tilt, they check out mentally.',
          'If servers are lagging, you drop two tough games in a row, or you keep getting the same unfair or toxic lobby, take a 2-minute break to reset your queue.',
        ],
      ),
    ],
  },
];
