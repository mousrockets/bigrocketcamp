import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {normalizeResult,summarize,validateExercise,parisDay,pushupCredit,exerciseDescription,exerciseEffect} from '../lib/domain.mjs';
const base={MatchGuid:'match-1',PlayerId:'Epic|1',Name:'Nokouki',Day:'2026-11-04',Kind:'match',Team:0,Winner:1,Score:300,Goals:1,Assists:0,Saves:2};
test('Victoire selon l’équipe, pas selon un booléen fourni',()=>{const r=normalizeResult({...base,Victory:true});assert.equal(summarize([r],[],'')[1].due,5);assert.equal(summarize([{...r,team:1}],[],'')[1].wins,1);});
test('Tests bots exclus et entraînement sans GUID refusé',()=>{assert.throws(()=>normalizeResult({...base,MatchGuid:''}));assert.equal(summarize([normalizeResult({...base,Kind:'test'})],[],'')[1].played,0);});
test('Total réalisé conservé au-delà de la dette et dates filtrées',()=>{const r=normalizeResult(base),s=summarize([r],[{player:'nokouki',count:25}],'2026-11-05')[1];assert.deepEqual([s.played,s.due,s.done,s.remaining],[0,5,25,0]);});
test('Rejet des pompes négatives, fractions et dates invalides',()=>{const x={id:'1234567890123456',player:'nokouki',count:5,day:'2026-11-04'};for(const patch of [{count:-1},{count:1.5},{count:0},{day:'2026-02-31'},{player:'intrus'}])assert.throws(()=>validateExercise({...x,...patch}));assert.equal(validateExercise(x).count,5);});
test('Jour français en franchissant minuit UTC',()=>assert.equal(parisDay(new Date('2026-11-04T23:30:00Z')),'2026-11-05'));
test('Clé SQL match + joueur et déclaration idempotente',()=>{const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../drizzle/0000_real_rattler.sql',import.meta.url),'utf8'));const insert=db.prepare('INSERT INTO results VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(match_guid,player_id) DO NOTHING');for(let i=0;i<3;i++)insert.run('m','p','nokouki','2026-11-04','match',0,1,10,0,0,0,'now');insert.run('m','p2','chat-pris-tea','2026-11-04','match',0,1,10,0,0,0,'now');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM results').get().n,2);const ex=db.prepare('INSERT INTO exercises VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING');ex.run('id','nokouki',5,'2026-11-04','now','u');ex.run('id','nokouki',5,'2026-11-04','now','u');assert.equal(db.prepare('SELECT SUM(count) AS n FROM exercises').get().n,5);db.close();});
test('Validation PS5 et normalisation du nom',()=>assert.equal(normalizeResult({...base,Name:'kevin-74000',PlayerId:'PSN|123'}).name,'kevin-74000'));
test('Une mise à jour tardive enrichit le match sans le recompter',()=>{
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../drizzle/0000_real_rattler.sql',import.meta.url),'utf8'));
 const route=readFileSync(new URL('../app/api/ingest/route.ts',import.meta.url),'utf8');
 const sql=route.match(/db\.prepare\("(INSERT INTO results[^"\n]+)"\)/)[1];const insert=db.prepare(sql);
 insert.run('m','p','nokouki','2026-11-04','test',0,1,10,0,0,0,'now');
 insert.run('m','p','nokouki','2026-11-04','match',0,1,100,1,0,0,'later');
 insert.run('m','p','nokouki','2026-11-04','test',0,1,10,0,0,0,'old-pc');
 const rows=db.prepare('SELECT * FROM results').all();assert.equal(rows.length,1);assert.equal(rows[0].score,100);assert.equal(rows[0].kind,'match');assert.equal(summarize(rows,[],'')[1].due,5);db.close();
});
test('30 pompes dues, 1 minute de gainage et 20 abdos laissent 5 pompes',()=>{
 const rows=Array.from({length:6},()=>normalizeResult(base));
 const exercises=[{player:'nokouki',type:'plank',count:60},{player:'nokouki',type:'crunches',count:20}];
 const s=summarize(rows,exercises,'2026-11-04')[1];
 assert.deepEqual([s.due,s.done,s.remaining,s.pushups,s.plankSeconds,s.crunches],[30,25,5,0,60,20]);
});
test('Anciens exercices, fractions exactes et séparation des joueurs et des jours',()=>{
 const rows=[normalizeResult(base),normalizeResult({...base,Kind:'test'})];
 const exercises=[{player:'nokouki',count:2},{player:'nokouki',type:'plank',count:15},{player:'nokouki',type:'crunches',count:1},{player:'chat-pris-tea',type:'plank',count:60}];
 const [other,s]=summarize(rows,exercises,'2026-11-05');
 assert.deepEqual([s.played,s.due,s.done,s.remaining,s.pushups,s.plankSeconds,s.crunches],[0,5,6.25,0,2,15,1]);
 assert.deepEqual([other.done,other.plankSeconds],[15,60]);
 assert.equal(pushupCredit({type:'plank',count:1}),0.25);
 assert.equal(exerciseDescription({type:'plank',count:90}),'1,5 min de gainage');
 assert.equal(exerciseDescription({count:2}),'2 pompes');
 assert.equal(exerciseDescription({type:'crunches',count:20}),'20 abdos');
});
test('Types et quantités d’exercices validés, ancien format accepté',()=>{
 const x={id:'1234567890123456',player:'nokouki',count:5,day:'2026-11-04'};
 assert.equal(validateExercise(x).type,'pushups');
 for(const type of ['pushups','plank','crunches'])assert.equal(validateExercise({...x,type}).type,type);
 for(const patch of [{type:'course'},{type:null},{type:''},{count:Infinity},{count:NaN},{count:'20'},{type:'plank',count:0},{type:'plank',count:0.5},{type:'plank',count:60001},{type:'crunches',count:1.5},{type:'crunches',count:10001}])assert.throws(()=>validateExercise({...x,...patch}));
});
test('Une série excédentaire annonce uniquement la dette réellement réduite',()=>{
 assert.deepEqual(exerciseEffect(5,{type:'pushups',count:20}),{equivalent:20,reduction:5,remaining:0,excess:15});
 assert.deepEqual(exerciseEffect(0,{type:'pushups',count:20}),{equivalent:20,reduction:0,remaining:0,excess:20});
 assert.deepEqual(exerciseEffect(5,{type:'plank',count:60}),{equivalent:15,reduction:5,remaining:0,excess:10});
 assert.deepEqual(exerciseEffect(5,{type:'crunches',count:20}),{equivalent:10,reduction:5,remaining:0,excess:5});
 assert.deepEqual(exerciseEffect(3.75,{type:'pushups',count:5}),{equivalent:5,reduction:3.75,remaining:0,excess:1.25});
 assert.deepEqual(exerciseEffect(5,{type:'pushups',count:2}),{equivalent:2,reduction:2,remaining:3,excess:0});
});
