import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../chatgpt-auth';
import {connectionStatus,syncHistories,recapState} from '../../lib/epic-sync.mjs';
import {parisDay} from '../../lib/domain.mjs';
const tools=[
 {name:'get_sync_status',description:'Lire les connexions Epic, leur couverture et les derniers classements 2v2 (rang, division, MMR) dans RL-Pompes, sans jetons.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true}},
 {name:'sync_epic_histories',description:'Actualiser les classements 2v2 via le compte secondaire, puis vérifier la présence et synchroniser les matchs des joueurs hors ligne. Aucun compte joueur connecté si la présence est inconnue.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,idempotentHint:true}},
 {name:'get_daily_recap',description:'Lire le récap RL-Pompes réconcilié avec toutes les sources, sans doublons. Par défaut la veille en heure de Paris.',inputSchema:{type:'object',properties:{day:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'}},additionalProperties:false},annotations:{readOnlyHint:true}},
];
export async function POST(request:Request){
 let id=null;
 try{const rpc=await request.json() as any;id=rpc.id??null;let result;
  if(rpc.method==='server/discover')result={supportedVersions:['2026-07-28'],capabilities:{tools:{}}};
  else if(rpc.method==='initialize')result={protocolVersion:'2026-07-28',serverInfo:{name:'RL-Pompes',version:'1.0.0'},capabilities:{tools:{}}};
  else if(rpc.method==='tools/list')result={tools};
  else if(rpc.method==='notifications/initialized')return new Response(null,{status:202});
  else if(rpc.method==='tools/call'){
   const user=await getChatGPTUser();if(!user)return Response.json({jsonrpc:'2.0',id,error:{code:-32001,message:'Connexion requise.'}},{status:401});
   const name=rpc.params?.name,args=rpc.params?.arguments||{};let value;
   if(name==='get_sync_status')value=await connectionStatus(env,user.userId);
   else if(name==='sync_epic_histories')value=await syncHistories(env,user.userId);
   else if(name==='get_daily_recap'){let day=args.day;if(day===undefined){const d=new Date(`${parisDay()}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-1);day=parisDay(d);}value=await recapState(env,day);}
   else throw Error('Outil inconnu.');
   result={content:[{type:'text',text:JSON.stringify(value)}]};
  }else return Response.json({jsonrpc:'2.0',id,error:{code:-32601,message:'Méthode inconnue.'}});
  return Response.json({jsonrpc:'2.0',id,result},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({jsonrpc:'2.0',id,result:{isError:true,content:[{type:'text',text:'Opération indisponible. Les données précédentes sont conservées.'}]}},{headers:{'Cache-Control':'no-store'}});}
}
