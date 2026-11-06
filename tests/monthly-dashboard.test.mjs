import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {create} from 'react-test-renderer';
import {fixture} from './helpers/exercise-fixture.mjs';
import {MonthlyMmr} from './helpers/react-component.mjs';
import {closeMonthlyMmr} from '../lib/monthly-mmr.mjs';
import {roster} from '../lib/domain.mjs';
const content=node=>typeof node==='string'?node:node.children?.map(content).join('')||'';

async function harness({owned=true,history=false}={}){
 const f=await fixture({legacy:false}),storage=new Map(),saved=new Map(),inFlight=new Set(),intervals=new Set(),network={records:[],failAfterSave:false};let renderer;
 if(owned)f.db.prepare('INSERT INTO player_identities (slot,owner,player_id) VALUES (?,?,?)').run(roster[0],'current-user','Epic|synthetic-own|0');
 if(history){f.db.exec("UPDATE monthly_mmr_policy SET starts_month='2026-10'");for(const [i,p] of roster.entries())f.db.prepare('INSERT INTO mmr_entries (id,player,mmr,author,recorded_at) VALUES (?,?,?,?,?)').run(crypto.randomUUID(),p,1000+i*100,'synthetic','2026-10-31T21:00:00.000Z');await closeMonthlyMmr(f.env.DB,Date.parse('2026-10-31T23:05:00Z'));}
 const override=(name,value)=>{saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});};
 override('IS_REACT_ACT_ENVIRONMENT',true);override('localStorage',{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)});
 override('setInterval',fn=>{intervals.add(fn);return fn;});override('clearInterval',fn=>intervals.delete(fn));
 override('fetch',(url,options)=>{assert.equal(url,'/api/monthly');const body=JSON.parse(options.body);if(body.action==='record')network.records.push(body);
  const run=(async()=>{const response=await f.monthly(body);if(body.action==='record'&&network.failAfterSave){network.failAfterSave=false;throw Error('Connexion interrompue après enregistrement.');}return response;})();
  inFlight.add(run);run.then(()=>inFlight.delete(run),()=>inFlight.delete(run));return run;
 });
 const originalError=console.error;console.error=(message,...args)=>{if(String(message).startsWith('react-test-renderer is deprecated'))return;originalError(message,...args);};
 const refresh=async()=>{const data=await (await f.readMonthly()).json();renderer.update(React.createElement(MonthlyMmr,{data,onRefresh:refresh}));};
 const action=fn=>act(async()=>{fn();for(let i=0;i<5;i++){await Promise.allSettled([...inFlight]);await new Promise(resolve=>setImmediate(resolve));}});
 const data=await (await f.readMonthly()).json();await action(()=>{renderer=create(React.createElement(MonthlyMmr,{data,onRefresh:refresh}));});
 const root=()=>renderer.root,form=()=>root().findByProps({'aria-label':'Déclarer mon MMR 2v2'});
 const enter=mmr=>action(()=>root().findByProps({type:'number'}).props.onChange({target:{value:String(mmr)}}));
 const submit=(times=1)=>action(()=>{const fn=form().props.onSubmit;for(let i=0;i<times;i++)fn({preventDefault(){}});});
 const cleanup=async()=>{try{await action(()=>renderer.unmount());}finally{console.error=originalError;for(const [name,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}f.db.close();}};
 return {f,storage,network,root,form,enter,submit,action,cleanup,intervals};
}
test('MMR déclaré dans le vrai formulaire : propre joueur uniquement, tableau et rang actualisés',async()=>{
 const h=await harness();try{const players=h.form().findAllByType('select')[0].findAllByType('option');assert.deepEqual(players.map(p=>p.children[0]),[roster[0]]);
  await h.enter(1275);await h.submit();assert.equal(h.network.records.length,1);assert.match(content(h.root().findByProps({'aria-label':'Classement MMR mensuel'})),/1275/);assert.equal(h.f.db.prepare('SELECT mmr FROM player_ranks').get().mmr,1275);assert.match(content(h.root().findByProps({role:'status'})),/MMR 2v2 enregistré/);
 }finally{await h.cleanup();}assert.equal(h.intervals.size,0);
});
test('Double clic puis coupure après sauvegarde : réessai du même identifiant, un seul relevé',async()=>{
 const h=await harness();try{await h.enter(1210);h.network.failAfterSave=true;await h.submit(2);
  assert.equal(h.network.records.length,1);assert.match(content(h.root().findByProps({role:'alert'})),/Connexion interrompue/);assert.equal(h.root().findByProps({type:'number'}).props.disabled,true);
  const pending=JSON.parse(h.storage.get('rl-monthly-mmr-pending'));assert.equal(pending.id,h.network.records[0].id);await h.submit();assert.equal(h.network.records[1].id,pending.id);assert.equal(h.f.db.prepare('SELECT count(*) AS n FROM mmr_entries').get().n,1);assert.equal(h.storage.has('rl-monthly-mmr-pending'),false);assert.equal(h.root().findAllByProps({role:'alert'}).length,0);
 }finally{await h.cleanup();}
});
test('Échec de saisie : permettre une correction et conserver un relevé déjà enregistré',async()=>{
 const h=await harness();try{await h.enter(1300);h.network.failAfterSave=true;await h.submit();await h.action(()=>h.root().findAllByType('button').find(b=>content(b)==='Modifier la saisie').props.onClick());assert.equal(h.root().findByProps({type:'number'}).props.disabled,false);assert.equal(h.storage.size,0);assert.equal(h.f.db.prepare('SELECT count(*) AS n FROM mmr_entries').get().n,1);
 }finally{await h.cleanup();}
});
test('Historique réel : une boisson à chaque autre joueur, marquer offerte puis annuler',async()=>{
 const h=await harness({history:true});try{
  assert.match(content(h.root()),/une boisson à chacun des deux autres/);const offered=()=>h.root().findAllByType('button').filter(b=>content(b)==='Boisson offerte');assert.equal(offered().length,2);
  await h.action(()=>offered()[0].props.onClick());assert.equal(h.f.db.prepare('SELECT count(*) AS n FROM drink_debts WHERE paid_at IS NOT NULL').get().n,1);assert.match(content(h.root()),/Offerte le/);
  await h.action(()=>h.root().findAllByType('button').find(b=>content(b)==='Annuler').props.onClick());assert.equal(h.f.db.prepare('SELECT count(*) AS n FROM drink_debts WHERE paid_at IS NOT NULL').get().n,0);assert.equal(offered().length,2);
 }finally{await h.cleanup();}
});
test('Sans identité associée : expliquer la connexion locale, aucun formulaire pour modifier autrui',async()=>{
 const h=await harness({owned:false});try{assert.equal(h.root().findAllByType('form').length,0);assert.match(content(h.root()),/ton identité de joueur/);assert.match(content(h.root()),/aucune dette automatique/);
 }finally{await h.cleanup();}
});
