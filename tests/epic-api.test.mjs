import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,loadRoute} from './helpers/exercise-fixture.mjs';
import {connectionStatus,beginLink,finishLink,disconnect,syncHistories,autoSync,recapState,retiredReason} from '../lib/epic-sync.mjs';
import {parisDay} from '../lib/domain.mjs';
test('Routes Epic réelles : identité et origine obligatoires, statut sans secrets',async()=>{
 const f=await fixture({legacy:false});try{
  const context={env:f.env,getChatGPTUser:async()=>f.actor.user,connectionStatus,beginLink,finishLink,disconnect,syncHistories,autoSync,retiredReason};
  const route=await loadRoute('../../app/api/epic/route.ts',context),request=origin=>new Request('https://rl.example/api/epic',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({action:'start',slot:'observer'})});
  assert.equal((await route.POST(request('https://other.example'))).status,403);f.actor.user=null;assert.equal((await route.POST(request('https://rl.example'))).status,401);assert.equal((await route.GET()).status,401);f.actor.user={userId:'current-user'};const state=await (await route.GET()).json();assert.equal(state.connections.length,4);assert.ok(!JSON.stringify(state).includes('tokens'));
 }finally{f.db.close();}
});
test('MCP réel : découverte sans données, outils personnels protégés et récap réconcilié',async()=>{
 const f=await fixture({legacy:false});try{
  const route=await loadRoute('../../app/mcp/route.ts',{env:f.env,getChatGPTUser:async()=>f.actor.user,connectionStatus,syncHistories,recapState,parisDay});
  const call=(method,params)=>route.POST(new Request('https://rl.example/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}));
  const discovery=await (await call('server/discover')).json();assert.deepEqual(discovery.result.supportedVersions,['2026-07-28']);const list=await (await call('tools/list')).json();assert.equal(list.result.tools.length,3);
  f.actor.user=null;assert.equal((await call('tools/call',{name:'sync_epic_histories'})).status,401);f.actor.user={userId:'current-user'};
  const recap=await (await call('tools/call',{name:'get_daily_recap',arguments:{day:'2026-11-04'}})).json();assert.equal(JSON.parse(recap.result.content[0].text).players.length,3);
  const invalid=await (await call('tools/call',{name:'get_daily_recap',arguments:{day:'2026-02-31'}})).json();assert.equal(invalid.result.isError,true);
 }finally{f.db.close();}
});
