import { Hono } from 'hono';
import { readClubName, readClubPlayers } from '../../lib/club';
import {
  imageTypeOf,
  type LogoType,
  largestLogo,
  logoTypes,
  logoUrl,
  readLogo,
  readLogoVersion,
  removeLogo,
  saveLogo,
} from '../../lib/club-logo';
import { changeLastPlaceRule, readChallengeRules } from '../../lib/club-rules';
import {
  type ChallengeRules,
  type Club,
  type ClubIdentity,
  type ClubLogo,
  type ClubNameSaved,
  clubName,
  invalidClubName,
  invalidRuleChange,
  ruleChange,
} from '../../lib/contract';
import type { Database } from '../../lib/db';
import { readOwnProfile, saveClubName } from '../../lib/members';
import { type AppEnv, requireAdmin, requireMember, sameOriginOnly } from '../auth';
import { noStore } from '../respond';
import { jsonBody } from '../validate';

const logoOf = async (db: Database) => {
  const version = await readLogoVersion(db);
  return version ? logoUrl(version) : null;
};

/** Before signing in, a visitor only learns the club's name and logo. */
export const clubNameRoutes = new Hono<AppEnv>().get('/', async (c) => {
  const [name, logo] = await Promise.all([readClubName(c.env.DB), logoOf(c.env.DB)]);
  return c.json({ name, logo } satisfies ClubIdentity, 200, noStore);
});

/** The club as a signed-in member sees it: its name, logo, players, challenge rules and their own profile. */
export const clubRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const db = c.env.DB;
    const [name, logo, players, rules, me] = await Promise.all([
      readClubName(db),
      logoOf(db),
      readClubPlayers(db),
      readChallengeRules(db),
      readOwnProfile(db, c.var.member.id),
    ]);
    return c.json({ name, logo, players, rules, me } satisfies Club, 200, noStore);
  })
  .put('/', requireAdmin, sameOriginOnly, ...jsonBody(clubName, { invalid: invalidClubName }), async (c) =>
    c.json({ name: await saveClubName(c.env.DB, c.req.valid('json').name) } satisfies ClubNameSaved, 200, noStore),
  );

/** Changing a challenge rule: it applies from tomorrow, the matches already played keep theirs. */
export const clubRuleRoutes = new Hono<AppEnv>().put(
  '/',
  requireAdmin,
  sameOriginOnly,
  ...jsonBody(ruleChange, { invalid: invalidRuleChange }),
  async (c) => {
    const rules: ChallengeRules = await changeLastPlaceRule(c.env.DB, c.req.valid('json').lastPlace.enabled);
    return c.json(rules, 200, noStore);
  },
);

const refuse = (message: string, status: 400 | 411 | 413 | 415) => ({ message, status });

/** The logo is public, like the name; only an administrator changes it. */
export const clubLogoRoutes = new Hono<AppEnv>()
  .get('/', async (c) => {
    const logo = await readLogo(c.env.DB);
    if (!logo) return c.json({ error: 'Le club n’a pas de logo.' }, 404, noStore);
    const headers = {
      'Content-Type': logo.contentType,
      ETag: `"${logo.version}"`,
      'X-Content-Type-Options': 'nosniff',
      // The address names the image: kept for good when it asks for this one, checked again otherwise.
      'Cache-Control': c.req.query('v') === logo.version ? 'public, max-age=31536000, immutable' : 'no-cache',
    };
    if (c.req.header('If-None-Match') === headers.ETag) return c.body(null, 304, headers);
    return c.body(logo.image, 200, headers);
  })
  .put('/', requireMember, requireAdmin, sameOriginOnly, async (c) => {
    const claimed = c.req.header('Content-Type')?.split(';')[0]?.trim().toLowerCase();
    const length = Number(c.req.header('Content-Length'));
    const problem = !logoTypes.includes(claimed as LogoType)
      ? refuse('Logo : une image WebP, JPEG ou PNG.', 415)
      : !Number.isSafeInteger(length) || length <= 0
        ? refuse('Taille du logo inconnue.', 411)
        : length > largestLogo
          ? refuse('Logo trop lourd : 100 Ko au plus.', 413)
          : null;
    if (problem) return c.json({ error: problem.message }, problem.status, noStore);
    const image = new Uint8Array(await c.req.arrayBuffer());
    if (image.byteLength > largestLogo) return c.json({ error: 'Logo trop lourd : 100 Ko au plus.' }, 413, noStore);
    if (imageTypeOf(image) !== claimed)
      return c.json({ error: 'Ce fichier n’est pas l’image annoncée.' }, 415, noStore);
    const version = await saveLogo(c.env.DB, image, claimed as LogoType);
    return c.json({ logo: logoUrl(version) } satisfies ClubLogo, 200, noStore);
  })
  .delete('/', requireMember, requireAdmin, sameOriginOnly, async (c) => {
    await removeLogo(c.env.DB);
    return c.json({ logo: null } satisfies ClubLogo, 200, noStore);
  });
