// The figures of ten pros in Ranked Doubles, read by hand on RL Tracker on 27 November 2026, and kept as they were:
// a reference to measure the club against, not a ranking to follow. Public figures of public players, which
// AGENTS.md allows here as it allows Zen's pseudo.

/** A pro's averages in Ranked Doubles, per match. */
export interface Pro {
  name: string;
  goals: number;
  shots: number;
  assists: number;
  saves: number;
  /** In share of the matches, from 0 to 100. */
  mvpRate: number;
  goalsPerSave: number;
  assistsPerGoal: number;
}

/** When the figures were read: they never change after. */
export const prosReadOn = '2026-11-27';

export const pros: readonly Pro[] = [
  pro('Zen', [1.58, 4.59, 0.75, 2.13, 0.37], [0.74, 0.47]),
  pro('Atow', [1.75, 5.44, 0.91, 2.68, 0.37], [0.65, 0.52]),
  pro('Vatira', [1.62, 4.87, 0.82, 2.29, 0.36], [0.7, 0.5]),
  pro('Fairy Peak!', [1.43, 4.15, 0.79, 2.17, 0.26], [0.66, 0.56]),
  pro('Mawkzy', [1.65, 4.03, 0.63, 2.07, 0.37], [0.8, 0.38]),
  pro('Reyyynn', [1.42, 4.0, 0.72, 2.61, 0.29], [0.54, 0.51]),
  pro('ApparentlyJack', [1.35, 3.86, 0.7, 2.07, 0.27], [0.65, 0.52]),
  pro('M0nkey M00n', [1.11, 3.44, 0.55, 1.92, 0.25], [0.58, 0.5]),
  pro('Nass', [1.63, 4.48, 0.72, 2.28, 0.37], [0.72, 0.44]),
  pro('Dralii', [1.59, 4.53, 0.76, 2.61, 0.44], [0.61, 0.48]),
];

function pro(
  name: string,
  [goals, shots, assists, saves, mvps]: [number, number, number, number, number],
  [goalsPerSave, assistsPerGoal]: [number, number],
): Pro {
  return { name, goals, shots, assists, saves, mvpRate: mvps * 100, goalsPerSave, assistsPerGoal };
}

/** The pro every comparison starts from: the best player there is, who already crowns the ranks' ladder. */
export const firstPro = 'Zen';

/** Whom a member measures against: a pro by name, or all of them on average, under this name. */
export const averageOfPros = 'moyenne';
export const comparedPros: readonly string[] = [averageOfPros, ...pros.map((one) => one.name)];

/** Whom the member measures against: their choice, saved on their profile, or Zen's until they make one. */
export const comparedPro = (choice: string | null | undefined): string =>
  choice && comparedPros.includes(choice) ? choice : firstPro;

/** The figure the member measures against: the pro's own, or the pros' average. */
export function comparedFigure(target: string, figure: (pro: Pro) => number): number {
  const chosen = pros.find((one) => one.name === target);
  return chosen ? figure(chosen) : proAverage(figure);
}

/** The pros' average of a figure, as if it were one more pro. */
export const proAverage = (figure: (pro: Pro) => number) =>
  pros.reduce((sum, one) => sum + figure(one), 0) / pros.length;

/** The pro whose figure is the closest to a value; the first of them on a tie. */
export function closestPro(value: number, figure: (pro: Pro) => number): Pro {
  return pros.reduce((best, one) => (Math.abs(figure(one) - value) < Math.abs(figure(best) - value) ? one : best));
}

/**
 * The pro who plays most like a player: the closest on both axes of style, goals per save and assists per goal. Each
 * gap is a ratio, so that twice and half as much sit as far. Null without both ratios.
 */
export function twinPro(goalsPerSave: number | null, assistsPerGoal: number | null): Pro | null {
  if (!goalsPerSave || !assistsPerGoal) return null;
  const gap = (one: Pro) =>
    Math.log(goalsPerSave / one.goalsPerSave) ** 2 + Math.log(assistsPerGoal / one.assistsPerGoal) ** 2;
  return pros.reduce((best, one) => (gap(one) < gap(best) ? one : best));
}
