import { roster } from './club';
import type { Database, Statement } from './db';
import { type HtmlNode, parseHtml } from './html-tree';
import { projectMmrRankWrite, publicCloseFreshMs } from './mmr-ledger';
import { readPlayerIdentities } from './player-identities';

export interface PublicProfile {
  player: string;
  platform: string;
  handle: string;
  url: string;
}

export interface PublicRank {
  player: string;
  mmr: number;
  tier: number;
  division: number | null;
  source: 'rlstats';
  sourceAt: string;
  sourceUrl: string;
  season: number;
}

export interface PublicMmrError {
  player: string;
  error: string;
}

export interface PublicMmrStatus {
  profiles: PublicProfile[];
  lastAttempt: string | null;
  nextAttempt: string | null;
  status: string;
  updated?: string[];
  errors?: PublicMmrError[];
}

export type PublicFetcher = (url: string, init: RequestInit) => Promise<Response>;

export interface PublicPage {
  player: string;
  html: string;
}

// Each player's public profile is club configuration: VITE_CLUB_PUBLIC_PROFILES lists
// `player:Platform:handle` entries (comma-separated). Without an entry, a player is read as an
// Epic profile named like the player. Entries for players outside the roster are ignored.
function configuredProfiles(): Map<string, { platform: string; handle: string }> {
  const configured: unknown = import.meta.env.VITE_CLUB_PUBLIC_PROFILES;
  const profiles = new Map<string, { platform: string; handle: string }>();
  if (typeof configured !== 'string') return profiles;
  for (const entry of configured.split(',')) {
    if (!entry.trim()) continue;
    const [player = '', platform = '', ...handleParts] = entry.split(':').map((part) => part.trim());
    const handle = handleParts.join(':');
    // A malformed entry would silently read someone else's page: fail at startup instead.
    if (!player || !/^[^\s/]+$/.test(platform) || !/^[^\s/]+$/.test(handle)) {
      throw Error(`Invalid VITE_CLUB_PUBLIC_PROFILES entry: ${entry}`);
    }
    profiles.set(player.toLowerCase(), { platform, handle });
  }
  return profiles;
}

const overrides = configuredProfiles();

// Deliberately fixed PUBLIC profile URLs. No stored Epic ID, login, cookie or
// token is ever sent to this provider. Never infer a player from a match nickname.
export const publicProfiles: PublicProfile[] = roster.map((player) => {
  const { platform, handle } = overrides.get(player) ?? { platform: 'Epic', handle: player };
  return { player, platform, handle, url: `https://rlstats.net/profile/${platform}/${handle}` };
});

const retryMs = 180000;
const maxBytes = 512000;
const author = 'public-rlstats';
const romanDivisions = ['I', 'II', 'III', 'IV'];
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const attr = (node: HtmlNode | undefined, name: string): string | undefined =>
  node?.attrs?.find((attribute) => attribute.name === name)?.value;
const hasClass = (node: HtmlNode, name: string): boolean => (attr(node, 'class') || '').split(/\s+/).includes(name);

function text(node: HtmlNode): string {
  if (node.nodeName === '#text') return node.value ?? '';
  return (node.childNodes || [])
    .filter((child) => !['script', 'style'].includes(child.nodeName))
    .map(text)
    .join('');
}

const clean = (node: HtmlNode): string => text(node).replace(/\s+/g, ' ').trim();

// Text placed directly in a node, ignoring nested elements (such as the <mmr> estimates).
const ownText = (node: HtmlNode | undefined): string =>
  (node?.childNodes || [])
    .filter((child) => child.nodeName === '#text')
    .map(text)
    .join('');

function findAll(node: HtmlNode | undefined, matches: (node: HtmlNode) => boolean): HtmlNode[] {
  const found: HtmlNode[] = [];
  function walk(current: HtmlNode) {
    if (matches(current)) found.push(current);
    for (const child of current.childNodes || []) walk(child);
  }
  if (node) walk(node);
  return found;
}

function one<T>(nodes: T[], message: string): T {
  const [first] = nodes;
  if (nodes.length !== 1 || first === undefined) throw Error(message);
  return first;
}

