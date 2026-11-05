import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React,{act} from 'react';
import {create} from 'react-test-renderer';
import {transpileModule,ModuleKind,JsxEmit} from 'typescript';
import {fixture,loadRoute} from './helpers/exercise-fixture.mjs';
import {seal} from '../lib/epic-vault.mjs';
import {connectionStatus,beginLink,finishLink,disconnect,syncHistories,autoSync} from '../lib/epic-sync.mjs';
const source=readFileSync(new URL('../app/connexions/client.tsx',import.meta.url),'utf8');
const compiled=transpileModule(source,{compilerOptions:{module:ModuleKind.ESNext,jsx:JsxEmit.ReactJSX}}).outputText.replaceAll('"react/jsx-runtime"',JSON.stringify(import.meta.resolve('react/jsx-runtime'))).replaceAll("'react'",JSON.stringify(import.meta.resolve('react')));
const {default:Connections}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const content=node=>typeof node==='string'?node:node?.children?.map(content).join('')||'';
const key=Buffer.alloc(32,8).toString('base64'),slot='chat-pris-tea',owner='current-user',account='d'.repeat(32);
for(const authorized of [false,true])test(`Retour après Epic, page rechargée : ${authorized?'autorisation récupérée sans ressaisie':'bouton de vérification restauré même sans stockage navigateur'}`,async t=>{
 const f=await fixture({legacy:false});let renderer;const saved=new Map();
 const override=(name,value)=>{saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});};
 try{
  f.env.EPIC_VAULT_KEY=key;const expires=Date.now()+600000,encrypted=await seal({device:'synthetic-device'},key,`epic-grant:${owner}:${slot}`);
  f.db.prepare('INSERT INTO epic_grants (slot,owner,device,expires,next_poll,interval,lease_until) VALUES (?,?,?,?,0,5,0)').run(slot,owner,encrypted,expires);
  const routes=await loadRoute('../../app/api/epic/route.ts',{env:f.env,getChatGPTUser:async()=>f.actor.user,connectionStatus,beginLink,finishLink,disconnect,syncHistories,autoSync});
  const calls=[];
  override('IS_REACT_ACT_ENVIRONMENT',true);
  override('sessionStorage',{getItem(){throw Error('Storage blocked');},setItem(){throw Error('Storage blocked');},removeItem(){throw Error('Storage blocked');}});
  t.mock.method(globalThis,'setInterval',()=>1);t.mock.method(globalThis,'clearInterval',()=>{});
  t.mock.method(globalThis,'fetch',async(url,options)=>{
   if(String(url).startsWith('https://api.epicgames.dev/'))return Response.json(authorized?{account_id:account,access_token:'synthetic-access',refresh_token:'synthetic-refresh'}:{error:'authorization_pending'},{status:authorized?200:400});
   assert.equal(url,'/api/epic');if(options?.method==='POST'){calls.push(JSON.parse(options.body));return routes.POST(new Request('https://rl.example/api/epic',{...options,headers:{...options.headers,origin:'https://rl.example'}}));}return routes.GET();
  });
  const originalError=console.error;t.mock.method(console,'error',(message,...args)=>{if(!String(message).startsWith('react-test-renderer is deprecated'))originalError(message,...args);});
  await act(async()=>{renderer=create(React.createElement(Connections));});
  for(let i=0;i<12;i++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,4));});
  assert.deepEqual(calls,[{action:'poll',slot}]);
  if(authorized){assert.equal(f.db.prepare('SELECT account_id FROM epic_accounts WHERE slot=?').get(slot).account_id,account);assert.match(content(renderer.toJSON()),/Compte connecté/);assert.equal(renderer.root.findAllByProps({'aria-label':'Autorisation Epic'}).length,0);}
  else{assert.equal(renderer.root.findAllByProps({'aria-label':'Autorisation Epic'}).length,1);assert.ok(renderer.root.findAllByType('button').some(b=>content(b)==='Vérifier l’autorisation'));}
 }finally{if(renderer)await act(async()=>renderer.unmount());for(const [name,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}f.db.close();}
});
test('Les autorisations en attente sont visibles seulement par leur propriétaire, sans code device ni jeton',async()=>{const f=await fixture({legacy:false});try{f.db.prepare('INSERT INTO epic_grants VALUES (?,?,?,?,?,?,?)').run(slot,owner,'encrypted-synthetic-device',Date.now()+600000,0,5,0);const own=await connectionStatus(f.env,owner),other=await connectionStatus(f.env,'someone-else');assert.equal(own.pending.length,1);assert.deepEqual(other.pending,[]);assert.ok(!JSON.stringify(own).includes('encrypted-synthetic-device'));assert.deepEqual(Object.keys(own.pending[0]).sort(),['expires','interval','slot']);}finally{f.db.close();}});
