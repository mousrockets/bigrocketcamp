import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/exercise-fixture.mjs';
import {dailyRecap,parisDay} from '../lib/domain.mjs';
const base={MatchGuid:'complete-match',PlayerId:'Epic|p1|0',Name:'chat-pris-tea',Day:parisDay(),Kind:'match',Team:0,Winner:1,Score:200,Goals:1,Assists:0,Saves:1};
const payload={collector:'history-test',exercises:[],results:[base,{...base,PlayerId:'PSN|p2|0',Name:'adversaire',Team:1,Score:50}],matches:[{MatchGuid:base.MatchGuid,PlayerCount:2}]};

test('Collecte complète : adversaires conservés, métadonnées disponibles et doublons évités',async()=>{
 const f=await fixture({legacy:false});
 try{
  assert.equal((await f.ingest(payload)).status,200);assert.equal((await f.ingest(payload)).status,200);
  const state=await (await f.readState()).json();assert.equal(state.results.length,2);assert.equal(state.matchRosters.length,1);
  assert.ok(state.results.some(r=>r.name==='adversaire'));
  const p=dailyRecap(state.results,parisDay(),state.matchRosters,{enabled:true,effectiveFrom:'2026-11-05',ties:'none'}).players[0];
  assert.deepEqual([p.played,p.losses,p.lowest,p.generated],[1,1,0,5]);
 }finally{f.db.close();}
});

test('Ancien collecteur compatible, mais classement inconnu sans tableau complet',async()=>{
 const f=await fixture({legacy:false});
 try{
  const {matches,...legacy}=payload;assert.equal((await f.ingest({...legacy,results:[base]})).status,200);
  const state=await (await f.readState()).json();assert.equal(state.matchRosters.length,0);
  assert.equal(dailyRecap(state.results,parisDay(),state.matchRosters).players[0].unranked,1);
 }finally{f.db.close();}
});

test('Un tableau annoncé complet avec un joueur manquant est refusé avant toute écriture',async()=>{
 const f=await fixture({legacy:false});
 try{
  assert.equal((await f.ingest({...payload,matches:[{MatchGuid:base.MatchGuid,PlayerCount:4}]})).status,400);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM results').get().n,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM match_rosters').get().n,0);
  assert.equal((await f.ingest(payload,'bad-key')).status,401);
 }finally{f.db.close();}
});

test('Le gainage importé conserve son type et ses unités',async()=>{
 const f=await fixture({legacy:false});
 try{
  const exercise={id:'imported-plank-123456',player:'nokouki',type:'plank',count:60,day:parisDay()};
  assert.equal((await f.ingest({collector:'history-test',results:[],exercises:[exercise]})).status,200);
  assert.equal(f.stats()[1].done,15);assert.equal(f.stats()[1].plankSeconds,60);
 }finally{f.db.close();}
});
