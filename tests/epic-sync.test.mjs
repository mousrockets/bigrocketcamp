import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/exercise-fixture.mjs';
import {collectionPaused,connectionStatus,beginLink,finishLink,disconnect,syncHistories,autoSync,recapState} from '../lib/epic-sync.mjs';
const id='b'.repeat(32);
test('Retrait définitif : aucun appel externe même avec flag false et ancienne clé réintroduite',async t=>{
 const f=await fixture({legacy:false});try{
  f.env.EPIC_COLLECTION_PAUSED='false';f.env.EPIC_VAULT_KEY='synthetic-old-key';let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('External request forbidden');});
  assert.equal(collectionPaused(f.env),true);await assert.rejects(beginLink(f.env,'current-user','observer'),/retirée/);await assert.rejects(finishLink(f.env,'current-user','nokouki'),/retirée/);
  assert.equal((await syncHistories(f.env,'current-user')).retired,true);assert.equal((await autoSync(f.env)).ran,false);assert.equal(calls,0);
 }finally{f.db.close();}
});
test('Migration réelle : identités et propriétaires conservés, jetons et device grants supprimés, historique et MMR conservés',async()=>{
 const f=await fixture({legacy:true,beforeRetirement(db){
  for(const [slot,owner,account] of [['observer','current-user','a'.repeat(32)],['chat-pris-tea','current-user',id],['nokouki','friend-one','c'.repeat(32)],['kevin-74000','friend-two','d'.repeat(32)]])db.prepare("INSERT INTO epic_accounts (slot,owner,account_id,tokens,status,last_sync) VALUES (?,?,?,'synthetic-secret','synced','2026-11-05T12:00:00Z')").run(slot,owner,account);
  db.prepare('INSERT INTO epic_grants VALUES (?,?,?,?,?,?,?)').run('observer','current-user','synthetic-private-device',Date.now()+600000,0,5,0);
  db.prepare('INSERT INTO player_ranks VALUES (?,?,?,?,?,?,?,?,?,?)').run('nokouki','Epic|synthetic|0',11,1200,17,2,10,'2026-11-05T12:00:00Z','2026-11-05T12:00:00Z','ready');
  db.prepare('INSERT INTO results VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run('synthetic-old-match','Epic|synthetic|0','nokouki','2026-11-05','match',0,1,200,0,0,0,'synthetic');
 }});try{
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM epic_accounts').get().n,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM epic_grants').get().n,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM player_identities').get().n,3);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM player_identity_aliases').get().n,3);
  assert.equal(f.db.prepare("SELECT owner FROM player_identities WHERE slot='nokouki'").get().owner,'friend-one');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM results').get().n,1);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM exercises').get().n,1);
  const state=await connectionStatus(f.env,'current-user');assert.equal(state.retired,true);assert.equal(state.configured,false);assert.equal(state.vaultConfigured,false);assert.equal(state.credentialsStored.accounts,0);assert.equal(state.doublesRanks[1].mmr,1200);assert.equal(state.doublesRanks[1].status,'frozen');assert.ok(!JSON.stringify(state).includes('synthetic-secret'));assert.ok(!JSON.stringify(state).includes(id));
  const recap=await recapState(f.env,'2026-11-05');assert.equal(recap.players[1].played,1);assert.equal(recap.players[1].generated,5);
 }finally{f.db.close();}
});
test('Ancien bouton de retrait : propriétaires contrôlés, identité du Direct préservée',async()=>{
 const f=await fixture({legacy:false});try{
  f.db.prepare('INSERT INTO player_identities (slot,owner,player_id) VALUES (?,?,?)').run('chat-pris-tea','current-user',`Epic|${id}|0`);
  await assert.rejects(disconnect(f.env,'someone-else','chat-pris-tea'),/Seul/);await disconnect(f.env,'current-user','chat-pris-tea');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM player_identities').get().n,1);
 }finally{f.db.close();}
});
