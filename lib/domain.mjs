import {matchIndex,lastPlaceBonus,lastPlaceRule} from './match-rules.mjs';
export {lastPlaceRule} from './match-rules.mjs';
export const roster=['chat-pris-tea','nokouki','kevin-74000'];
export const parisDay=(date=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export const playerName=name=>roster.find(p=>p===String(name).trim().toLowerCase())||null;
const validDay=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
const bounded=(n,max=1000000)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
function normalize(r,includeOthers){
 if(!r||typeof r.MatchGuid!=='string'||!r.MatchGuid.trim()||r.MatchGuid.length>128||typeof r.PlayerId!=='string'||!r.PlayerId||r.PlayerId.length>256)throw Error('Identifiants invalides.');
 if(!validDay(r.Day)||!['match','test'].includes(r.Kind)||![0,1].includes(r.Team)||![0,1].includes(r.Winner))throw Error('Résultat invalide.');
 if(![r.Score,r.Goals,r.Assists,r.Saves].every(n=>bounded(n)))throw Error('Statistiques invalides.');
 const name=playerName(r.Name)||(includeOthers&&typeof r.Name==='string'&&r.Name.trim().length>0&&r.Name.length<=128?r.Name.trim():null);if(!name){if(includeOthers)throw Error('Nom du joueur invalide.');return null;}
 return {matchGuid:r.MatchGuid,playerId:r.PlayerId,name,day:r.Day,kind:r.Kind,team:r.Team,winner:r.Winner,score:r.Score,goals:r.Goals,assists:r.Assists,saves:r.Saves};
}
export function normalizeResult(r){return normalize(r,false);}
export function normalizeParticipant(r){return normalize(r,true);}
// count is repetitions for pushups/crunches and whole seconds for plank.
// Whole seconds keep every credit exact (one second = a quarter pushup).
export const exerciseTypes=['pushups','plank','crunches'];
export const exerciseType=e=>e.type===undefined?'pushups':e.type;
export const pushupCredit=e=>e.count*(exerciseType(e)==='plank'?0.25:exerciseType(e)==='crunches'?0.5:1);
export function exerciseEffect(remaining,exercise){
 const equivalent=pushupCredit(exercise),reduction=Math.min(remaining,equivalent);
 return {equivalent,reduction,remaining:Math.max(0,remaining-equivalent),excess:Math.max(0,equivalent-remaining)};
}
export const formatNumber=n=>new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(n);
export function exerciseDescription(e){
 const type=exerciseType(e);
 return type==='plank'?`${formatNumber(e.count/60)} min de gainage`:type==='crunches'?`${formatNumber(e.count)} abdos`:`${formatNumber(e.count)} pompes`;
}
export function validateExercise(x){
 if(!x||typeof x.id!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(x.id)||!roster.includes(x.player)||!exerciseTypes.includes(exerciseType(x))||!bounded(x.count,exerciseType(x)==='plank'?60000:10000)||x.count===0||!validDay(x.day))throw Error('Déclaration invalide.');
 return {id:x.id,player:x.player,type:exerciseType(x),count:x.count,day:x.day};
}
export function summarize(rows,exercises,day,rosters=[],rule=lastPlaceRule){const matches=matchIndex(rows,rosters);return roster.map(name=>{
 const all=rows.filter(r=>r.name===name&&r.kind==='match'),selected=all.filter(r=>!day||r.day===day),due=all.reduce((sum,r)=>sum+(r.team!==r.winner?5:0)+lastPlaceBonus(r,matches,rule),0);
 const performed=exercises.filter(e=>e.player===name),done=performed.reduce((s,e)=>s+pushupCredit(e),0);
 const total=type=>performed.filter(e=>exerciseType(e)===type).reduce((s,e)=>s+e.count,0);
 return {name,played:selected.length,wins:selected.filter(r=>r.team===r.winner).length,losses:selected.filter(r=>r.team!==r.winner).length,due,done,pushups:total('pushups'),plankSeconds:total('plank'),crunches:total('crunches'),remaining:Math.max(0,due-done)};
 });}

export function dailyRecap(rows,day,rosters=[],rule=lastPlaceRule){
 if(!validDay(day))throw Error('Date du récap invalide.');
 const players=roster.map(name=>({name,played:0,wins:0,losses:0,lowest:0,lowestTies:0,compared:0,unranked:0,bonus:0,generated:0}));
 const byName=new Map(players.map(p=>[p.name,p])),matches=matchIndex(rows.filter(r=>r.day===day),rosters);
 let matchCount=0;
 for(const match of matches.values()){
  const tracked=[...match.players.values()].filter(r=>byName.has(r.name));
  if(!tracked.length)continue;matchCount++;
  for(const row of tracked){
   const p=byName.get(row.name);p.played++;if(row.team===row.winner)p.wins++;else p.losses++;
   if(match.complete){p.compared++;if(row.score===match.minimum){p.lowest++;if(match.last.length>1)p.lowestTies++;}}
   p.bonus+=lastPlaceBonus(row,matches,rule);
  }
 }
 for(const p of players){p.unranked=p.played-p.compared;p.generated=p.losses*5+p.bonus;}
 return {day,matchCount,players};
}
