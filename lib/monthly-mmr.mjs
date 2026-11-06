import {roster,parisDay} from './domain.mjs';
import {readPlayerIdentities} from './player-identities.mjs';
import {projectMmrRankWrite,mmrObservedAt,publicCloseFreshMs} from './mmr-ledger.mjs';
import {readPublicMmrStatus} from './public-ranks.mjs';

export const monthCloseGraceMs=300000;
const undoMs=86400000;
const localParts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export const parisMonth=(now=Date.now())=>parisDay(new Date(now)).slice(0,7);
function validMonth(month){if(typeof month!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw Error('Mois invalide.');return month;}
export function nextMonth(month){validMonth(month);const [year,m]=month.split('-').map(Number);return new Date(Date.UTC(year,m,1)).toISOString().slice(0,7);}
function midnightParis(day){
 const target=Date.parse(day+'T00:00:00Z');let guess=target;
 for(let i=0;i<3;i++){const p=Object.fromEntries(localParts.formatToParts(new Date(guess)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));const wall=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute),Number(p.second));guess+=target-wall;}
 return guess;
}
export function monthBounds(month){
 validMonth(month);const following=nextMonth(month),lastDay=new Date(Date.parse(following+'-01T12:00:00Z')-86400000).toISOString().slice(0,10);
 return {month,startAt:new Date(midnightParis(month+'-01')).toISOString(),lastDay,lastDayStartAt:new Date(midnightParis(lastDay)).toISOString(),cutoffAt:new Date(midnightParis(following+'-01')).toISOString()};
}
export function monthlyRanking(entries,month,{live=false}={}){
 const bounds=monthBounds(month);
 const admissible=e=>e.source==='rlstats'?Date.parse(mmrObservedAt(e))>=Date.parse(bounds.cutoffAt)-publicCloseFreshMs:mmrObservedAt(e)>=bounds.lastDayStartAt;
 const rows=roster.map(player=>{
  const candidates=entries.filter(e=>e.player===player&&mmrObservedAt(e)>=bounds.startAt&&mmrObservedAt(e)<bounds.cutoffAt&&(e.source!=='rlstats'||Date.parse(e.recorded_at)<=Date.parse(bounds.cutoffAt)+monthCloseGraceMs)).sort((a,b)=>mmrObservedAt(a).localeCompare(mmrObservedAt(b))||a.recorded_at.localeCompare(b.recorded_at)||Number(a.sequence??0)-Number(b.sequence??0));
  const latest=(live?null:candidates.filter(admissible).at(-1))||candidates.at(-1),observed=latest?mmrObservedAt(latest):null;
  const confirmed=!!latest&&admissible(latest);
  return {player,mmr:latest?.mmr??null,recordedAt:observed,source:latest?.source??'manual',sourceUrl:latest?.source_url??null,confirmedForClose:confirmed};
 }).sort((a,b)=>(b.mmr??-1)-(a.mmr??-1)||roster.indexOf(a.player)-roster.indexOf(b.player));
 const missing=rows.filter(r=>!r.confirmedForClose).map(r=>r.player);
 if(missing.length)return {...bounds,rows,status:'incomplete',missing,losers:[],debts:[]};
 const minimum=Math.min(...rows.map(r=>r.mmr)),last=rows.filter(r=>r.mmr===minimum);
 if(last.length!==1)return {...bounds,rows,status:'tied',missing:[],losers:last.map(r=>r.player),debts:[]};
 const payer=last[0].player;
 return {...bounds,rows,status:'final',missing:[],losers:[payer],debts:roster.filter(r=>r!==payer).map(recipient=>({id:`${month}:${payer}:${recipient}`,month,payer,recipient}))};
}
export function validateMmrEntry(input){
 const {id,player,mmr,tier=null,division=null}=input||{};
 if(typeof id!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(id)||!roster.includes(player)||!Number.isSafeInteger(mmr)||mmr<0||mmr>10000)throw Error('Saisis un MMR 2v2 entier entre 0 et 10 000.');
 if(tier!==null&&(!Number.isSafeInteger(tier)||tier<0||tier>22))throw Error('Rang invalide.');
 if(tier!==null&&tier>0&&tier<22&&(!Number.isSafeInteger(division)||division<1||division>4))throw Error('Choisis une division de I à IV.');
 if((tier===null||tier===0||tier===22)&&division!==null)throw Error('Ce rang ne comporte pas de division.');
 return {id,player,mmr,tier,division};
}
async function policy(db,now){await db.prepare('INSERT INTO monthly_mmr_policy (id,starts_month) VALUES (1,?) ON CONFLICT(id) DO NOTHING').bind(parisMonth(now)).run();return db.prepare('SELECT starts_month FROM monthly_mmr_policy WHERE id=1').first();}
const entries=db=>db.prepare('SELECT rowid AS sequence,id,player,mmr,tier,division,recorded_at,source,source_at,source_url FROM mmr_entries ORDER BY recorded_at,rowid').all();
export async function recordMmr(db,userId,input){
 const value=validateMmrEntry(input),identity=(await readPlayerIdentities(db,userId)).find(i=>i.slot===value.player);
 if(!identity)throw Object.assign(Error('Chaque joueur doit renseigner son propre MMR.'),{status:403});
 const old=await db.prepare('SELECT player,mmr,tier,division,author FROM mmr_entries WHERE id=?').bind(value.id).first();
 if(old&&!(old.author===userId&&['player','mmr','tier','division'].every(key=>old[key]===value[key])))throw Object.assign(Error('Cette déclaration existe avec un autre contenu.'),{status:409});
 await policy(db,Date.now());
 const writes=[db.prepare('INSERT INTO mmr_entries (id,player,mmr,tier,division,author) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(value.id,value.player,value.mmr,value.tier,value.division,userId),
 projectMmrRankWrite(db,{playerId:identity.player_id,id:value.id,author:userId,player:value.player})];
 await db.batch(writes);
 const saved=await db.prepare('SELECT player,mmr,tier,division,author FROM mmr_entries WHERE id=?').bind(value.id).first();
 if(!saved||saved.author!==userId||!['player','mmr','tier','division'].every(key=>saved[key]===value[key]))throw Object.assign(Error('Cette déclaration existe avec un autre contenu.'),{status:409});
 return {ok:true,player:value.player};
}
export async function closeMonthlyMmr(db,now=Date.now()){
 const config=await policy(db,now),all=(await entries(db)).results,current=parisMonth(now);let closed=0;
 const existing=(await db.prepare('SELECT month FROM monthly_mmr_results').all()).results.map(r=>r.month);
 for(let month=config.starts_month;month<current&&closed<24;month=nextMonth(month)){
  const bounds=monthBounds(month);if(now<Date.parse(bounds.cutoffAt)+monthCloseGraceMs||existing.includes(month))continue;
  const snapshot=monthlyRanking(all,month),payload=JSON.stringify(snapshot),closedAt=new Date(now).toISOString();
  const writes=[db.prepare('INSERT INTO monthly_mmr_results (month,cutoff_at,closed_at,status,snapshot) VALUES (?,?,?,?,?) ON CONFLICT(month) DO NOTHING').bind(month,bounds.cutoffAt,closedAt,snapshot.status,payload)];
  for(const debt of snapshot.debts)writes.push(db.prepare("INSERT INTO drink_debts (id,month,payer,recipient) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM monthly_mmr_results WHERE month=? AND snapshot=? AND status='final') ON CONFLICT(id) DO NOTHING").bind(debt.id,debt.month,debt.payer,debt.recipient,month,payload));
  await db.batch(writes);closed++;
 }
 return {ok:true,closed,month:current};
}
export async function settleDrink(db,userId,id,undo=false,now=Date.now()){
 if(typeof id!=='string'||id.length>160)throw Error('Dette invalide.');
 const debt=await db.prepare('SELECT * FROM drink_debts WHERE id=?').bind(id).first();
 if(!debt)throw Object.assign(Error('Dette introuvable.'),{status:404});
 const own=(await readPlayerIdentities(db,userId)).map(i=>i.slot);
 if(!own.includes(debt.payer)&&!own.includes(debt.recipient))throw Object.assign(Error('Seuls les deux joueurs concernés peuvent confirmer la boisson.'),{status:403});
 if(undo){if(debt.paid_by!==userId||!debt.paid_at||now-Date.parse(debt.paid_at)>undoMs)throw Object.assign(Error('Annulation disponible pendant 24 h pour son auteur.'),{status:403});await db.prepare('UPDATE drink_debts SET paid_at=NULL,paid_by=NULL WHERE id=? AND paid_by=? AND paid_at=?').bind(id,userId,debt.paid_at).run();}
 else await db.prepare('UPDATE drink_debts SET paid_at=?,paid_by=? WHERE id=? AND paid_at IS NULL').bind(new Date(now).toISOString(),userId,id).run();
 return {ok:true};
}
export async function readMonthlyMmr(db,userId,now=Date.now()){
 const [all,closed,debts,identities,config,publicSync]=await Promise.all([entries(db),db.prepare('SELECT month,cutoff_at,closed_at,status,snapshot FROM monthly_mmr_results ORDER BY month DESC').all(),db.prepare('SELECT * FROM drink_debts ORDER BY month DESC,payer,recipient').all(),readPlayerIdentities(db,userId),db.prepare('SELECT starts_month FROM monthly_mmr_policy WHERE id=1').first(),readPublicMmrStatus(db)]);
 const allowedPlayers=identities.map(i=>i.slot),month=parisMonth(now),current=monthlyRanking(all.results,month,{live:true});
 const {debts:_preview,losers:_last,...live}=current;
 return {startsMonth:config?.starts_month??month,current:{...live,status:'live'},closed:closed.results.map(r=>({...JSON.parse(r.snapshot),closedAt:r.closed_at})),allowedPlayers,publicSync,debts:debts.results.map(d=>({id:d.id,month:d.month,payer:d.payer,recipient:d.recipient,paidAt:d.paid_at,canSettle:allowedPlayers.includes(d.payer)||allowedPlayers.includes(d.recipient),canUndo:!!d.paid_at&&d.paid_by===userId&&now-Date.parse(d.paid_at)<=undoMs}))};
}
