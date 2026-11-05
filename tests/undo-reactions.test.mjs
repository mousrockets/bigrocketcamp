import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,loadRoute} from './helpers/exercise-fixture.mjs';

async function setup(){
 const f=await fixture({legacy:false});
 const context={env:f.env,getChatGPTUser:async()=>f.actor.user};
 const {DELETE}=await loadRoute('../../app/api/exercise/route.ts',{...context,validateExercise:()=>{},parisDay:()=>''});
 const {POST:REACT}=await loadRoute('../../app/api/reaction/route.ts',context);
 const call=(handler,url,method,body,origin='https://rl.example')=>handler(new Request(`https://rl.example${url}`,{method,headers:{'Content-Type':'application/json',origin},body:JSON.stringify(body)}));
 return {f,remove:(body,origin)=>call(DELETE,'/api/exercise','DELETE',body,origin),react:(body,origin)=>call(REACT,'/api/reaction','POST',body,origin)};
}

test('Annulation : seul l’auteur, dans les 24 heures, et les réactions partent avec la série',async()=>{
 const {f,remove,react}=await setup();
 try{
  assert.equal((await f.post(f.input)).status,200);
  assert.equal((await react({exerciseId:f.input.id,emoji:'🔥'})).status,200);
  assert.equal((await remove({id:f.input.id},'https://other.example')).status,403);
  f.actor.user={userId:'someone-else'};assert.equal((await remove({id:f.input.id})).status,403);
  f.actor.user=null;assert.equal((await remove({id:f.input.id})).status,401);
  f.actor.user={userId:'current-user'};
  f.db.prepare('UPDATE exercises SET created=? WHERE id=?').run(new Date(Date.now()-25*3600*1000).toISOString(),f.input.id);
  assert.equal((await remove({id:f.input.id})).status,403);
  f.db.prepare('UPDATE exercises SET created=? WHERE id=?').run(new Date().toISOString(),f.input.id);
  assert.equal((await remove({id:f.input.id})).status,200);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM exercises WHERE id=?').get(f.input.id).n,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM exercise_reactions').get().n,0);
  assert.equal((await remove({id:f.input.id})).status,404);
  assert.equal((await remove({id:'x'})).status,400);
 }finally{f.db.close();}
});

test('Réactions : bascule par personne, emoji contrôlé, visibles dans l’état sans exposer les auteurs',async()=>{
 const {f,react}=await setup();
 try{
  await f.post(f.input);
  assert.equal((await react({exerciseId:f.input.id,emoji:'<script>'})).status,400);
  assert.equal((await react({exerciseId:'missing-exercise-0000',emoji:'💪'})).status,404);
  assert.equal((await react({exerciseId:f.input.id,emoji:'💪'})).status,200);
  f.actor.user={userId:'friend'};await react({exerciseId:f.input.id,emoji:'💪'});
  let state=await (await f.readState()).json();
  assert.deepEqual(state.reactions.map(r=>[r.emoji,r.count,r.mine]),[['💪',2,1]]);
  assert.equal(state.exercises[0].mine,false);assert.equal('author' in state.exercises[0],false);
  await react({exerciseId:f.input.id,emoji:'💪'});
  f.actor.user={userId:'current-user'};
  state=await (await f.readState()).json();
  assert.deepEqual(state.reactions.map(r=>[r.emoji,r.count,r.mine]),[['💪',1,1]]);
  assert.equal(state.exercises[0].mine,true);
 }finally{f.db.close();}
});

test('Reconnaissance : le joueur le plus déclaré par le compte connecté',async()=>{
 const f=await fixture({legacy:false});
 try{
  assert.equal((await (await f.readState()).json()).me,null);
  await f.post({...f.input,id:'mine-exercise-000001',player:'kevin-74000'});
  await f.post({...f.input,id:'mine-exercise-000002',player:'nokouki'});
  await f.post({...f.input,id:'mine-exercise-000003',player:'nokouki'});
  assert.equal((await (await f.readState()).json()).me,'nokouki');
  f.actor.user={userId:'stranger'};
  assert.equal((await (await f.readState()).json()).me,null);
 }finally{f.db.close();}
});
