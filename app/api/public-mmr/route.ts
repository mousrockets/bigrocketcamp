import {env} from 'cloudflare:workers';
import {importPublicMmr} from '../../../lib/public-ranks.mjs';
import {publicMmrKeyMatches} from '../../../lib/public-mmr-auth.mjs';
const headers={'Cache-Control':'no-store'};
// Narrow service credential: public rank snapshots only; no visitor identity is forged.
export async function POST(request:Request){
 const settings=env as typeof env&{PUBLIC_MMR_IMPORT_KEY?:string};
 if(!publicMmrKeyMatches(settings.PUBLIC_MMR_IMPORT_KEY,request.headers.get('X-RL-Public-Mmr-Key')))return Response.json({error:'Accès au relevé refusé.'},{status:401,headers});
 const body=await request.text();if(body.length>1550000)return Response.json({error:'Envoi trop volumineux.'},{status:413,headers});
 try{return Response.json(await importPublicMmr(env.DB!,JSON.parse(body).pages),{headers});}catch{return Response.json({error:'Envoi de profils publics invalide.'},{status:400,headers});}
}
