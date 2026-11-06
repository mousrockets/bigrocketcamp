import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,loadRoute} from './helpers/exercise-fixture.mjs';
import {publicProfiles} from '../lib/public-ranks.mjs';
import {publicProfileHtml,publicStamp} from './helpers/public-profile.mjs';
import {readMonthlyMmr,closeMonthlyMmr} from '../lib/monthly-mmr.mjs';
const pages=()=>publicProfiles.map((p,i)=>({player:p.player,html:publicProfileHtml(p,{mmr:1500-i*100,stamp:publicStamp()})}));
const own=f=>publicProfiles.forEach((p,i)=>f.db.prepare('INSERT INTO player_identities (slot,owner,player_id) VALUES (?,?,?)').run(p.player,i===0?'current-user':`other-${i}`,`Epic|internal-test-${i}|0`));

test('Import service : clé dédiée obligatoire, aucun accès Epic ou lecture externe, trois MMR persistés',async t=>{
 const f=await fixture({legacy:false});try{own(f);let network=0;t.mock.method(globalThis,'fetch',async()=>{network++;throw Error('No network');});
  assert.equal((await f.importPublic(pages(),'wrong-key')).status,401);assert.equal((await f.importPublic(pages(),'')).status,401);
  const response=await f.importPublic(pages());assert.equal(response.status,200);const result=await response.json();assert.equal(result.updated.length,3);assert.equal(network,0);
  const state=await (await f.readState()).json();assert.deepEqual(state.monthly.current.rows.map(r=>r.mmr),[1500,1400,1300]);assert.ok(state.doublesRanks.every(r=>r.status==='public'));assert.ok(!JSON.stringify(state).includes(f.env.PUBLIC_MMR_IMPORT_KEY));assert.ok(!JSON.stringify(state.monthly).includes('internal-test'));
 }finally{f.db.close();}
});
test('Import : source inconnue, doublon de joueur et corps trop grand rejetés sans écriture',async()=>{
 const f=await fixture({legacy:false});try{own(f);assert.equal((await f.importPublic([{player:'unknown',html:'x'}])).status,400);const p=pages()[0];assert.equal((await f.importPublic([p,p])).status,400);assert.equal((await f.importPublic([{player:p.player,html:'x'.repeat(1550001)}])).status,413);assert.equal(f.db.prepare('SELECT count(*) n FROM mmr_entries').get().n,0);
 }finally{f.db.close();}
});
test('Import MCP : seul le propriétaire configuré, lectures ouvertes aux membres, fermeture sans requête externe',async t=>{
 const f=await fixture({legacy:false});try{own(f);let network=0;t.mock.method(globalThis,'fetch',async()=>{network++;throw Error('No network');});
  const route=await loadRoute('../../app/mcp/route.ts',{env:f.env,getChatGPTUser:async()=>f.actor.user,readMonthlyMmr,closeMonthlyMmr});
  const call=async(name,args={})=>{const response=await route.POST(new Request('https://rl.example/mcp',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}));return {status:response.status,...await response.json()};};
  f.actor.user={userId:'other-1'};const denied=await call('import_public_mmr',{pages:pages()});assert.equal(denied.result.isError,true);assert.equal(f.db.prepare('SELECT count(*) n FROM mmr_entries').get().n,0);
  const read=await call('get_monthly_mmr');assert.equal(JSON.parse(read.result.content[0].text).canImportPublicMmr,false);
  f.actor.user={userId:'current-user'};const accepted=await call('import_public_mmr',{pages:pages()});assert.equal(JSON.parse(accepted.result.content[0].text).updated.length,3);
  assert.equal(JSON.parse((await call('get_monthly_mmr')).result.content[0].text).canImportPublicMmr,true);await call('close_monthly_mmr');assert.equal(network,0);
  f.actor.user=null;assert.equal((await call('import_public_mmr',{pages:pages()})).status,401);
 }finally{f.db.close();}
});
test('Import partiel : profil privé, périmé ou ambigu conservé comme manquant, aucune donnée inventée',async()=>{
 const f=await fixture({legacy:false});try{own(f);const response=await f.importPublic([{player:publicProfiles[0].player,html:'<h1>Connexion requise</h1>'}]);const result=await response.json();assert.equal(result.updated.length,0);assert.equal(result.errors.length,3);assert.equal(f.db.prepare('SELECT count(*) n FROM mmr_entries').get().n,0);
 }finally{f.db.close();}
});
