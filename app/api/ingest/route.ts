import { env } from 'cloudflare:workers';
import { normalizeParticipant,validateExercise } from '../../../lib/domain.mjs';
import { validateMatchRosters } from '../../../lib/match-rules.mjs';
import { observationWrites } from '../../../lib/reconcile.mjs';
export async function POST(request:Request){
 const secret=(env as unknown as {INGEST_KEY?:string}).INGEST_KEY;
 if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`)return Response.json({error:'Collecteur non autorisé.'},{status:401});
 const body=await request.text();if(body.length>2000000)return Response.json({error:'Envoi trop volumineux.'},{status:413});
 try{const data=JSON.parse(body);if(!Array.isArray(data.results)||data.results.length>500||!Array.isArray(data.exercises)||data.exercises.length>500||typeof data.collector!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(data.collector))throw Error('Envoi invalide.');
 const rows=data.results.map(normalizeParticipant),rosters=validateMatchRosters(data.matches,rows),ex=data.exercises.map(validateExercise),now=new Date().toISOString(),db=env.DB!;
 const writes=rows.map((r:any)=>db.prepare("INSERT INTO result_observations (id,match_guid,player_id,source_id,source_type,payload,received) SELECT 'legacy:'||match_guid||':'||player_id,match_guid,player_id,'legacy','collector',json_object('match_guid',match_guid,'player_id',player_id,'name',name,'day',day,'kind',kind,'team',team,'winner',winner,'score',score,'goals',goals,'assists',assists,'saves',saves),received FROM results WHERE match_guid=? AND player_id=? ON CONFLICT(id) DO NOTHING").bind(r.matchGuid,r.playerId));
 writes.push(...await observationWrites(db,{rows,rosters,sourceId:data.collector,sourceType:'collector'},now));
 for(const r of rows)writes.push(db.prepare("INSERT INTO results (match_guid,player_id,name,day,kind,team,winner,score,goals,assists,saves,received) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(match_guid,player_id) DO UPDATE SET name=excluded.name,day=excluded.day,kind=excluded.kind,team=excluded.team,winner=excluded.winner,score=excluded.score,goals=excluded.goals,assists=excluded.assists,saves=excluded.saves,received=excluded.received WHERE (excluded.kind='match' AND results.kind='test') OR (excluded.kind=results.kind AND excluded.score>=results.score)").bind(r.matchGuid,r.playerId,r.name,r.day,r.kind,r.team,r.winner,r.score,r.goals,r.assists,r.saves,now));
 for(const m of rosters)writes.push(db.prepare('INSERT INTO match_rosters (match_guid,expected_players,received) VALUES (?,?,?) ON CONFLICT(match_guid) DO UPDATE SET expected_players=excluded.expected_players,received=excluded.received').bind(m.matchGuid,m.playerCount,now));
 for(const e of ex)writes.push(db.prepare('INSERT INTO exercises (id,player,count,day,created,author,type) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(e.id,e.player,e.count,e.day,now,'import-local',e.type));
 writes.push(db.prepare('INSERT INTO collectors (id,last_seen) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen').bind(data.collector,now));await db.batch(writes);return Response.json({ok:true,received:rows.length});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Envoi invalide.'},{status:400});}
}
