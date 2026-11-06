import test from 'node:test';
import assert from 'node:assert/strict';
import {summarize,exerciseEffect} from '../lib/domain.mjs';
import {fixture} from './helpers/exercise-fixture.mjs';

const activities=[
 {type:'pushups',quarterUnits:4,counts:[1,5,20,30,10000],maximum:10000,total:'pushups'},
 {type:'plank',quarterUnits:1,counts:[1,15,20,60,120,60000],maximum:60000,total:'plankSeconds'},
 {type:'crunches',quarterUnits:2,counts:[1,10,20,60,10000],maximum:10000,total:'crunches'},
];
for(const activity of activities){
 for(const debt of [0,0.5,3.75,5,10,30]){
  test(`${activity.type} : dette ${debt}, petites séries, égalité et dépassement jusqu’à la limite`,async()=>{
   const f=await fixture({legacy:false});
   try{
    for(const count of activity.counts){
     f.resetDebt(debt);
     const before=f.stats()[1];assert.equal(before.remaining,debt);
     const body={...f.input,type:activity.type,count};
     const equivalent=count*activity.quarterUnits/4;
     const expectedRemaining=equivalent>=debt?0:debt-equivalent;
     const effect=exerciseEffect(debt,body);
     assert.equal(effect.remaining,expectedRemaining);
     assert.ok(effect.reduction>=0&&effect.reduction<=debt);
     const response=await f.post(body);assert.equal(response.status,200);
     assert.deepEqual(await response.json(),{ok:true});
     // Read through the real GET route, as the dashboard does after saving/reloading.
     const stateResponse=await f.readState();assert.equal(stateResponse.status,200);
     assert.equal(stateResponse.headers.get('Cache-Control'),'private, no-cache');
     const state=await stateResponse.json(),after=summarize(state.results,state.exercises,'')[1];
     assert.equal(after.remaining,expectedRemaining);
     assert.equal(after.done,before.done+equivalent);
     assert.equal(after[activity.total],before[activity.total]+count);
     assert.equal(state.exercises.find(e=>e.id===body.id).count,count);
     for(const p of summarize(state.results,state.exercises,''))if(p.name!=='nokouki')assert.equal(p.done,0);
     assert.equal(summarize(state.results,state.exercises,'2000-01-01')[1].remaining,expectedRemaining);
     // Simulate a lost success response and retrying after reload.
     assert.equal((await f.post(body)).status,200);
     assert.equal(f.stats()[1].done,after.done);
     assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM exercises WHERE id=?').get(body.id).n,1);
    }
   }finally{f.db.close();}
  });
 }
 test(`${activity.type} : les quantités invalides n’altèrent ni la dette ni l’historique`,async()=>{
  const f=await fixture({legacy:false});
  try{
   f.resetDebt(5);
   for(const count of [0,-1,0.5,null,'20',activity.maximum+1,Number.MAX_SAFE_INTEGER]){
    assert.equal((await f.post({...f.input,type:activity.type,count})).status,400);
    assert.equal(f.stats()[1].remaining,5);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM exercises').get().n,0);
   }
  }finally{f.db.close();}
 });
}

test('Requêtes simultanées du même exercice excédentaire : une seule série',async()=>{
 const f=await fixture({legacy:false});
 try{
  f.resetDebt(5);const body={...f.input,type:'pushups',count:20};
  const responses=await Promise.all(Array.from({length:20},()=>f.post(body)));
  assert.ok(responses.every(r=>r.status===200));
  assert.deepEqual([f.stats()[1].remaining,f.stats()[1].pushups],[0,20]);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM exercises').get().n,1);
  const conflict=await Promise.all([f.post({...body,count:30}),f.post({...body,type:'crunches'})]);
  assert.ok(conflict.every(r=>r.status===409));assert.equal(f.stats()[1].pushups,20);
 }finally{f.db.close();}
});

test('Deux séries différentes du même montant restent deux efforts distincts',async()=>{
 const f=await fixture({legacy:false});
 try{
  f.resetDebt(5);
  for(const id of ['first-exercise-123456','second-exercise-123456'])assert.equal((await f.post({...f.input,id,type:'pushups',count:20})).status,200);
  assert.deepEqual([f.stats()[1].remaining,f.stats()[1].pushups],[0,40]);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM exercises').get().n,2);
 }finally{f.db.close();}
});

test('Gainage et abdos mélangés avec les pompes : règlement exact puis dépassement',async()=>{
 const f=await fixture({legacy:false});
 try{
  f.resetDebt(30);
  for(const [id,type,count,remaining] of [['plank-123456789012','plank',60,15],['crunches-123456789','crunches',20,5],['pushups-1234567890','pushups',5,0],['extra-123456789012','pushups',20,0]]){
   assert.equal((await f.post({...f.input,id,type,count})).status,200);assert.equal(f.stats()[1].remaining,remaining);
  }
  assert.deepEqual([f.stats()[1].pushups,f.stats()[1].plankSeconds,f.stats()[1].crunches],[25,60,20]);
  const state=await (await f.readState()).json();assert.equal(state.exercises.length,4);
 }finally{f.db.close();}
});

test('Ancien client sans type : dépassement et nouvelle tentative compatibles',async()=>{
 const f=await fixture({legacy:false});
 try{
  f.resetDebt(5);const body={...f.input,count:20};delete body.type;
  assert.equal((await f.post(body)).status,200);assert.equal((await f.post(body)).status,200);
  assert.deepEqual([f.stats()[1].remaining,f.stats()[1].pushups],[0,20]);
  assert.equal(f.db.prepare('SELECT type FROM exercises').get().type,'pushups');
 }finally{f.db.close();}
});
