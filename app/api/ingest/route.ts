import { env } from 'cloudflare:workers';
import { normalizeResult,validateExercise } from '../../../lib/domain.mjs';
export async function POST(request:Request){
 const secret=(env as unknown as {INGEST_KEY?:string}).INGEST_KEY;
 if(!secret||request.headers.get('authorization')!==`Bearer ${secret}`)return Response.json({error:'Collecteur non autorisé.'},{status:401});
 const body=await request.text();if(body.length>2000000)return Response.json({error:'Envoi trop volumineux.'},{status:413});
 try{const data=JSON.parse(body);if(!Array.isArray(data.results)||data.results.length>500||!Array.isArray(data.exercises)||data.exercises.length>500||typeof data.collector!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(data.collector))throw Error('Envoi invalide.');
 const rows=data.results.map(normalizeResult).filter(Boolean),ex=data.exercises.map(validateExercise),now=new Date().toISOString(),db=env.DB!;
 const writes=rows.map((r:any)=>db.prepare('INSERT INTO results (match_guid,player_id,name,day,kind,team,winner,score,goals,assists,saves,received) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(match_guid,player_id) DO NOTHING').bind(r.matchGuid,r.playerId,r.name,r.day,r.kind,r.team,r.winner,r.score,r.goals,r.assists,r.saves,now));
 for(const e of ex)writes.push(db.prepare('INSERT INTO exercises (id,player,count,day,created,author) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(e.id,e.player,e.count,e.day,now,'import-local'));
 writes.push(db.prepare('INSERT INTO collectors (id,last_seen) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen').bind(data.collector,now));await db.batch(writes);return Response.json({ok:true,received:rows.length});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Envoi invalide.'},{status:400});}
}
