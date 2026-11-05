import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRoute} from './helpers/exercise-fixture.mjs';

for(const action of ['sync','auto','mcp'])test(`Collecte ${action} : retenir la lecture unique avant sa réponse, accès toujours contrôlé`,async()=>{
 let resolve;const run=new Promise(done=>{resolve=done;});
 const retained=[],calls=[],actor={userId:'synthetic-member'};
 const context={env:{},waitUntil:p=>retained.push(p),getChatGPTUser:async()=>actor.userId?actor:null,syncHistories:(env,owner)=>{calls.push(['sync',owner]);return run;},autoSync:()=>{calls.push(['auto']);return run;}};
 const route=await loadRoute(action==='mcp'?'../../app/mcp/route.ts':'../../app/api/epic/route.ts',context);
 const request=()=>new Request(`https://club.example/${action==='mcp'?'mcp':'api/epic'}`,{method:'POST',headers:{origin:'https://club.example','Content-Type':'application/json'},body:JSON.stringify(action==='mcp'?{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'sync_epic_histories'}}:{action})});
 const response=route.POST(request());await new Promise(done=>setImmediate(done));
 assert.equal(calls.length,1);assert.deepEqual(retained,[run]);
 if(action!=='auto')assert.equal(calls[0][1],'synthetic-member');
 resolve({synced:1});const json=await (await response).json();assert.equal(action==='mcp'?JSON.parse(json.result.content[0].text).synced:json.synced,1);
 actor.userId=null;await route.POST(request());assert.equal(calls.length,1);assert.equal(retained.length,1);
});
