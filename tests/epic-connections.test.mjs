import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React,{act} from 'react';
import {create} from 'react-test-renderer';
import {transpileModule,ModuleKind,JsxEmit} from 'typescript';
import {fixture,loadRoute} from './helpers/exercise-fixture.mjs';
import {roster,summarize} from '../lib/domain.mjs';
import {readMerged,observationWrites} from '../lib/reconcile.mjs';
import {readPlayerIdentities,readIdentityBindings,attributeLivePlayers,canonicalPlayerId,unassignedPrefix} from '../lib/player-identities.mjs';
const source=readFileSync(new URL('../app/connexions/client.tsx',import.meta.url),'utf8');
const compiled=transpileModule(source,{compilerOptions:{module:ModuleKind.ESNext,jsx:JsxEmit.ReactJSX}}).outputText.replaceAll('"react/jsx-runtime"',JSON.stringify(import.meta.resolve('react/jsx-runtime'))).replaceAll("'react'",JSON.stringify(import.meta.resolve('react')));
const {default:Connections}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const content=node=>typeof node==='string'?node:node?.children?.map(content).join('')||'';
async function setup(){
 const f=await fixture({legacy:false});
 for(const [slot,owner,id] of [['chat-pris-tea','other-owner','Epic|synthetic-main|0'],['kevin-74000','current-user','Epic|synthetic-console-account|0']]){f.db.prepare('INSERT INTO player_identities (slot,owner,player_id) VALUES (?,?,?)').run(slot,owner,id);f.db.prepare('INSERT INTO player_identity_aliases VALUES (?,?,?,?)').run(id,slot,owner,'synthetic');}
 const rows=[{matchGuid:'synthetic-identity-game',playerId:'PS4|222222|0',name:unassignedPrefix+'kevin-74000',day:'2026-11-05',kind:'match',team:0,winner:1,score:100,goals:0,assists:0,saves:0},{matchGuid:'synthetic-identity-game',playerId:'Epic|opponent|0',name:'Opponent',day:'2026-11-05',kind:'match',team:1,winner:1,score:200,goals:0,assists:0,saves:0}];
 await f.env.DB.batch(await observationWrites(f.env.DB,{rows,rosters:[{matchGuid:'synthetic-identity-game',playerCount:2}],sourceId:'synthetic-local',sourceType:'collector'},'synthetic'));
 const context={env:f.env,getChatGPTUser:async()=>f.actor.user,roster,readMerged,readPlayerIdentities,readIdentityBindings,canonicalPlayerId,unassignedPrefix};
 const route=await loadRoute('../../app/api/identities/route.ts',context);
 const post=(body,origin='https://club.example')=>route.POST(new Request('https://club.example/api/identities',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)}));
 return {...f,route,post};
}
test('Identités : pseudo adverse non attribué, confirmation locale propriétaire seulement, aucun accès Epic',async t=>{
 const f=await setup();try{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('No external access');});
  const mapped=attributeLivePlayers([{playerId:'Epic|unknown|0',name:'nokouki'}],[]);assert.equal(mapped[0].name,unassignedPrefix+'nokouki');
  let merged=await readMerged(f.env.DB);assert.equal(summarize(merged.rows,[],'')[2].due,0);
  assert.equal((await f.post({slot:'chat-pris-tea',playerId:'PS4|222222|0'})).status,403);
  assert.equal((await f.post({slot:'kevin-74000',playerId:'PS4|999999|0'})).status,400);
  assert.equal((await f.post({slot:'kevin-74000',playerId:'PS4|222222|0'},'https://other.example')).status,403);
  assert.equal((await f.post({slot:'kevin-74000',playerId:'PS4|222222|0'})).status,200);
  merged=await readMerged(f.env.DB);assert.equal(summarize(merged.rows,[],'')[2].due,5);assert.equal(merged.rosters.length,1);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM result_observations').get().n,2);
  assert.equal((await f.post({slot:'kevin-74000',playerId:'PS4|222222|0',action:'remove'})).status,200);merged=await readMerged(f.env.DB);assert.equal(summarize(merged.rows,[],'')[2].due,0);assert.equal(calls,0);
  f.actor.user=null;assert.equal((await f.route.GET()).status,401);assert.equal((await f.post({slot:'kevin-74000',playerId:'PS4|222222|0'})).status,401);
 }finally{f.db.close();}
});
test('Vraie page des joueurs : aucun parcours OAuth, association console sans jeton et correction du tableau',async t=>{
 const f=await setup(),saved=new Map(),posts=[];let view;
 const override=(key,value)=>{saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});};
 try{
  override('IS_REACT_ACT_ENVIRONMENT',true);override('sessionStorage',{removeItem(){}});
  t.mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(url,'/api/identities');if(options){posts.push(JSON.parse(options.body));return f.post(posts.at(-1));}return f.route.GET();});
  const oldError=console.error;t.mock.method(console,'error',(message,...args)=>{if(!String(message).startsWith('react-test-renderer is deprecated'))oldError(message,...args);});
  await act(async()=>{view=create(React.createElement(Connections));await new Promise(done=>setImmediate(done));});
  assert.equal(posts.length,0);assert.match(content(view.toJSON()),/connexion communautaire Epic est retirée/);assert.ok(!view.root.findAllByType('button').some(b=>/Connecter ce compte|Vérifier l’autorisation/.test(content(b))));
  const select=view.root.findByProps({'aria-label':'Identifiant de kevin-74000'});
  await act(async()=>select.props.onChange({target:{value:'PS4|222222|0'}}));
  await act(async()=>{view.root.findAllByType('button').find(b=>content(b)==='Confirmer mon identifiant').props.onClick();await new Promise(done=>setTimeout(done,20));});
  assert.equal(posts.length,1);assert.match(content(view.toJSON()),/Identifiant confirmé/);const merged=await readMerged(f.env.DB);assert.equal(summarize(merged.rows,[],'')[2].played,1);
 }finally{if(view)await act(async()=>view.unmount());for(const [key,value] of saved){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}f.db.close();}
});
