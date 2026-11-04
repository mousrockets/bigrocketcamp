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
export function validateExercise(x){if(!x||typeof x.id!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(x.id)||!roster.includes(x.player)||!bounded(x.count,10000)||x.count===0||!validDay(x.day))throw Error('Déclaration invalide.');return {id:x.id,player:x.player,count:x.count,day:x.day};}
export function summarize(rows,exercises,day){return roster.map(name=>{const all=rows.filter(r=>r.name===name&&r.kind==='match'),selected=all.filter(r=>!day||r.day===day),due=all.filter(r=>r.team!==r.winner).length*5,done=exercises.filter(e=>e.player===name).reduce((s,e)=>s+e.count,0);return {name,played:selected.length,wins:selected.filter(r=>r.team===r.winner).length,losses:selected.filter(r=>r.team!==r.winner).length,due,done,remaining:Math.max(0,due-done)};});}
