import {roster} from './domain.mjs';

const outcomeFields=['day','kind','team','winner'];
const scoreFields=['score','goals','assists','saves'];
export const playerKey=id=>String(id).replace(/^PSN\|/i,'PS4|').replace(/^epic\|/i,'Epic|').replace(/^steam\|/i,'Steam|');
export const matchKey=id=>String(id).trim().toLowerCase();
const rowKey=r=>JSON.stringify([matchKey(r.match_guid),playerKey(r.player_id)]);
const same=(a,b,fields)=>fields.every(k=>a[k]===b[k]);
const rank=c=>c.type==='epic'?2:1;
const choose=(a,b)=>{
 if(rank(a)!==rank(b))return rank(a)>rank(b)?a:b;
 if(a.type==='epic')return a.received>=b.received?a:b;
 if(a.row.kind!==b.row.kind)return a.row.kind==='match'?a:b;
 if(a.row.score!==b.row.score)return a.row.score>b.row.score?a:b;
 return a.received>=b.received?a:b;
};
export function reconcile(legacy,observations=[],legacyRosters=[],reports=[]){
 const groups=new Map();
 const add=c=>{if(!c.row||typeof c.row.match_guid!=='string'||typeof c.row.player_id!=='string')return;const key=rowKey(c.row);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c);};
 for(const row of legacy)add({row,type:'collector',source:'legacy',received:row.received||''});
 for(const item of observations){try{add({row:typeof item.payload==='string'?JSON.parse(item.payload):item.payload,type:item.source_type,source:item.source_id,received:item.received});}catch{}}
 let rows=[];
 for(const candidates of groups.values()){
  const perSource=new Map();
  for(const c of candidates){const key=c.type+':'+c.source;perSource.set(key,perSource.has(key)?choose(perSource.get(key),c):c);}
  const sources=[...perSource.values()],chosen=sources.reduce(choose),epic=chosen.type==='epic';
  const outcomeConflict=candidates.some(c=>c.row.kind==='match'&&chosen.row.kind==='match'&&!same(c.row,chosen.row,outcomeFields));
  const scoreConflict=sources.some(c=>!same(c.row,chosen.row,scoreFields));
  // A whole source snapshot wins. Never combine unrelated MAX(score/goals/...).
  const types=[...new Set(sources.map(c=>c.type))];
  const review=outcomeConflict&&!epic;
  rows.push({...chosen.row,match_guid:matchKey(chosen.row.match_guid),received:chosen.received,player_id:playerKey(chosen.row.player_id),review_required:review,
   verification:review?'review':outcomeConflict||scoreConflict?'corrected':types.length>1?'confirmed':'single',
   source_types:types,selected_source:chosen.type,source_difference:outcomeConflict?'result':scoreConflict?'stats':null});
 }
 // Different platform IDs with the same group nickname cannot silently count twice.
 const tracked=new Map(),keep=[];
 for(const row of rows){if(!roster.includes(row.name)){keep.push(row);continue;}const key=JSON.stringify([row.match_guid,row.name]);if(!tracked.has(key))tracked.set(key,[]);tracked.get(key).push(row);}
 for(const duplicates of tracked.values()){
  if(duplicates.length===1){keep.push(duplicates[0]);continue;}
  keep.push({...duplicates[0],review_required:true,verification:'review',source_difference:'identity'});
 }
 rows=keep.sort((a,b)=>b.day.localeCompare(a.day)||(b.received||'').localeCompare(a.received||'')||a.match_guid.localeCompare(b.match_guid)||a.player_id.localeCompare(b.player_id));
 const byMatch=new Map();for(const row of rows){if(!byMatch.has(row.match_guid))byMatch.set(row.match_guid,[]);byMatch.get(row.match_guid).push(row);}
 const complete=[];
 for(const [guid,players] of byMatch){
  if(players.some(p=>p.review_required))continue;
  const candidates=[];
  for(const report of reports.filter(r=>matchKey(r.match_guid)===guid)){
   try{const snapshot=typeof report.players==='string'?JSON.parse(report.players):report.players;
    if(!Array.isArray(snapshot)||snapshot.length!==report.expected_players||players.length!==snapshot.length)continue;
    if(!snapshot.every(r=>players.some(p=>playerKey(p.player_id)===playerKey(r.player_id)&&same(p,r,[...outcomeFields,...scoreFields]))))continue;
    candidates.push(report);
   }catch{}
  }
  candidates.sort((a,b)=>(b.source_type==='epic'?2:1)-(a.source_type==='epic'?2:1)||b.received.localeCompare(a.received));
  if(candidates.length)complete.push({match_guid:guid,expected_players:candidates[0].expected_players});
  else if(!observations.some(o=>matchKey(o.match_guid)===guid)&&!reports.some(r=>matchKey(r.match_guid)===guid)){const old=legacyRosters.find(r=>matchKey(r.match_guid)===guid);if(old&&old.expected_players===players.length)complete.push({...old,match_guid:guid});}
 }
 const groupRows=rows.filter(r=>roster.includes(r.name)&&r.kind==='match');
 return {rows,rosters:complete,reliability:{confirmed:groupRows.filter(r=>r.verification==='confirmed').length,single:groupRows.filter(r=>r.verification==='single').length,corrected:groupRows.filter(r=>r.verification==='corrected').length,review:groupRows.filter(r=>r.review_required).length}};
}

const asStored=(r,now)=>({match_guid:matchKey(r.matchGuid),player_id:playerKey(r.playerId),name:r.name,day:r.day,kind:r.kind,team:r.team,winner:r.winner,score:r.score,goals:r.goals,assists:r.assists,saves:r.saves,received:now});
const sha=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');
/** @param {any} db @param {{rows:any[],rosters?:any[],sourceId:string,sourceType:string}} options @param {string} now */
export async function observationWrites(db,{rows,rosters=[],sourceId,sourceType},now){
 if(!['collector','epic'].includes(sourceType))throw Error('Source invalide.');
 const stored=rows.map(r=>asStored(r,now)),writes=[];
 for(const row of stored){
  const payload=JSON.stringify({...row,received:undefined}),id=await sha(JSON.stringify([sourceType,sourceId,payload]));
  writes.push(db.prepare('INSERT INTO result_observations (id,match_guid,player_id,source_id,source_type,payload,received) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET received=MAX(result_observations.received,excluded.received)').bind(id,row.match_guid,row.player_id,sourceId,sourceType,payload,now));
 }
 for(const roster of rosters){
  const players=stored.filter(r=>r.match_guid===matchKey(roster.matchGuid)).map(r=>({...r,received:undefined})).sort((a,b)=>a.player_id.localeCompare(b.player_id));
  const payload=JSON.stringify(players),id=await sha(JSON.stringify([sourceType,sourceId,roster.matchGuid,payload]));
  writes.push(db.prepare('INSERT INTO source_reports (id,match_guid,source_id,source_type,expected_players,players,received) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET received=MAX(source_reports.received,excluded.received)').bind(id,matchKey(roster.matchGuid),sourceId,sourceType,roster.playerCount,payload,now));
 }
 return writes;
}
export async function readMerged(db){
 const [legacy,observations,rosters,reports]=await Promise.all([
  db.prepare('SELECT * FROM results ORDER BY day DESC,received DESC,rowid DESC').all(),
  db.prepare('SELECT * FROM result_observations ORDER BY received').all(),
  db.prepare('SELECT * FROM match_rosters').all(),
  db.prepare('SELECT * FROM source_reports ORDER BY received').all(),
 ]);
 return reconcile(legacy.results,observations.results,rosters.results,reports.results);
}
