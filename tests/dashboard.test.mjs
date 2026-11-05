import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React,{act} from 'react';
import {create} from 'react-test-renderer';
import {transpileModule,ModuleKind,JsxEmit} from 'typescript';
import {fixture} from './helpers/exercise-fixture.mjs';

// Compile the actual TSX component, keeping real React state, effects and event handlers.
const source=readFileSync(new URL('../app/dashboard.tsx',import.meta.url),'utf8');
const compiled=transpileModule(source,{compilerOptions:{module:ModuleKind.ESNext,jsx:JsxEmit.ReactJSX}}).outputText
 .replaceAll('"react/jsx-runtime"',JSON.stringify(import.meta.resolve('react/jsx-runtime')))
 .replaceAll("'react'",JSON.stringify(import.meta.resolve('react')))
 .replaceAll("'../lib/domain.mjs'",JSON.stringify(new URL('../lib/domain.mjs',import.meta.url).href));
const {default:Dashboard}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const content=node=>typeof node==='string'?node:node.children?.map(content).join('')||'';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const action=fn=>act(async()=>{fn();await new Promise(resolve=>setImmediate(resolve));});

async function harness(debt){
 const f=await fixture({legacy:false});f.resetDebt(debt);
 const storage=new Map(),intervals=new Set(),savedGlobals=new Map();
 const network={posts:[],failAfterSave:false,delayNextState:null};
 function override(name,value){savedGlobals.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});}
 override('IS_REACT_ACT_ENVIRONMENT',true);
 override('localStorage',{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)});
 override('setInterval',fn=>{intervals.add(fn);return fn;});override('clearInterval',fn=>intervals.delete(fn));
 override('fetch',async(url,options)=>{
  if(url==='/api/exercise'){
   const body=JSON.parse(options.body);network.posts.push(body);
   const response=await f.post(body);
   if(network.failAfterSave){network.failAfterSave=false;throw Error('Connexion interrompue après l’enregistrement.');}
   return response;
  }
  assert.equal(url,'/api/state');
  const response=await f.readState();
  if(network.delayNextState){const wait=network.delayNextState;network.delayNextState=null;wait.snapshot=response;return wait.promise;}
  return response;
 });
 const originalConsoleError=console.error;
 console.error=(message,...args)=>{if(String(message).startsWith('react-test-renderer is deprecated'))return;originalConsoleError(message,...args);};
 let renderer;
 async function mount(){
  await act(async()=>{renderer=create(React.createElement(Dashboard));await new Promise(resolve=>setImmediate(resolve));});
  await action(()=>{const player=renderer.root.findAllByType('select')[0];if(!player.props.disabled)player.props.onChange({target:{value:'nokouki'}});});
 }
 const root=()=>renderer.root;
 const number=()=>root().findAllByType('input').find(n=>n.props.type==='number');
 const setCount=count=>action(()=>number().props.onChange({target:{valueAsNumber:count}}));
 const setType=type=>action(()=>root().findAllByType('select')[1].props.onChange({target:{value:type}}));
 const submit=()=>action(()=>root().findByType('form').props.onSubmit({preventDefault(){}}));
 const debtText=()=>content(root().findAllByProps({className:'debt'})[1].findByType('strong'));
 async function cleanup(){
  try{if(renderer)await action(()=>renderer.unmount());}
  finally{console.error=originalConsoleError;for(const [key,descriptor] of savedGlobals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}f.db.close();}
 }
 try{await mount();}catch(e){await cleanup();throw e;}
 return {f,storage,network,intervals,root,number,setCount,setType,submit,debtText,mount,unmount:()=>action(()=>renderer.unmount()),cleanup};
}

for(const [debt,count,remaining] of [[5,2,'3'],[5,5,'0'],[5,20,'0'],[0,20,'0'],[3.75,5,'0']]){
 test(`Formulaire : ${debt} dues et ${count} pompes saisies affichent ${remaining} restantes`,async()=>{
  const h=await harness(debt);
  try{
   await h.setCount(count);
   assert.match(content(h.root().findByProps({id:'exercise-credit'})),new RegExp(`Réduction : ${String(Math.min(debt,count)).replace('.',',')}`));
   await h.submit();
   assert.equal(h.debtText(),remaining);
   assert.equal(h.network.posts.length,1);
   assert.equal(h.f.stats()[1].pushups,count);
   assert.match(content(h.root().findByProps({role:'status'})),new RegExp(`Solde restant : ${remaining} pompes`));
   assert.equal(h.root().findAllByProps({role:'alert'}).length,0);
   assert.equal(h.number().props.disabled,false);
   assert.equal(h.storage.has('rl-pending'),false);
  }finally{await h.cleanup();}
 });
}
for(const [type,quantity,rawCount] of [['plank',0.25,15],['crunches',20,20]]){
 test(`Formulaire ${type} : un exercice alternatif peut dépasser une petite dette`,async()=>{
  const h=await harness(0.5);
  try{
   await h.setType(type);await h.setCount(quantity);await h.submit();
   assert.equal(h.debtText(),'0');assert.equal(h.network.posts[0].count,rawCount);assert.equal(h.network.posts[0].type,type);
   assert.equal(h.root().findAllByProps({role:'alert'}).length,0);
  }finally{await h.cleanup();}
 });
}

