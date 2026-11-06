import {env,waitUntil} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {connectionStatus,beginLink,finishLink,disconnect,syncHistories,autoSync} from '../../../lib/epic-sync.mjs';
export async function GET(){const user=await getChatGPTUser();if(!user)return Response.json({error:'Connexion requise.'},{status:401});return Response.json(await connectionStatus(env,user.userId),{headers:{'Cache-Control':'no-store'}});}
export async function POST(request:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Connexion requise.'},{status:401});
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origine refusée.'},{status:403});
 try{const input=await request.text();if(input.length>2000)throw Error('Demande invalide.');const {action,slot}=JSON.parse(input);let result;
  if(action==='start')result=await beginLink(env,user.userId,slot);
  else if(action==='poll')result=await finishLink(env,user.userId,slot);
  else if(action==='disconnect')result=await disconnect(env,user.userId,slot);
  else if(action==='sync'||action==='auto'){
   const run=action==='sync'?syncHistories(env,user.userId):autoSync(env);
   // Retain a short in-flight read if its initiating tab closes, including
   // while refreshed account tokens are being persisted.
   waitUntil(run);result=await run;
  }
  else throw Error('Action inconnue.');
  return Response.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e instanceof Error&&!(e as any).code?e.message:'Service Epic indisponible. Réessaie plus tard.'},{status:400,headers:{'Cache-Control':'no-store'}});}
}
