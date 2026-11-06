import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,loadRoute} from './helpers/exercise-fixture.mjs';
import {connectionStatus,disconnect,syncHistories,autoSync,retiredReason,recapState} from '../lib/epic-sync.mjs';
import {parisDay} from '../lib/domain.mjs';
for(const action of ['start','poll','sync','auto','mcp'])test(`Ancien client ${action} : aucune connexion ni tâche de fond, même après réactivation de l'ancien flag`,async t=>{
 const f=await fixture({legacy:false});try{
  f.env.EPIC_COLLECTION_PAUSED='false';f.env.EPIC_VAULT_KEY='synthetic-key';let external=0,retained=0;t.mock.method(globalThis,'fetch',async()=>{external++;throw Error('Forbidden');});
  const context={env:f.env,waitUntil(){retained++;},getChatGPTUser:async()=>f.actor.user,connectionStatus,disconnect,syncHistories,autoSync,retiredReason,recapState,parisDay};
  const route=await loadRoute(action==='mcp'?'../../app/mcp/route.ts':'../../app/api/epic/route.ts',context);
  const request=()=>new Request('https://club.example/'+(action==='mcp'?'mcp':'api/epic'),{method:'POST',headers:{origin:'https://club.example','Content-Type':'application/json'},body:JSON.stringify(action==='mcp'?{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'sync_epic_histories'}}:{action,slot:'observer'})});
  const response=await route.POST(request());assert.equal(response.status,['start','poll'].includes(action)?410:200);const data=await response.json();assert.equal(action==='mcp'?JSON.parse(data.result.content[0].text).retired:data.retired,true);assert.equal(external,0);assert.equal(retained,0);
  f.actor.user=null;assert.equal((await route.POST(request())).status,401);
 }finally{f.db.close();}
});
