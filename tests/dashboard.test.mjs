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
 .replaceAll("'../lib/domain.mjs'",JSON.stringify(new URL('../lib/domain.mjs',import.meta.url).href))
 .replaceAll("'../lib/season.mjs'",JSON.stringify(new URL('../lib/season.mjs',import.meta.url).href));
const {default:Dashboard}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const content=node=>typeof node==='string'?node:node.children?.map(content).join('')||'';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
// State reads are asynchronous (hashed ETag): wait until they settle, then let React apply them.
const reads=new Set();
const action=fn=>act(async()=>{fn();for(let i=0;i<3;i++){if(reads.size)await Promise.allSettled([...reads]);await new Promise(resolve=>setImmediate(resolve));}});

async function harness(debt,{visibility=false}={}){
 const f=await fixture({legacy:false});f.resetDebt(debt);
 const storage=new Map(),intervals=new Set(),intervalDelays=new Map(),savedGlobals=new Map(),listeners=new Map();
 const network={posts:[],failAfterSave:false,delayNextState:null,stateGets:0};
 function override(name,value){savedGlobals.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});}
 override('IS_REACT_ACT_ENVIRONMENT',true);
 override('localStorage',{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)});
 override('setInterval',(fn,delay)=>{intervals.add(fn);intervalDelays.set(fn,delay);return fn;});override('clearInterval',fn=>{intervals.delete(fn);intervalDelays.delete(fn);});
 const visibleDocument={hidden:false,documentElement:{dataset:{}},addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},removeEventListener(type,fn){listeners.get(type)?.delete(fn);}};
 if(visibility){override('document',visibleDocument);override('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));}
 override('fetch',async(url,options)=>{
  if(url==='/api/exercise'){
   const body=JSON.parse(options.body);network.posts.push(body);
   const response=await f.post(body);
   if(network.failAfterSave){network.failAfterSave=false;throw Error('Connexion interrompue après l’enregistrement.');}
   return response;
  }
  if(url==='/api/epic'){network.autoSyncs=(network.autoSyncs||0)+1;return Response.json({ran:false});}
  assert.equal(url,'/api/state');
  network.stateGets++;
  const read=f.readState();reads.add(read);
  let response;try{response=await read;}finally{reads.delete(read);}
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
 return {f,storage,network,intervals,intervalDelays,visibleDocument,listeners,root,number,setCount,setType,submit,debtText,mount,unmount:()=>action(()=>renderer.unmount()),cleanup};
}

test('Actualisation rapide : pause et reprise de lecture, aucun déclenchement de connexion Epic',async()=>{
 const h=await harness(5,{visibility:true});try{
  const stateTick=[...h.intervals].find(fn=>h.intervalDelays.get(fn)===3000);assert.ok(stateTick);
  const beforeState=h.network.stateGets,beforeSource=h.network.autoSyncs;
  h.visibleDocument.hidden=true;await action(()=>{stateTick();});assert.equal(h.network.stateGets,beforeState);assert.equal(h.network.autoSyncs,beforeSource);
  h.visibleDocument.hidden=false;await action(()=>{for(const fn of h.listeners.get('visibilitychange'))fn();});assert.equal(h.network.stateGets,beforeState+1);assert.equal(h.network.autoSyncs||0,0);
 }finally{await h.cleanup();}assert.equal(h.intervals.size,0);assert.equal(h.listeners.get('visibilitychange').size,0);
});
test('Connexion lente : les lectures automatiques restent uniques et finissent par mettre le tableau à jour',async()=>{
 const h=await harness(5);try{
  const tick=[...h.intervals].find(fn=>h.intervalDelays.get(fn)===3000),wait=deferred();h.network.delayNextState=wait;const before=h.network.stateGets;
  await action(()=>tick());assert.equal(h.network.stateGets,before+1);await action(()=>{tick();tick();});assert.equal(h.network.stateGets,before+1);
  await action(()=>wait.resolve(wait.snapshot));assert.equal(h.debtText(),'5');await action(()=>tick());assert.equal(h.network.stateGets,before+2);
 }finally{await h.cleanup();}
});

test('Historique non reçu : conserver les compteurs sans relancer la collecte retirée',async()=>{
 const h=await harness(0);try{
  const panel=()=>h.root().findByProps({'aria-label':'Collecte de kevin-74000'});
  const counters=()=>h.root().findAllByProps({className:'results'})[2];
  h.f.db.prepare("INSERT INTO player_identities (slot,owner,player_id) VALUES ('kevin-74000','another-member','Epic|synthetic-id|0')").run();
  await action(()=>{for(const tick of h.intervals)tick();});
  assert.match(content(panel()),/accès Epic retiré/);assert.match(content(counters()),/— parties reçues/);assert.ok(!content(counters()).includes('0 parties'));
  h.f.db.prepare("UPDATE player_identities SET last_sync=? WHERE slot='kevin-74000'").run(new Date().toISOString());
  await action(()=>{for(const tick of h.intervals)tick();});
  assert.match(content(panel()),/accès Epic retiré/);assert.match(content(panel()),/Dernière lecture/);assert.match(content(counters()),/0 parties reçues/);
 }finally{await h.cleanup();}
});

test('Cartes : rang 2v2, division et MMR du dernier relevé, indépendants de la date des matchs',async()=>{
 const h=await harness(5);try{
  const panel=()=>h.root().findByProps({'aria-label':'Classement 2v2 de nokouki'});
  assert.match(content(panel()),/Classement non reçu/);assert.equal(panel().findAllByProps({className:'rank-mmr'}).length,0);
  const now=new Date().toISOString();h.f.db.prepare('INSERT INTO player_ranks VALUES (?,?,?,?,?,?,?,?,?,?)').run('nokouki','Epic|synthetic|0',11,1200,17,2,10,now,now,'ready');
  await action(()=>{for(const refresh of h.intervals)refresh();});
  assert.match(content(panel()),/Champion II · Division II/);assert.equal(content(panel().findByProps({className:'rank-mmr'})).replace(/\s/g,''),'1200MMR');
  await action(()=>h.root().findAllByType('button').find(b=>content(b)==='Tout').props.onClick());assert.match(content(panel()),/Champion II · Division II/);assert.equal(h.debtText(),'5');
  h.f.db.prepare("UPDATE player_ranks SET status='unavailable' WHERE player='nokouki'").run();await action(()=>{for(const refresh of h.intervals)refresh();});
  assert.match(content(panel()),/Dernière valeur connue/);assert.match(content(panel()),/Actualisation du classement indisponible/);assert.equal(content(panel().findByProps({className:'rank-mmr'})).replace(/\s/g,''),'1200MMR');
 }finally{await h.cleanup();}
});

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

test('Le récap affiche chaque joueur et complète le bon jour après une synchronisation tardive',async()=>{
 const h=await harness(0);
 try{
  const recapTable=()=>h.root().findByProps({'aria-label':'Récapitulatif quotidien'});
  const playerCells=()=>recapTable().findByType('tbody').findAllByType('tr').map(r=>r.findAllByType('td').map(content));
  assert.match(content(recapTable()),/Non comparable/);
  const insert=h.f.db.prepare('INSERT INTO results VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  insert.run('late-match','p1','chat-pris-tea','2026-11-04','match',0,1,50,0,0,0,'2026-11-05T08:00:00Z');
  insert.run('late-match','p2','nokouki','2026-11-04','match',0,1,100,0,0,0,'2026-11-05T08:00:00Z');
  insert.run('late-match','p3','adversaire','2026-11-04','match',1,1,300,0,0,0,'2026-11-05T08:00:00Z');
  h.f.db.prepare('INSERT INTO match_rosters VALUES (?,?,?)').run('late-match',3,'2026-11-05T08:00:00Z');
  await action(()=>{for(const tick of h.intervals)tick();});
  await action(()=>h.root().findByProps({'aria-label':'Date du récap'}).props.onChange({target:{value:'2026-11-04'}}));
  assert.deepEqual(playerCells()[0].slice(0,4),['chat-pris-tea','1','0','1']);
  assert.match(playerCells()[0][4],/^1 fois/);assert.equal(playerCells()[0][5],'5');
  assert.match(playerCells()[2][4],/Non comparable/);
  // A newer import updates points, while the same match still counts once.
  h.f.db.prepare('UPDATE results SET score=200,received=? WHERE name=?').run('2026-11-05T09:00:00Z','chat-pris-tea');
  await action(()=>{for(const tick of h.intervals)tick();});
  assert.equal(playerCells()[0][1],'1');assert.match(playerCells()[0][4],/^0 fois/);assert.match(playerCells()[1][4],/^1 fois/);
  assert.equal(h.root().findByProps({'aria-label':'Date du récap'}).props.value,'2026-11-04');
  // Clearing the date input leaves a valid recap on screen.
  await action(()=>h.root().findByProps({'aria-label':'Date du récap'}).props.onChange({target:{value:''}}));
  assert.equal(h.root().findByProps({'aria-label':'Date du récap'}).props.value,'2026-11-04');
 }finally{await h.cleanup();}
});