test('Double envoi immédiat du formulaire : aucun doublon de série',async()=>{
 const h=await harness(5);
 try{
  await h.setCount(20);
  await action(()=>{const submit=h.root().findByType('form').props.onSubmit;submit({preventDefault(){}});submit({preventDefault(){}});});
  assert.equal(h.network.posts.length,1);
  assert.equal(h.f.stats()[1].pushups,20);
  assert.equal(h.debtText(),'0');
 }finally{await h.cleanup();}
});

test('Coupure après sauvegarde puis rechargement : reprise sans compter deux fois les pompes',async()=>{
 const h=await harness(5);
 try{
  await h.setCount(20);h.network.failAfterSave=true;await h.submit();
  assert.equal(h.f.stats()[1].pushups,20);
  assert.equal(h.number().props.disabled,true);
  const originalId=h.network.posts[0].id;assert.equal(JSON.parse(h.storage.get('rl-pending')).id,originalId);
  await h.unmount();await h.mount();
  assert.equal(h.debtText(),'0');assert.equal(h.number().props.value,20);
  await h.submit();
  assert.equal(h.network.posts.length,2);assert.equal(h.network.posts[1].id,originalId);
  assert.equal(h.f.stats()[1].pushups,20);assert.equal(h.debtText(),'0');
  assert.equal(h.storage.has('rl-pending'),false);assert.equal(h.number().props.disabled,false);
 }finally{await h.cleanup();}
});

for(const fails of [false,true]){
 test(`Une ancienne actualisation ${fails?'en erreur':'avec un solde périmé'} ne remplace pas le solde après règlement`,async()=>{
  const h=await harness(5),wait=deferred();
  try{
   h.network.delayNextState=wait;await action(()=>{for(const tick of h.intervals)tick();});
   assert.ok(wait.snapshot);await h.setCount(20);await h.submit();assert.equal(h.debtText(),'0');
   await action(()=>{if(fails)wait.reject(Error('Ancienne requête interrompue.'));else wait.resolve(wait.snapshot);});
   assert.equal(h.debtText(),'0');assert.equal(h.root().findAllByProps({role:'alert'}).length,0);
  }finally{await h.cleanup();}
 });
}

test('Stockage local indisponible : la série excédentaire reste enregistrable',async()=>{
 const h=await harness(5);
 try{
  globalThis.localStorage.setItem=()=>{throw Error('Stockage indisponible.');};
  globalThis.localStorage.removeItem=()=>{throw Error('Stockage indisponible.');};
  await h.setCount(20);await h.submit();
  assert.equal(h.debtText(),'0');assert.equal(h.f.stats()[1].pushups,20);assert.equal(h.number().props.disabled,false);
 }finally{await h.cleanup();}
});

test('Après un dépassement, le formulaire accepte une nouvelle série distincte',async()=>{
 const h=await harness(5);
 try{
  await h.setCount(20);await h.submit();assert.equal(h.debtText(),'0');
  await h.setCount(5);await h.submit();
  assert.equal(h.network.posts.length,2);
  assert.notEqual(h.network.posts[0].id,h.network.posts[1].id);
  assert.equal(h.f.stats()[1].pushups,25);
  assert.equal(h.debtText(),'0');assert.equal(h.number().props.disabled,false);
 }finally{await h.cleanup();}
});

test('Échec de connexion puis nouvelle tentative : le verrou du formulaire se libère',async()=>{
 const h=await harness(5);
 try{
  h.f.actor.user=null;await h.setCount(20);await h.submit();
  assert.equal(h.f.stats()[1].pushups,0);assert.equal(h.root().findAllByProps({role:'alert'}).length,1);
  h.f.actor.user={userId:'current-user'};await h.submit();
  assert.equal(h.f.stats()[1].pushups,20);assert.equal(h.debtText(),'0');
  assert.equal(h.root().findAllByProps({role:'alert'}).length,0);assert.equal(h.number().props.disabled,false);
 }finally{await h.cleanup();}
});
