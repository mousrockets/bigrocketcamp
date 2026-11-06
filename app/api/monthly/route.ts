import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {recordMmr,closeMonthlyMmr,settleDrink,readMonthlyMmr} from '../../../lib/monthly-mmr.mjs';
import {syncPublicMmr} from '../../../lib/public-ranks.mjs';
const headers={'Cache-Control':'no-store'};
export async function GET(){const user=await getChatGPTUser();if(!user)return Response.json({error:'Connexion requise.'},{status:401,headers});return Response.json(await readMonthlyMmr(env.DB!,user.userId),{headers});}
export async function POST(request:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Connexion requise.'},{status:401,headers});
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origine refusée.'},{status:403,headers});
 const body=await request.text();if(body.length>3000)return Response.json({error:'Envoi trop volumineux.'},{status:413,headers});
 try{const input=JSON.parse(body);let result;
  if(input.action==='record')result=await recordMmr(env.DB!,user.userId,input);
  else if(input.action==='refresh')result=await closeMonthlyMmr(env.DB!);
  else if(input.action==='public')result=await syncPublicMmr(env.DB!);
  else if(input.action==='settle'||input.action==='undo')result=await settleDrink(env.DB!,user.userId,input.id,input.action==='undo');
  else throw Error('Action inconnue.');
  return Response.json(result,{headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Action impossible.'},{status:(e as {status?:number})?.status||400,headers});}
}
