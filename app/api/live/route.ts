import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {roster} from '../../../lib/domain.mjs';
import {parseLiveMatch} from '../../../lib/live-stats.mjs';
import {observationWrites} from '../../../lib/reconcile.mjs';
import {readPlayerIdentities,readIdentityBindings,attributeLivePlayers,canonicalPlayerId} from '../../../lib/player-identities.mjs';
const headers={'Cache-Control':'no-store'};
async function linked(userId:string){return readPlayerIdentities(env.DB!,userId);}
async function source(userId:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(userId));return 'live-'+[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,32);}
export async function GET(){const user=await getChatGPTUser();if(!user)return Response.json({error:'Connexion requise.'},{status:401,headers});const accounts=await linked(user.userId);return Response.json({players:accounts.map(a=>a.slot)},{headers});}
export async function POST(request:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Connexion requise.'},{status:401,headers});
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origine refusée.'},{status:403,headers});
 const body=await request.text();if(body.length>64000)return Response.json({error:'Envoi trop volumineux.'},{status:413,headers});
 try{
  const parsed=parseLiveMatch(JSON.parse(body)),accounts=await linked(user.userId),bindings=await readIdentityBindings(env.DB!);
  if(!parsed.rows.some((r:{playerId:string})=>bindings.some(b=>accounts.some(a=>a.slot===b.slot)&&canonicalPlayerId(r.playerId)===canonicalPlayerId(b.player_id))))return Response.json({error:'Le tableau doit contenir ton propre identifiant de joueur enregistré dans RL-Pompes.'},{status:403,headers});
  parsed.rows=attributeLivePlayers(parsed.rows,bindings);
  // This endpoint never opens a player session or exposes the PC ingest secret.
  const now=new Date().toISOString(),sourceId=await source(user.userId),db=env.DB!;
  const writes=await observationWrites(db,{...parsed,sourceId,sourceType:'collector'},now);
  writes.push(db.prepare('INSERT INTO collectors (id,last_seen) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET last_seen=excluded.last_seen').bind(sourceId,now));
  await db.batch(writes);return Response.json({ok:true,match:parsed.rows[0].matchGuid,received:parsed.rows.length},{headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Envoi invalide.'},{status:400,headers});}
}
