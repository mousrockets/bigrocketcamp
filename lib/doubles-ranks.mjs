import {roster} from './domain.mjs';
import {playerKey,readMerged} from './reconcile.mjs';

export const doublesPlaylist=11;
const roman=['I','II','III','IV'];
const tiers=['Non classé',...['Bronze','Argent','Or','Platine','Diamant','Champion','Grand Champion'].flatMap(name=>roman.slice(0,3).map(n=>`${name} ${n}`)),'Légende supersonique'];
export const doublesRankOptions=tiers.map((label,tier)=>({label,tier}));
const counter=n=>Number.isSafeInteger(n)&&n>=0;
export function normalizeDoublesSkill(response){
 if(!Array.isArray(response?.Skills))throw Error('Classement 2v2 non reçu.');
 const skills=response.Skills.filter(s=>s?.Playlist===doublesPlaylist);
 if(skills.length!==1)throw Error('Classement 2v2 non reçu.');
 const s=skills[0];
 if(!Number.isSafeInteger(s.Tier)||s.Tier<0||s.Tier>=tiers.length)throw Error('Rang 2v2 invalide.');
 const placementMatches=s.PlacementMatchesPlayed==null?null:s.PlacementMatchesPlayed;
 if(placementMatches!==null&&(!counter(placementMatches)||placementMatches>10))throw Error('Placement 2v2 invalide.');
 const ranked=s.Tier>0&&(placementMatches===null||placementMatches>=10);
 if(ranked&&s.Tier!==22&&(!Number.isSafeInteger(s.Division)||s.Division<0||s.Division>3))throw Error('Division 2v2 invalide.');
 // PsyNet returns TrueSkill Mu. Display MMR = Mu * 20 + 100 (rlru MatchSkills).
 // Its raw MMR field is also on the internal scale; never display it as game MMR.
 let mmr=null;
 if(s.Mu!=null){if(typeof s.Mu!=='number'||!Number.isFinite(s.Mu)||Math.abs(s.Mu)>10000)throw Error('MMR 2v2 invalide.');mmr=Math.round(s.Mu*20+100);}
 else if(ranked)throw Error('MMR 2v2 non reçu.');
 return {playlist:doublesPlaylist,mmr,tier:s.Tier,division:ranked&&s.Tier!==22?s.Division+1:null,placementMatches};
}
export function doublesRankLabel(rank){
 if(rank.tier===0||(rank.placementMatches!==null&&rank.placementMatches<10))return rank.placementMatches!==null&&rank.placementMatches<10?`Non classé · Placement ${rank.placementMatches}/10`:'Non classé';
 const name=tiers[rank.tier];return name?name+(rank.division?` · Division ${roman[rank.division-1]}`:''):'Classement non reçu';
}
export function rankTargets(rows,accounts,owner){return roster.map(player=>{
 const linked=accounts.find(a=>a.slot===player);
 if(linked)return {player,playerId:`Epic|${linked.account_id}|0`};
 if(rows.some(r=>r.name===player&&r.source_difference==='identity'))return {player,playerId:null,conflict:true};
 const ids=[...new Set(rows.filter(r=>r.name===player&&r.kind==='match').map(r=>playerKey(r.player_id)).filter(id=>/^[A-Za-z0-9]+\|[^|]+(?:\|0)?$/.test(id)))];
 return {player,playerId:ids.length===1?ids[0]:null,conflict:ids.length>1};
});}
export async function readDoublesRanks(db){
 const stored=(await db.prepare('SELECT player,mmr,tier,division,placement_matches,fetched_at,last_attempt,status FROM player_ranks WHERE playlist=11').all()).results;
 return roster.map(player=>{const r=stored.find(r=>r.player===player);
  if(!r||r.mmr===null)return {player,playlist:doublesPlaylist,mmr:null,label:r?.status==='identity_conflict'?'Compte à vérifier':'Classement non reçu',status:r?.status||'waiting',fetchedAt:null,lastAttempt:r?.last_attempt||null};
  if(r.tier===null)return {player,playlist:doublesPlaylist,mmr:r.mmr,label:'Rang non renseigné',status:r.status,fetchedAt:r.fetched_at,lastAttempt:r.last_attempt};
  return {player,playlist:doublesPlaylist,mmr:r.mmr,label:doublesRankLabel({tier:r.tier,division:r.division,placementMatches:r.placement_matches}),status:r.status,fetchedAt:r.fetched_at,lastAttempt:r.last_attempt};
 });
}
