import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {roster} from '../../../lib/domain.mjs';
import {readPlayerIdentities,readIdentityBindings,canonicalPlayerId,unassignedPrefix} from '../../../lib/player-identities.mjs';
import {readMerged} from '../../../lib/reconcile.mjs';
const headers={'Cache-Control':'no-store'};
export async function GET(){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Connexion requise.'},{status:401,headers});
 const [identities,aliases,merged]=await Promise.all([readPlayerIdentities(env.DB!),readIdentityBindings(env.DB!),readMerged(env.DB!)]);
 const seen=new Set<string>();
 const candidates=merged.rows.filter(r=>r.kind==='match'&&!r.review_required&&!aliases.some(a=>canonicalPlayerId(a.player_id)===canonicalPlayerId(r.player_id))).filter(r=>{const id=canonicalPlayerId(r.player_id);if(seen.has(id))return false;seen.add(id);return true;}).slice(0,50).map(r=>({playerId:canonicalPlayerId(r.player_id),name:r.name.startsWith(unassignedPrefix)?r.name.slice(unassignedPrefix.length):r.name,day:r.day}));
 return Response.json({retired:true,identities:roster.map(slot=>{const identity=identities.find(i=>i.slot===slot);return {slot,known:!!identity,owned:identity?.owner===user.userId,aliases:aliases.filter(a=>a.slot===slot).map(a=>({playerId:a.player_id,primary:a.player_id===identity?.player_id}))};}),candidates},{headers});
}
export async function POST(request:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Connexion requise.'},{status:401,headers});
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origine refusée.'},{status:403,headers});
 const body=await request.text();if(body.length>2000)return Response.json({error:'Envoi trop volumineux.'},{status:413,headers});
 try{
  const {slot,playerId:rawId,action='confirm'}=JSON.parse(body);
  if(!roster.includes(slot)||typeof rawId!=='string'||rawId.length>256)throw Error('Identifiant invalide.');
  const playerId=canonicalPlayerId(rawId),identity=(await readPlayerIdentities(env.DB!,user.userId)).find(i=>i.slot===slot);
  if(!identity)return Response.json({error:'Seul le membre associé à ce joueur peut confirmer son identifiant.'},{status:403,headers});
  if(action==='remove'){
   if(playerId===identity.player_id)throw Error('L’identifiant principal est conservé.');
   await env.DB!.prepare('DELETE FROM player_identity_aliases WHERE player_id=? AND slot=? AND confirmed_by=?').bind(playerId,slot,user.userId).run();return Response.json({ok:true},{headers});
  }
  if(action!=='confirm'||!/^(Epic|Steam|PS4|XboxOne|Switch|PsyNet)\|[^\s|]{1,128}\|0$/.test(playerId))throw Error('Identifiant invalide.');
  const merged=await readMerged(env.DB!);
  if(!merged.rows.some(r=>r.kind==='match'&&!r.review_required&&canonicalPlayerId(r.player_id)===playerId))throw Error('Choisis un joueur déjà présent dans un tableau reçu.');
  await env.DB!.prepare('INSERT INTO player_identity_aliases (player_id,slot,confirmed_by,confirmed_at) SELECT ?,slot,owner,? FROM player_identities WHERE slot=? AND owner=? ON CONFLICT(player_id) DO NOTHING').bind(playerId,new Date().toISOString(),slot,user.userId).run();
  const saved=await env.DB!.prepare('SELECT slot FROM player_identity_aliases WHERE player_id=?').bind(playerId).first<{slot:string}>();
  if(saved?.slot!==slot)return Response.json({error:'Cet identifiant est déjà attribué à un autre joueur.'},{status:409,headers});
  return Response.json({ok:true},{headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Confirmation impossible.'},{status:400,headers});}
}
