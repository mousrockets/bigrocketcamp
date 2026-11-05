import test from 'node:test';
import assert from 'node:assert/strict';
import {parisDay,summarize} from '../lib/domain.mjs';
import {fixture} from './helpers/exercise-fixture.mjs';

test('Migration, ancien client, historique et nouvelles séries idempotentes',async()=>{
 const {db,post,input}=await fixture();
 try{
  assert.equal(db.prepare('SELECT type FROM exercises WHERE id=?').get('legacy-exercise-1').type,'pushups');
  const old={id:'legacy-exercise-1',player:'nokouki',count:5,day:'2026-11-04'};
  assert.equal((await post(old)).status,200);
  assert.equal((await post(input)).status,200);
  assert.equal((await post(input)).status,200);
  const abdos={...input,id:'new-crunches-123456',type:'crunches',count:20};
  assert.equal((await post(abdos)).status,200);
  assert.equal((await post({...input,type:'pushups'})).status,409);
  assert.equal((await post({...input,count:120})).status,409);
  assert.equal((await post({...input,player:'kevin-74000'})).status,409);
  const history=db.prepare('SELECT * FROM exercises ORDER BY created DESC').all();
  assert.equal(history.length,3);
  assert.equal(history.find(e=>e.type==='plank').author,'current-user');
  const s=summarize([],history,'')[1];
  assert.deepEqual([s.done,s.remaining,s.pushups,s.plankSeconds,s.crunches],[30,0,5,60,20]);
 }finally{db.close();}
});
test('Authentification, origine, date future et entrées invalides restent protégées',async()=>{
 const {db,post,input,actor}=await fixture();
 try{
  actor.user=null;assert.equal((await post(input)).status,401);actor.user={userId:'current-user'};
  assert.equal((await post(input,'https://intrus.example')).status,403);
  for(const patch of [{type:'course'},{count:-1},{count:0.5},{day:'2999-01-01'},{player:'intrus'}])assert.equal((await post({...input,...patch})).status,400);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM exercises').get().n,1);
 }finally{db.close();}
});
test('Dépasser la dette enregistre la série entière une seule fois et garde un solde nul',async()=>{
 const {db,post,input}=await fixture();
 try{
  const insert=db.prepare('INSERT INTO results VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  for(let i=0;i<2;i++)insert.run(`loss-${i}`,'player-1','nokouki',parisDay(),'match',0,1,10,0,0,0,'now');
  const state=()=>summarize(db.prepare('SELECT * FROM results').all(),db.prepare('SELECT * FROM exercises').all(),'')[1];
  assert.equal(state().remaining,5);
  const body={...input,type:'pushups',count:20};
  assert.equal((await post(body)).status,200);
  assert.deepEqual([state().due,state().done,state().remaining,state().pushups],[10,25,0,25]);
  assert.equal((await post(body)).status,200);
  assert.equal(state().pushups,25);
  assert.equal(db.prepare('SELECT count FROM exercises WHERE id=?').get(body.id).count,20);
  assert.equal((await post({...body,id:'next-exercise-123456',count:5})).status,200);
  assert.equal(state().remaining,0);
  assert.equal(state().pushups,30);
 }finally{db.close();}
});
