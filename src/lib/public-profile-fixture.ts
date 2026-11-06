// Synthetic public profile pages for tests. No real player page or live rating is stored in the repository.
import type { PublicProfile } from './public-ranks';

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function publicStamp(time: number = Date.now()): string {
  const date = new Date(time);
  const month = monthNames[date.getUTCMonth()];
  return `${month}/${date.getUTCDate()}/${date.getUTCFullYear()} ${date.toISOString().slice(11, 19)} GMT`;
}

export interface PublicProfilePageOptions {
  mmr?: number | string;
  tier?: number;
  division?: string;
  stamp?: string;
  handle?: string;
  platform?: string;
  url?: string;
  season?: number;
  duplicate?: boolean;
}

export function publicProfileHtml(profile: PublicProfile, options: PublicProfilePageOptions = {}): string {
  const {
    mmr = 1500,
    tier = 17,
    division = 'II',
    stamp = 'Nov/30/2026 22:59:00 GMT',
    handle = profile.handle,
    platform = profile.platform,
    url = profile.url,
    season = 24,
    duplicate = false,
  } = options;
  const unrankedEstimate = tier === 0 ? '<img class="unranked-estimate" src="/images/ranks/s32rank17.png">' : '';
  const table = `<table><tr><th>1v1 Duel</th><th>2v2 Doubles</th><th>3v3 Standard</th></tr>
 <tr><td>Bronze I</td><td>Champion II</td><td>Or I</td></tr>
 <tr><td>Division I</td><td>Division ${division}</td><td>Division III</td></tr>
 <tr><td>320</td><td><mmr>~23</mmr> ${mmr} <mmr>~41</mmr></td><td>950</td></tr>
 <tr><th><img src="/images/ranks/s32rank1.png"></th><th><img src="/images/ranks/s32rank${tier}.png">${unrankedEstimate}</th><th><img src="/images/ranks/s32rank7.png"></th></tr></table>`;
  return `<!doctype html><html><head><link rel="canonical" href="${url}"></head><body><h1>RL Creator Code</h1>
 <h1><img alt="${platform}"> ${handle} <span title="${stamp}"> Updated 0 minutes ago</span><span><button>Compact Version</button></span></h1>
 <section id="skills"><span class="season-selector active" onclick="SelectSeason(38)">Season ${season}</span><div class="block-body" data-season="38"><div class="block-skills">${table}${duplicate ? table : ''}</div></div></section>
 <script>globalThis.shouldNotExecute=true;</script></body></html>`;
}
