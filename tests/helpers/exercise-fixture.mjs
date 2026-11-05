import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {transpileModule,ModuleKind} from 'typescript';
import {validateExercise,parisDay,summarize,normalizeParticipant} from '../../lib/domain.mjs';
import {validateMatchRosters} from '../../lib/match-rules.mjs';
import {observationWrites,readMerged} from '../../lib/reconcile.mjs';

const journal=JSON.parse(readFileSync(new URL('../../drizzle/meta/_journal.json',import.meta.url),'utf8'));
const initial=readFileSync(new URL('../../drizzle/0000_real_rattler.sql',import.meta.url),'utf8');
let sequence=0;
export async function loadRoute(path,context){
 const source=readFileSync(new URL(path,import.meta.url),'utf8');
 globalThis.__exerciseFixture=context;
 const compiled=transpileModule(source.replace(/^import .*;\s*$/gm,''),{compilerOptions:{module:ModuleKind.ESNext}}).outputText;
 const code=`const {${Object.keys(context).join(',')}}=globalThis.__exerciseFixture;\n${compiled}\n// fixture ${sequence++}`;
 try{return await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);}
 finally{delete globalThis.__exerciseFixture;}
}

export async function fixture({legacy=true}={}){
 const db=new DatabaseSync(':memory:');db.exec(initial);
 if(legacy)db.prepare('INSERT INTO exercises VALUES (?,?,?,?,?,?)').run('legacy-exercise-1','nokouki',5,'2026-11-04','2026-11-04T12:00:00Z','old-user');
 for(const entry of journal.entries.slice(1))db.exec(readFileSync(new URL(`../../drizzle/${entry.tag}.sql`,import.meta.url),'utf8'));
 const actor={user:{userId:'current-user'}};
 const env={INGEST_KEY:'test-ingest-key',DB:{async batch(writes){db.exec('BEGIN');try{const results=writes.map(w=>w.execute());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}},prepare(sql){
  const statement=db.prepare(sql);
  const bound=(values=[])=>({
   bind(...parameters){return bound(parameters);},
   execute(){return statement.run(...values);},
   async run(){return statement.run(...values);},
   async first(){return statement.get(...values)||null;},
   async all(){return {results:statement.all(...values)};},
  });
  return bound();
 }}};
 // Execute the real API routes; replace only Cloudflare D1 and authenticated identity.
 const context={env,getChatGPTUser:async()=>actor.user,validateExercise,parisDay,normalizeParticipant,validateMatchRosters,observationWrites,readMerged};
 const {POST}=await loadRoute('../../app/api/exercise/route.ts',context);
 const {GET}=await loadRoute('../../app/api/state/route.ts',context);
 const {POST:INGEST}=await loadRoute('../../app/api/ingest/route.ts',context);
 const ingest=(body,key='test-ingest-key')=>INGEST(new Request('https://rl.example/api/ingest',{method:'POST',headers:{'Content-Type':'application/json',authorization:`Bearer ${key}`},body:JSON.stringify(body)}));
 const post=(body,origin='https://rl.example')=>POST(new Request('https://rl.example/api/exercise',{method:'POST',headers:{'Content-Type':'application/json',origin},body:JSON.stringify(body)}));
 const readState=()=>GET();
 const input={id:'new-exercise-123456',player:'nokouki',count:60,type:'plank',day:parisDay()};
 const stats=()=>summarize(db.prepare('SELECT * FROM results').all(),db.prepare('SELECT * FROM exercises').all(),'');
 function resetDebt(remaining){
  db.exec('DELETE FROM results; DELETE FROM exercises; DELETE FROM match_rosters; DELETE FROM result_observations; DELETE FROM source_reports;');
  const due=Math.ceil(remaining/5)*5;
  const insert=db.prepare('INSERT INTO results VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  for(let i=0;i<due/5;i++)insert.run(`loss-${i}`,'player-1','nokouki',parisDay(),'match',0,1,10,0,0,0,'now');
  if(due>remaining)db.prepare('INSERT INTO exercises (id,player,count,day,created,author,type) VALUES (?,?,?,?,?,?,?)').run('baseline-exercise-1','nokouki',(due-remaining)*4,parisDay(),'2026-11-04T12:00:00Z','current-user','plank');
 }
 return {db,env,actor,post,ingest,readState,input,stats,resetDebt};
}