function sourceDate(value: string | undefined): string {
  const match = /^([A-Z][a-z]{2})\/(\d{1,2})\/(20\d{2}) (\d{2}):(\d{2}):(\d{2}) GMT$/.exec(value || '');
  if (!match) throw Error('Date du relevé public absente.');
  const month = monthNames.indexOf(match[1] ?? '');
  const [year, day, hours, minutes, seconds] = [match[3], match[2], match[4], match[5], match[6]].map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
  if (
    month < 0 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day ||
    hours > 23 ||
    minutes > 59 ||
    seconds > 59
  ) {
    throw Error('Date du relevé public invalide.');
  }
  return date.toISOString();
}

const isUpdatedStamp = (node: HtmlNode): boolean => node.tagName === 'span' && /^Updated\s/.test(clean(node));
const tableCells = (row: HtmlNode | undefined): HtmlNode[] =>
  (row?.childNodes || []).filter((node) => node.tagName === 'td' || node.tagName === 'th');

export function parsePublicRank(html: unknown, profile: PublicProfile, now: number = Date.now()): PublicRank {
  if (typeof html !== 'string' || html.length > maxBytes) throw Error('Page publique trop volumineuse.');
  const doc = parseHtml(html);
  const heading = one(
    findAll(doc, (node) => node.tagName === 'h1' && findAll(node, isUpdatedStamp).length > 0),
    'Profil public non reconnu.',
  );
  const canonical = one(
    findAll(doc, (node) => node.tagName === 'link' && attr(node, 'rel') === 'canonical'),
    'Adresse du profil public absente.',
  );
  if (attr(canonical, 'href')?.toLowerCase() !== profile.url.toLowerCase()) {
    throw Error('Adresse du profil public différente.');
  }
  const name = ownText(heading).trim();
  const platform = one(
    findAll(heading, (node) => node.tagName === 'img'),
    'Plateforme du profil absente.',
  );
  if (
    name.normalize('NFKC').toLowerCase() !== profile.handle.toLowerCase() ||
    attr(platform, 'alt') !== profile.platform
  ) {
    throw Error('Identité du profil public différente.');
  }
  const updated = one(findAll(heading, isUpdatedStamp), 'Date du relevé public absente.');
  const observedAt = sourceDate(attr(updated, 'title'));
  const age = now - Date.parse(observedAt);
  if (age < -30000 || age > publicCloseFreshMs) throw Error('Relevé public trop ancien ou daté dans le futur.');

  const skills = one(
    findAll(doc, (node) => attr(node, 'id') === 'skills'),
    'Classements publics absents.',
  );
  const selectors = findAll(skills, (node) => hasClass(node, 'season-selector'));
  const active = one(
    selectors.filter((node) => hasClass(node, 'active')),
    'Saison courante non reconnue.',
  );
  const seasonId = /^SelectSeason\((\d+)\)$/.exec(attr(active, 'onclick') || '')?.[1];
  const seasonNumber = (node: HtmlNode) => Number(/^Season (\d+)$/.exec(clean(node))?.[1]);
  const seasons = selectors.map(seasonNumber);
  const season = seasonNumber(active);
  // Only the newest season is current: an older selected season would give a stale rating.
  if (
    !seasonId ||
    !Number.isSafeInteger(season) ||
    !seasons.every(Number.isSafeInteger) ||
    Math.max(...seasons) !== season
  ) {
    throw Error('Saison courante ambiguë.');
  }
  const body = one(
    findAll(skills, (node) => hasClass(node, 'block-body') && attr(node, 'data-season') === seasonId),
    'Classements de la saison courante absents.',
  );
  const isDoublesHeader = (node: HtmlNode) => node.tagName === 'th' && clean(node) === '2v2 Doubles';
  const tables = findAll(body, (node) => node.tagName === 'table').filter((table) =>
    findAll(table, (node) => node.tagName === 'tr')[0]?.childNodes?.some(isDoublesHeader),
  );
  const table = one(tables, 'Classement 2v2 absent ou ambigu.');
  const rows = findAll(table, (node) => node.tagName === 'tr');
  const headers = tableCells(rows[0]);
  const column = one(
    headers.flatMap((node, index) => (clean(node) === '2v2 Doubles' ? [index] : [])),
    'Colonne 2v2 ambiguë.',
  );
  if (rows.length < 5 || !rows.slice(0, 5).every((row) => tableCells(row).length === headers.length)) {
    throw Error('Tableau public incomplet.');
  }
  // The surrounding <mmr> tags are promotion/demotion ESTIMATES, not the rating.
  const raw = ownText(tableCells(rows[3])[column]).trim();
  if (!/^\d{1,5}$/.test(raw) || Number(raw) > 10000) throw Error('MMR 2v2 public invalide.');
  const icons = findAll(
    tableCells(rows[4])[column],
    (node) => node.tagName === 'img' && !hasClass(node, 'unranked-estimate'),
  );
  const icon = one(icons, 'Rang 2v2 public ambigu.');
  const tier = Number(/\/s\d+rank(\d+)\.png$/.exec(attr(icon, 'src') || '')?.[1]);
  const divisionCell = tableCells(rows[2])[column];
  const divisionText = divisionCell ? clean(divisionCell) : '';
  const division = tier > 0 && tier < 22 ? romanDivisions.indexOf(divisionText.replace(/^Division /, '')) + 1 : null;
  if (!Number.isSafeInteger(tier) || tier < 0 || tier > 22 || (division !== null && division < 1)) {
    throw Error('Rang ou division 2v2 public invalide.');
  }
  return {
    player: profile.player,
    mmr: Number(raw),
    tier,
    division,
    source: 'rlstats',
    sourceAt: observedAt,
    sourceUrl: profile.url,
    season,
  };
}

