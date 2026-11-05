export const roster=['chat-pris-tea','nokouki','kevin-74000'];
export const parisDay=(date=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export const playerName=name=>roster.find(p=>p===String(name).trim().toLowerCase())||null;
const validDay=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
const bounded=(n,max=1000000)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
export function normalizeResult(r){
 if(!r||typeof r.MatchGuid!=='string'||!r.MatchGuid.trim()||r.MatchGuid.length>128||typeof r.PlayerId!=='string'||!r.PlayerId||r.PlayerId.length>256)throw Error('Identifiants invalides.');
 if(!validDay(r.Day)||!['match','test'].includes(r.Kind)||![0,1].includes(r.Team)||![0,1].includes(r.Winner))throw Error('Résultat invalide.');
 if(![r.Score,r.Goals,r.Assists,r.Saves].every(n=>bounded(n)))throw Error('Statistiques invalides.');
 const name=playerName(r.Name);if(!name)return null;
 return {matchGuid:r.MatchGuid,playerId:r.PlayerId,name,day:r.Day,kind:r.Kind,team:r.Team,winner:r.Winner,score:r.Score,goals:r.Goals,assists:r.Assists,saves:r.Saves};
}
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
export function summarize(rows,exercises,day){return roster.map(name=>{
 const all=rows.filter(r=>r.name===name&&r.kind==='match'),selected=all.filter(r=>!day||r.day===day),due=all.filter(r=>r.team!==r.winner).length*5;
 const performed=exercises.filter(e=>e.player===name),done=performed.reduce((s,e)=>s+pushupCredit(e),0);
 const total=type=>performed.filter(e=>exerciseType(e)===type).reduce((s,e)=>s+e.count,0);
 return {name,played:selected.length,wins:selected.filter(r=>r.team===r.winner).length,losses:selected.filter(r=>r.team!==r.winner).length,due,done,pushups:total('pushups'),plankSeconds:total('plank'),crunches:total('crunches'),remaining:Math.max(0,due-done)};
 });}
