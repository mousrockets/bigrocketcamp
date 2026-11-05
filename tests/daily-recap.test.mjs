import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyRecap,summarize} from '../lib/domain.mjs';
const day='2026-11-04';
const row=(match_guid,name,score,patch={})=>({match_guid,player_id:`Epic|${name}|0`,name,score,day,kind:'match',team:0,winner:1,received:'2026-11-05T08:00:00Z',...patch});
const complete=rows=>[...new Set(rows.map(r=>r.match_guid))].map(match_guid=>({match_guid,expected_players:rows.filter(r=>r.match_guid===match_guid).length}));
const rule={enabled:true,effectiveFrom:'2026-11-05',ties:'none'};

test('Récap quotidien : parties, défaites et minimum de tout le match',()=>{
 const rows=[row('loss','chat-pris-tea',50),row('loss','nokouki',100),row('loss','kevin-74000',300),row('loss','opponent',400,{team:1}),row('win','chat-pris-tea',300,{winner:0}),row('win','nokouki',100,{winner:0}),row('win','other',500,{team:1,winner:0})];
 const recap=dailyRecap(rows,day,complete(rows));assert.equal(recap.matchCount,2);
 assert.deepEqual(recap.players.map(p=>[p.name,p.played,p.wins,p.losses,p.lowest,p.compared,p.generated]),[
  ['chat-pris-tea',2,1,1,1,2,5],['nokouki',2,1,1,1,2,5],['kevin-74000',1,0,1,0,1,5],
 ]);
 assert.deepEqual(summarize(rows,[],day,complete(rows)).map(p=>p.due),[5,5,5]);
});

test('La date du match prime sur la réception tardive ; bots et autres jours exclus',()=>{
 const rows=[row('late','chat-pris-tea',50),row('late','nokouki',100),row('late','opponent',300,{team:1}),row('today','chat-pris-tea',20,{day:'2026-11-05'}),row('bot','chat-pris-tea',0,{kind:'test'})];
 const recap=dailyRecap(rows,day,complete(rows));assert.equal(recap.matchCount,1);assert.equal(recap.players[0].played,1);assert.equal(recap.players[0].lowest,1);
 assert.equal(dailyRecap(rows,'2026-11-05').players[0].played,1);
});

test('Une mise à jour de score ne crée pas de partie supplémentaire',()=>{
 const rows=[row('m','chat-pris-tea',10),row('m','nokouki',100),row('m','opponent',300,{team:1}),row('m','chat-pris-tea',200),row('m','nokouki',100)];
 const rosters=[{match_guid:'m',expected_players:3}];
 const a=dailyRecap(rows,day,rosters),b=dailyRecap([...rows].reverse(),day,rosters);assert.deepEqual(a,b);assert.equal(a.matchCount,1);
 assert.deepEqual(a.players.map(p=>[p.played,p.lowest]),[[1,0],[1,1],[0,0]]);
});

test('Un adversaire gagnant avec moins de points annule le supplément pour nos joueurs',()=>{
 const rows=[row('m','chat-pris-tea',200,{day:'2026-11-05'}),row('m','nokouki',300,{day:'2026-11-05'}),row('m','opponent-low',50,{team:1,day:'2026-11-05'}),row('m','opponent-high',400,{team:1,day:'2026-11-05'})];
 const recap=dailyRecap(rows,'2026-11-05',complete(rows),rule);
 assert.deepEqual(recap.players.slice(0,2).map(p=>[p.lowest,p.bonus,p.generated]),[[0,0,5],[0,0,5]]);
 assert.deepEqual(summarize(rows,[],'',complete(rows),rule).slice(0,2).map(p=>p.due),[5,5]);
});

test('Un perdant seul dernier du match prend +5 ; un gagnant dernier ne paie rien',()=>{
 const rows=[row('m','chat-pris-tea',20,{day:'2026-11-05'}),row('m','opponent',100,{team:1,day:'2026-11-05'})];
 const recap=dailyRecap(rows,'2026-11-05',complete(rows),rule);assert.equal(recap.players[0].generated,10);assert.equal(recap.players[0].bonus,5);
 assert.equal(summarize(rows,[],'',complete(rows),rule)[0].due,10);
 const win=rows.map(r=>({...r,winner:0}));assert.equal(dailyRecap(win,'2026-11-05',complete(win),rule).players[0].generated,0);
});

test('Égalité avec un adversaire : modes sans supplément ou chaque perdant ex æquo',()=>{
 const rows=[row('m','chat-pris-tea',0,{day:'2026-11-05'}),row('m','opponent',0,{team:1,day:'2026-11-05'})];
 const none=dailyRecap(rows,'2026-11-05',complete(rows),rule).players[0],all=dailyRecap(rows,'2026-11-05',complete(rows),{...rule,ties:'all'}).players[0];
 assert.deepEqual([none.lowest,none.lowestTies,none.generated],[1,1,5]);assert.equal(all.generated,10);
});

test('Sans effectif complet déclaré, aucun dernier ni supplément n’est inventé',()=>{
 const rows=[row('m','chat-pris-tea',0,{day:'2026-11-05'}),row('m','nokouki',100,{day:'2026-11-05'})];
 for(const rosters of [[],[{match_guid:'m',expected_players:4}]]){
  const p=dailyRecap(rows,'2026-11-05',rosters,rule).players[0];assert.deepEqual([p.lowest,p.compared,p.unranked,p.generated],[0,0,1,5]);
 }
});

test('Solo en 1 contre 1 : classement possible si les deux joueurs sont connus',()=>{
 const rows=[row('m','chat-pris-tea',0),row('m','adversaire',100,{team:1})];
 const p=dailyRecap(rows,day,complete(rows)).players[0];assert.equal(p.lowest,1);assert.equal(p.compared,1);
});

test('La nouvelle pénalité ne s’applique pas avant sa date d’effet',()=>{
 const rows=[row('m','chat-pris-tea',0),row('m','adversaire',100,{team:1})];
 assert.equal(dailyRecap(rows,day,complete(rows),rule).players[0].generated,5);
});

test('Journée vide, dates invalides et joueurs inconnus',()=>{
 const recap=dailyRecap([],day);assert.equal(recap.matchCount,0);assert.equal(recap.players.length,3);
 for(const p of recap.players)for(const key of ['played','wins','losses','lowest','lowestTies','compared','unranked','generated'])assert.equal(p[key],0);
 for(const invalid of ['',null,'2026-02-31','2026-1-1'])assert.throws(()=>dailyRecap([],invalid));
 assert.equal(dailyRecap([row('x','inconnu',10),row('','chat-pris-tea',10)],day).matchCount,0);
});