async function readBoundedBody(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw Error('Page publique vide.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk: Uint8Array = value;
      size += chunk.byteLength;
      if (size > maxBytes) throw Error('Page publique trop volumineuse.');
      chunks.push(chunk);
    }
  } finally {
    // Releasing the stream must never hide the reading error itself.
    await reader.cancel().catch(() => undefined);
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(data);
}

async function fetchRank(profile: PublicProfile, fetcher: PublicFetcher, now: number): Promise<PublicRank> {
  // Manual redirects: Workers cannot follow them safely, and a redirect may lead to another page.
  const response = await fetcher(profile.url, {
    redirect: 'manual',
    headers: { 'User-Agent': 'BigRocketCamp/1.0', Accept: 'text/html' },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw Error(`Source publique indisponible (HTTP ${response.status}).`);
  if (!response.headers.get('content-type')?.toLowerCase().startsWith('text/html')) {
    throw Error('Format de la source publique inattendu.');
  }
  if (Number(response.headers.get('content-length')) > maxBytes) throw Error('Page publique trop volumineuse.');
  return parsePublicRank(await readBoundedBody(response), profile, now);
}

interface PublicMmrSyncRow {
  last_attempt: string | null;
  next_attempt: string | null;
  status: string | null;
  detail: string | null;
}

export async function readPublicMmrStatus(db: Database): Promise<PublicMmrStatus> {
  const row = await db
    .prepare('SELECT last_attempt,next_attempt,status,detail FROM public_mmr_sync WHERE id=1')
    .first<PublicMmrSyncRow>();
  const detail: unknown = JSON.parse(row?.detail || '{"updated":[],"errors":[]}');
  // The column only ever holds what syncPublicMmr wrote (or '{}' before its first run).
  const summary = typeof detail === 'object' && detail !== null ? (detail as Partial<PublicMmrStatus>) : {};
  return {
    profiles: publicProfiles,
    lastAttempt: row?.last_attempt ?? null,
    nextAttempt: row?.next_attempt ?? null,
    status: row?.status ?? 'waiting',
    ...summary,
  };
}

function failureMessage(reason: unknown): string {
  const failure: { name?: unknown; message?: unknown } = typeof reason === 'object' && reason !== null ? reason : {};
  if (failure.name === 'TimeoutError') return 'Source publique trop lente.';
  return String(failure.message || 'Lecture publique impossible.');
}

async function entryId(rank: PublicRank): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(rank))));
  return `rlstats-${[...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export async function syncPublicMmr(
  db: Database,
  { now = Date.now(), fetcher = globalThis.fetch }: { now?: number; fetcher?: PublicFetcher } = {},
): Promise<PublicMmrStatus & { ok: true; ran: boolean }> {
  const at = new Date(now).toISOString();
  const next = new Date(now + retryMs).toISOString();
  await db
    .prepare(
      "INSERT INTO public_mmr_sync (id,next_attempt,status,detail) VALUES (1,'','waiting','{}') ON CONFLICT(id) DO NOTHING",
    )
    .run();
  // Claiming the slot first means concurrent requests never read the provider twice.
  const claim = await db
    .prepare("UPDATE public_mmr_sync SET next_attempt=?,last_attempt=?,status='reading' WHERE id=1 AND next_attempt<=?")
    .bind(next, at, at)
    .run();
  if (Number(claim.meta?.changes ?? claim.changes) !== 1)
    return { ok: true, ran: false, ...(await readPublicMmrStatus(db)) };

  const identities = await readPlayerIdentities(db);
  const updated: string[] = [];
  const errors: PublicMmrError[] = [];
  const writes: Statement[] = [];
  const targets = publicProfiles.map((profile) => ({
    profile,
    identity: identities.find((identity) => identity.slot === profile.player),
  }));
  const responses = await Promise.allSettled(
    targets.map(({ profile, identity }) =>
      identity
        ? fetchRank(profile, fetcher, now)
        : Promise.reject(Error('Identité du joueur à associer dans RL-Pompes.')),
    ),
  );
  for (const [index, result] of responses.entries()) {
    const target = targets[index];
    if (!target) continue;
    const { profile, identity } = target;
    if (result.status !== 'fulfilled' || !identity) {
      const reason: unknown = result.status === 'rejected' ? result.reason : undefined;
      errors.push({ player: profile.player, error: failureMessage(reason) });
      continue;
    }
    const rank = result.value;
    const id = await entryId(rank);
    writes.push(
      db
        .prepare(
          "INSERT INTO mmr_entries (id,player,mmr,tier,division,author,source,source_at,source_url) VALUES (?,?,?,?,?,?,'rlstats',?,?) ON CONFLICT(id) DO NOTHING",
        )
        .bind(id, rank.player, rank.mmr, rank.tier, rank.division, author, rank.sourceAt, rank.sourceUrl),
    );
    writes.push(projectMmrRankWrite(db, { playerId: identity.player_id, id, author, player: rank.player }));
    updated.push(rank.player);
  }
  const status = updated.length === publicProfiles.length ? 'ready' : updated.length ? 'partial' : 'unavailable';
  writes.push(
    db
      .prepare('UPDATE public_mmr_sync SET status=?,detail=? WHERE id=1')
      .bind(status, JSON.stringify({ updated, errors })),
  );
  await db.batch(writes);
  return { ok: true, ran: true, ...(await readPublicMmrStatus(db)) };
}

function isPublicPage(page: unknown): page is PublicPage {
  if (typeof page !== 'object' || page === null) return false;
  const { player, html } = page as { player?: unknown; html?: unknown };
  return (
    publicProfiles.some((profile) => profile.player === player) && typeof html === 'string' && html.length <= maxBytes
  );
}

const pagePlayer = (page: unknown): unknown =>
  typeof page === 'object' && page !== null ? (page as { player?: unknown }).player : undefined;

// Privileged updater import. The agent reads public pages using its ordinary
// browsing access; this path parses snapshots and NEVER fetches the provider.
export async function importPublicMmr(
  db: Database,
  pages: unknown,
  { now = Date.now() }: { now?: number } = {},
): Promise<PublicMmrStatus & { ok: true; ran: boolean }> {
  if (
    !Array.isArray(pages) ||
    !pages.length ||
    pages.length > publicProfiles.length ||
    new Set(pages.map(pagePlayer)).size !== pages.length ||
    !pages.every(isPublicPage)
  ) {
    throw Error('Envoi de profils publics invalide.');
  }
  const snapshots: PublicPage[] = pages;
  return syncPublicMmr(db, {
    now,
    fetcher: async (url) => {
      const profile = publicProfiles.find((candidate) => candidate.url === url);
      const page = snapshots.find((snapshot) => snapshot.player === profile?.player);
      if (!page) throw Error('Relevé public non reçu.');
      return new Response(page.html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    },
  });
}
