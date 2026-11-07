export type NavTarget = '/' | '/matchs' | '/exercices' | '/defi' | '/profil';

/**
 * The tab or side-bar entry a page belongs to, lit while it is open, as in the design: the day's recap and a
 * player's card under Club, the settings and the game identities under Profil. The exercise history has its own
 * entry on a wide screen and lives under Profil on a phone.
 */
export function navSectionOf(pathname: string, wide: boolean): NavTarget | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  const under = (prefix: string) => path === prefix || path.startsWith(`${prefix}/`);
  if (path === '/' || under('/recap') || under('/joueurs')) return '/';
  if (under('/matchs')) return '/matchs';
  if (under('/exercices')) return wide ? '/exercices' : '/profil';
  if (under('/defi')) return '/defi';
  if (under('/profil') || under('/reglages') || under('/connexions') || under('/direct')) return '/profil';
  return null;
}
