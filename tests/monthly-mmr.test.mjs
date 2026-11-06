import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,loadRoute} from './helpers/exercise-fixture.mjs';
import {roster,parisDay} from '../lib/domain.mjs';
import {monthBounds,monthlyRanking,recordMmr,closeMonthlyMmr,readMonthlyMmr,settleDrink,validateMmrEntry} from '../lib/monthly-mmr.mjs';
import {readDoublesRanks} from '../lib/doubles-ranks.mjs';
import {connectionStatus,syncHistories,recapState} from '../lib/epic-sync.mjs';

const finalDay='2026-11-30T21:00:00.000Z',closure=Date.parse('2026-11-30T23:05:00Z');
const declarations=(values=[1200,1100,1000],at=finalDay)=>values.flatMap((mmr,i)=>mmr===null?[]:[{player:roster[i],mmr,recorded_at:at}]);
const input=(player=roster[0],mmr=1200,id=crypto.randomUUID())=>({id,player,mmr});
function owners(f){for(const [i,player] of roster.entries())f.db.prepare('INSERT INTO player_identities (slot,owner,player_id) VALUES (?,?,?)').run(player,i===0?'current-user':`member-${i}`,`Epic|synthetic-${i}|0`);}
function seed(f,values,at=finalDay){for(const e of declarations(values,at))f.db.prepare('INSERT INTO mmr_entries (id,player,mmr,author,recorded_at) VALUES (?,?,?,?,?)').run(crypto.randomUUID(),e.player,e.mmr,'synthetic-author',e.recorded_at);}
const debts=f=>f.db.prepare('SELECT * FROM drink_debts ORDER BY recipient').all();

