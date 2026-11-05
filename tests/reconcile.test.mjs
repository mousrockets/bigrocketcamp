import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcile,observationWrites,readMerged} from '../lib/reconcile.mjs';
import {summarize,dailyRecap} from '../lib/domain.mjs';
import {fixture} from './helpers/exercise-fixture.mjs';
const row={match_guid:'m',player_id:'Epic|synthetic|0',name:'nokouki',day:'2026-11-04',kind:'match',team:0,winner:1,score:200,goals:1,assists:2,saves:0,received:'2026-11-05T10:00:00Z'};
const obs=(payload,type='epic',source='synthetic',received='2026-11-05T11:00:00Z')=>({match_guid:payload.match_guid,payload:JSON.stringify(payload),source_type:type,source_id:source,received});
test('Union des historiques : matchs communs une seule fois, anciens hors fenêtre conservés',()=>{
 const old=[row,{...row,match_guid:'old-only'}],epic=[obs(row),obs({...row,match_guid:'new-only'})];
 const result=reconcile(old,epic);assert.equal(result.rows.length,3);assert.equal(result.rows.find(r=>r.match_guid==='m').verification,'confirmed');assert.equal(summarize(result.rows,[],'')[1].due,15);
});
test('Correction Epic : résultat et statistiques proviennent intégralement du même relevé',()=>{
 const epic={...row,winner:0,score:100,goals:0,assists:0,saves:3};const merged=reconcile([row],[obs(epic)]),chosen=merged.rows[0];
 assert.deepEqual([chosen.winner,chosen.score,chosen.goals,chosen.assists,chosen.saves],[0,100,0,0,3]);assert.equal(chosen.verification,'corrected');assert.equal(summarize(merged.rows,[],'')[1].due,0);
});
test('Deux résultats PC contradictoires sont à vérifier, sans dette ni fausse victoire',()=>{
 const merged=reconcile([row],[obs({...row,winner:0},'collector','other')]);assert.equal(merged.rows[0].review_required,true);assert.equal(summarize(merged.rows,[],'')[1].played,0);assert.equal(dailyRecap(merged.rows,row.day).players[1].generated,0);
});
test('Une contradiction du même collecteur est conservée ; le passage test vers match reste valide',()=>{
 assert.equal(reconcile([],[obs(row,'collector'),obs({...row,winner:0},'collector')]).rows[0].review_required,true);
 assert.equal(reconcile([{...row,kind:'test'}],[obs(row,'collector')]).rows[0].review_required,false);
});
test('PSN et PS4 sont dédupliqués ; des identifiants différents ne sont pas fusionnés par pseudo',()=>{
 assert.equal(reconcile([{...row,player_id:'PSN|synthetic|0'}],[obs({...row,player_id:'PS4|synthetic|0'})]).rows.length,1);
 const result=reconcile([row],[obs({...row,player_id:'Epic|other|0'})]);assert.equal(result.rows.length,1);assert.equal(result.rows[0].source_difference,'identity');assert.equal(summarize(result.rows,[],'')[1].due,0);
});
test('Tableau complet seulement si un relevé cohérent correspond à toutes les lignes retenues',()=>{
 const opponent={...row,player_id:'Epic|opponent|0',name:'Adversaire',team:1};
 const report={match_guid:'m',expected_players:2,source_type:'epic',received:'now',players:JSON.stringify([row,opponent])};
 const complete=reconcile([],[obs(row),obs(opponent)],[],[report]);assert.equal(complete.rosters.length,1);
 const changed=reconcile([],[obs({...row,score:250}),obs(opponent)],[{match_guid:'m',expected_players:2}],[report]);assert.equal(changed.rosters.length,0);
});
test('Vraie route d’import : conservation des relevés, absence de MAX par colonne, répétition idempotente',async()=>{
 const f=await fixture({legacy:false});try{
  const player={MatchGuid:'m',PlayerId:row.player_id,Name:row.name,Day:row.day,Kind:'match',Team:0,Winner:1,Score:200,Goals:2,Assists:0,Saves:0};
  const send=results=>f.ingest({collector:'synthetic',results,exercises:[]});
  assert.equal((await send([player])).status,200);
  assert.equal((await send([{...player,Score:250,Goals:0,Saves:3}])).status,200);
  await send([{...player,Score:250,Goals:0,Saves:3}]);
  const state=await (await f.readState()).json();assert.equal(state.results.length,1);assert.equal(state.results[0].goals,0);assert.equal(state.results[0].saves,3);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM result_observations WHERE source_id='synthetic'").get().n,2);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM result_observations WHERE source_id='legacy'").get().n,1);
 }finally{f.db.close();}
});
