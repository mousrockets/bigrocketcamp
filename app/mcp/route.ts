import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../chatgpt-auth';
import {connectionStatus,syncHistories,recapState} from '../../lib/epic-sync.mjs';
import {parisDay} from '../../lib/domain.mjs';
import {readMonthlyMmr,closeMonthlyMmr} from '../../lib/monthly-mmr.mjs';
import {importPublicMmr,publicProfiles} from '../../lib/public-ranks.mjs';
import {canImportPublicMmr} from '../../lib/public-mmr-auth.mjs';
const tools=[
 {name:'get_sync_status',description:'Lire les identités conservées et les derniers MMR reçus. La collecte Epic est retirée ; aucun accès Epic ni jeton utilisé.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true}},
 {name:'sync_epic_histories',description:'Ancien outil retiré : renvoie seulement le statut de retrait, sans connexion à Epic. Utiliser le Direct PC officiel.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,idempotentHint:true}},
 {name:'get_daily_recap',description:'Lire le récap Les Trois Mousrockets réconcilié avec toutes les sources, sans doublons. Par défaut la veille en heure de Paris.',inputSchema:{type:'object',properties:{day:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'}},additionalProperties:false},annotations:{readOnlyHint:true}},
 {name:'get_monthly_mmr',description:'Lire le classement MMR 2v2 mensuel déclaré, les clôtures archivées et les boissons dues. Aucun appel Epic.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true}},
 {name:'close_monthly_mmr',description:'Clôturer les mois terminés en heure de Paris après cinq minutes de marge, sans requête à une source externe. Deux boissons pour le dernier unique ; aucune dette si ex æquo ou relevé récent manquant. Le mois en cours reste ouvert.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,idempotentHint:true}},
 {name:'import_public_mmr',description:'Pour le propriétaire chargé des relevés : enregistrer les pages publiques RLStats.net déjà consultées par l’agent. Le serveur vérifie profil, plateforme, saison, date et MMR 2v2 sans contacter RLStats ou Epic. Aucun identifiant interne ou jeton de jeu requis. Ne jamais envoyer une page de connexion, une clé ou un contenu inventé.',inputSchema:{type:'object',properties:{pages:{type:'array',minItems:1,maxItems:3,items:{type:'object',properties:{player:{type:'string',enum:publicProfiles.map(p=>p.player)},html:{type:'string',maxLength:512000}},required:['player','html'],additionalProperties:false}}},required:['pages'],additionalProperties:false},annotations:{readOnlyHint:false,idempotentHint:true}},
];
export async function POST(request:Request){
 let id=null;
 try{const rpc=await request.json() as any;id=rpc.id??null;let result;
  if(rpc.method==='server/discover')result={supportedVersions:['2026-07-28'],capabilities:{tools:{}}};
  else if(rpc.method==='initialize')result={protocolVersion:'2026-07-28',serverInfo:{name:'Les Trois Mousrockets',version:'1.0.0'},capabilities:{tools:{}}};
  else if(rpc.method==='tools/list')result={tools};
  else if(rpc.method==='notifications/initialized')return new Response(null,{status:202});
  else if(rpc.method==='tools/call'){
   const user=await getChatGPTUser();if(!user)return Response.json({jsonrpc:'2.0',id,error:{code:-32001,message:'Connexion requise.'}},{status:401});
   const name=rpc.params?.name,args=rpc.params?.arguments||{};let value;
   if(name==='get_sync_status')value=await connectionStatus(env,user.userId);
   else if(name==='sync_epic_histories')value=await syncHistories();
   else if(name==='get_monthly_mmr')value={...await readMonthlyMmr(env.DB,user.userId),canImportPublicMmr:canImportPublicMmr(env,user.userId)};
   else if(name==='close_monthly_mmr')value=await closeMonthlyMmr(env.DB);
   else if(name==='import_public_mmr'){if(!canImportPublicMmr(env,user.userId))throw Error('Relevé réservé au propriétaire configuré.');value=await importPublicMmr(env.DB,args.pages);}
   else if(name==='get_daily_recap'){let day=args.day;if(day===undefined){const d=new Date(`${parisDay()}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-1);day=parisDay(d);}value=await recapState(env,day);}
   else throw Error('Outil inconnu.');
   result={content:[{type:'text',text:JSON.stringify(value)}]};
  }else return Response.json({jsonrpc:'2.0',id,error:{code:-32601,message:'Méthode inconnue.'}});
  return Response.json({jsonrpc:'2.0',id,result},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({jsonrpc:'2.0',id,result:{isError:true,content:[{type:'text',text:'Opération indisponible. Les données précédentes sont conservées.'}]}},{headers:{'Cache-Control':'no-store'}});}
}