test('Mois civils Paris : hiver, année suivante, février bissextile et deux changements d’heure',()=>{
 const november=monthBounds('2026-11');assert.equal(november.startAt,'2026-10-31T23:00:00.000Z');assert.equal(november.cutoffAt,'2026-11-30T23:00:00.000Z');assert.equal(november.lastDay,'2026-11-30');
 assert.equal(monthBounds('2026-12').cutoffAt,'2026-12-31T23:00:00.000Z');assert.equal(monthBounds('2028-02').lastDay,'2028-02-29');
 for(const [month,hours] of [['2026-03',743],['2026-10',745]]){const b=monthBounds(month);assert.equal((Date.parse(b.cutoffAt)-Date.parse(b.startAt))/3600000,hours);}
 assert.throws(()=>monthBounds('2026-13'));assert.throws(()=>monthBounds('no-month'));
});
for(const [values,status,count] of [[[1200,1100,1000],'final',2],[[1200,1000,1000],'tied',0],[[1000,1000,1000],'tied',0],[[1200,1200,1000],'final',2],[[1200,1100,0],'final',2],[[1200,1100,null],'incomplete',0]]){
 test(`Clôture ${values.join('/')} : ${status}, ${count} boissons`,()=>{
  const result=monthlyRanking(declarations(values),'2026-11');assert.equal(result.status,status);assert.equal(result.debts.length,count);
  if(count){assert.deepEqual(result.debts.map(d=>d.recipient).sort(),[roster[0],roster[1]].sort());assert.ok(result.debts.every(d=>d.payer===roster[2]));}
 });
}
test('Seul le dernier relevé reçu avant minuit Paris compte ; un relevé ancien ne confirme pas la fin du mois',()=>{
 const all=declarations([1200,1100,1000]);all.push({player:roster[2],mmr:1300,recorded_at:'2026-11-30T22:59:59.999Z'});all.push({player:roster[1],mmr:0,recorded_at:'2026-11-30T23:00:00.000Z'});
 const result=monthlyRanking(all,'2026-11');assert.deepEqual(result.rows.map(r=>r.mmr),[1300,1200,1100]);assert.equal(result.debts[0].payer,roster[1]);
 const stale=monthlyRanking(declarations([1200,1100,1000],'2026-11-29T22:59:59.999Z'),'2026-11');assert.equal(stale.status,'incomplete');assert.equal(stale.missing.length,3);assert.equal(stale.debts.length,0);
});
test('Validation : valeurs entières uniquement, zéro valide, rang/division cohérents',()=>{
 for(const mmr of [-1,10001,1.5,NaN,'1200',null])assert.throws(()=>validateMmrEntry(input(roster[0],mmr)));
 assert.equal(validateMmrEntry(input(roster[0],0)).mmr,0);
 assert.throws(()=>validateMmrEntry({...input(),tier:17}));assert.throws(()=>validateMmrEntry({...input(),tier:22,division:1}));
 assert.equal(validateMmrEntry({...input(),tier:17,division:2}).division,2);
});
test('Route réelle : propriétaire seul, pas de date client, saisie idempotente, classement 2v2 mis à jour sans inventer le rang',async()=>{
 const f=await fixture({legacy:false});try{owners(f);f.resetDebt(5);const value=input();
  assert.equal((await f.monthly({action:'record',...input(roster[1])})).status,403);
  const before=Date.now();const saved=await f.monthly({action:'record',...value,recorded_at:'2020-01-01T00:00:00Z',month:'2020-01'});assert.equal(saved.status,200);
  const row=f.db.prepare('SELECT * FROM mmr_entries WHERE id=?').get(value.id);assert.ok(Date.parse(row.recorded_at)>=before-1000);
  assert.equal((await f.monthly({action:'record',...value})).status,200);assert.equal(f.db.prepare('SELECT count(*) AS n FROM mmr_entries').get().n,1);
  assert.equal((await f.monthly({action:'record',...value,mmr:1190})).status,409);
  const rank=(await readDoublesRanks(f.env.DB))[0];assert.equal(rank.mmr,1200);assert.equal(rank.label,'Rang non renseigné');assert.equal(rank.status,'manual');assert.equal(f.stats()[1].remaining,5);
  const state=await (await f.readState()).json();assert.equal(state.monthly.allowedPlayers[0],roster[0]);assert.equal(state.monthly.current.rows[0].mmr,1200);assert.ok(!JSON.stringify(state.monthly).includes('current-user'));assert.ok(!('debts' in state.monthly.current));
 }finally{f.db.close();}
});
test('Retry d’une ancienne déclaration au même milliseconde : conserver le dernier MMR affiché et classé',async()=>{
 const f=await fixture({legacy:false});try{owners(f);const first=input(roster[0],1200),last=input(roster[0],1250);
  await recordMmr(f.env.DB,'current-user',first);await recordMmr(f.env.DB,'current-user',last);
  f.db.prepare('UPDATE mmr_entries SET recorded_at=?').run(finalDay);f.db.prepare('UPDATE player_ranks SET fetched_at=?').run(finalDay);
  await recordMmr(f.env.DB,'current-user',last);await recordMmr(f.env.DB,'current-user',first);
  assert.equal(f.db.prepare('SELECT mmr FROM player_ranks').get().mmr,1250);assert.equal((await readMonthlyMmr(f.env.DB,'current-user',Date.parse(finalDay))).current.rows[0].mmr,1250);
 }finally{f.db.close();}
});
test('Clôture réelle : attendre la fin et la marge, pas de rétroactivité, deux boissons séparées des pompes',async()=>{
 const f=await fixture({legacy:false});try{seed(f);f.resetDebt(10);
  assert.equal((await closeMonthlyMmr(f.env.DB,Date.parse('2026-11-20T12:00:00Z'))).closed,0);
  assert.equal((await closeMonthlyMmr(f.env.DB,closure-1)).closed,0);assert.equal(debts(f).length,0);
  assert.equal((await closeMonthlyMmr(f.env.DB,closure)).closed,1);assert.equal(debts(f).length,2);assert.equal(f.stats()[1].remaining,10);
  assert.deepEqual(f.db.prepare('SELECT month,status FROM monthly_mmr_results').all().map(r=>({...r})),[{month:'2026-11',status:'final'}]);
  const archive=f.db.prepare('SELECT snapshot FROM monthly_mmr_results').get().snapshot;
  seed(f,[1500,1400,2000],'2026-11-30T23:01:00.000Z');await closeMonthlyMmr(f.env.DB,closure+1000);
  assert.equal(f.db.prepare('SELECT snapshot FROM monthly_mmr_results').get().snapshot,archive);assert.equal(debts(f).length,2);
 }finally{f.db.close();}
});
for(const [name,values,stale,status] of [['égalité',[1200,1000,1000],false,'tied'],['relevé absent',[1200,1100,null],false,'incomplete'],['valeurs trop anciennes',[1200,1100,1000],true,'incomplete']]){
 test(`${name} : bilan archivé sans dette, même si les anciens MMR Epic sont présents`,async()=>{
  const f=await fixture({legacy:false});try{for(const [i,p] of roster.entries())f.db.prepare('INSERT INTO player_ranks (player,player_id,playlist,mmr,status,last_attempt) VALUES (?,?,11,?,?,?)').run(p,'public-synthetic',1200-i*100,'frozen','2026-11-01T12:00:00Z');seed(f,values,stale?'2026-11-01T12:00:00.000Z':finalDay);
   await closeMonthlyMmr(f.env.DB,closure);assert.equal(f.db.prepare('SELECT status FROM monthly_mmr_results').get().status,status);assert.equal(debts(f).length,0);
  }finally{f.db.close();}
 });
}
test('Clôtures concurrentes et réessais : un seul bilan et une boisson par destinataire',async()=>{
 const f=await fixture({legacy:false});try{seed(f);await Promise.all([closeMonthlyMmr(f.env.DB,closure),closeMonthlyMmr(f.env.DB,closure)]);await closeMonthlyMmr(f.env.DB,closure+60000);assert.equal(f.db.prepare('SELECT count(*) AS n FROM monthly_mmr_results').get().n,1);assert.equal(debts(f).length,2);
 }finally{f.db.close();}
});
test('Boisson offerte : seuls les deux concernés, idempotence et annulation par auteur pendant 24 h',async()=>{
 const f=await fixture({legacy:false});try{owners(f);seed(f);await closeMonthlyMmr(f.env.DB,closure);const debt=debts(f).find(d=>d.recipient===roster[0]);
  await assert.rejects(settleDrink(f.env.DB,'member-1',debt.id,false,closure),e=>e.status===403);
  await settleDrink(f.env.DB,'current-user',debt.id,false,closure);await settleDrink(f.env.DB,'member-2',debt.id,false,closure+1000);
  assert.equal(f.db.prepare('SELECT paid_by FROM drink_debts WHERE id=?').get(debt.id).paid_by,'current-user');
  await assert.rejects(settleDrink(f.env.DB,'member-2',debt.id,true,closure+2000),e=>e.status===403);
  assert.equal((await readMonthlyMmr(f.env.DB,'current-user',closure+1000)).debts.find(d=>d.id===debt.id).canUndo,true);
  await assert.rejects(settleDrink(f.env.DB,'current-user',debt.id,true,closure+86400001),e=>e.status===403);
  await settleDrink(f.env.DB,'current-user',debt.id,true,closure+86400000);assert.equal(f.db.prepare('SELECT paid_at FROM drink_debts WHERE id=?').get(debt.id).paid_at,null);
 }finally{f.db.close();}
});
test('Routes et MCP : authentification, origine, limite de taille, clôture sans date forcée et sans réseau Epic',async()=>{
 const f=await fixture({legacy:false});const original=globalThis.fetch;let external=0;globalThis.fetch=async()=>{external++;throw Error('Unexpected network');};
 try{owners(f);assert.equal((await f.monthly({action:'record',...input()},'https://other.example')).status,403);assert.equal((await f.monthly({action:'record',padding:'x'.repeat(4000)})).status,413);
  f.actor.user=null;assert.equal((await f.readMonthly()).status,401);assert.equal((await f.monthly({action:'refresh'})).status,401);f.actor.user={userId:'current-user'};
  const route=await loadRoute('../../app/mcp/route.ts',{env:f.env,getChatGPTUser:async()=>f.actor.user,connectionStatus,syncHistories,recapState,parisDay,readMonthlyMmr,closeMonthlyMmr});
  const call=async(name,args={})=>(await (await route.POST(new Request('https://rl.example/mcp',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}))).json()).result;
  const read=JSON.parse((await call('get_monthly_mmr')).content[0].text);assert.equal(read.allowedPlayers[0],roster[0]);
  const close=JSON.parse((await call('close_monthly_mmr',{now:'2099-01-01',month:'2098-12'})).content[0].text);assert.equal(close.month,parisDay().slice(0,7));assert.equal(close.ok,true);assert.equal(external,0);
  f.actor.user=null;assert.equal((await call('get_monthly_mmr')),undefined);
 }finally{globalThis.fetch=original;f.db.close();}
});
