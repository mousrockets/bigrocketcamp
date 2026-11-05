import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {transpileModule,ModuleKind} from 'typescript';
import {validateExercise,parisDay,summarize} from '../lib/domain.mjs';

const journal=JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json',import.meta.url),'utf8'));
const initial=readFileSync(new URL('../drizzle/0000_real_rattler.sql',import.meta.url),'utf8');
const source=readFileSync(new URL('../app/api/exercise/route.ts',import.meta.url),'utf8');
let sequence=0;
async function fixture(){
 const db=new DatabaseSync(':memory:');db.exec(initial);
 // An existing production-style row must survive the additive migration.
 db.prepare('INSERT INTO exercises VALUES (?,?,?,?,?,?)').run('legacy-exercise-1','nokouki',5,'2026-11-04','2026-11-04T12:00:00Z','old-user');
 for(const entry of journal.entries.slice(1))db.exec(readFileSync(new URL(`../drizzle/${entry.tag}.sql`,import.meta.url),'utf8'));
 const actor={user:{userId:'current-user'}};
 const env={DB:{prepare(sql){return {bind(...values){const statement=db.prepare(sql);return {async run(){return statement.run(...values);},async first(){return statement.get(...values)||null;}};}};}}};
 // Run the actual route with only the Cloudflare binding and identity substituted.
 globalThis.__exerciseFixture={env,getChatGPTUser:async()=>actor.user,validateExercise,parisDay};
 const compiled=transpileModule(source.replace(/^import .*;\s*$/gm,''),{compilerOptions:{module:ModuleKind.ESNext}}).outputText;
 const code=`const {env,getChatGPTUser,validateExercise,parisDay}=globalThis.__exerciseFixture;\n${compiled}\n// fixture ${sequence++}`;
 const {POST}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
 delete globalThis.__exerciseFixture;
 const post=(body,origin='https://rl.example')=>POST(new Request('https://rl.example/api/exercise',{method:'POST',headers:{'Content-Type':'application/json',origin},body:JSON.stringify(body)}));
 const input={id:'new-exercise-123456',player:'nokouki',count:60,type:'plank',day:parisDay()};
 return {db,actor,post,input};
}

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
