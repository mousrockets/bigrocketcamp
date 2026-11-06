import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLiveMatch,statsStream,matchCapture} from '../lib/live-stats.mjs';
import {liveBridge} from '../lib/live-bridge.mjs';
import {fixture,loadRoute} from './helpers/exercise-fixture.mjs';
import {roster,summarize} from '../lib/domain.mjs';
import {readMerged,observationWrites} from '../lib/reconcile.mjs';
import {readPlayerIdentities,readIdentityBindings,attributeLivePlayers,canonicalPlayerId} from '../lib/player-identities.mjs';
import React,{act} from 'react';
import {create} from 'react-test-renderer';
import {readFileSync} from 'node:fs';
import {transpileModule,ModuleKind,JsxEmit} from 'typescript';

const account='b'.repeat(32),now=Date.now();
function payload(guid='synthetic-live-match'){
 const players=[['renamed-player',`Epic|${account}|0`],['nokouki',`Epic|${'c'.repeat(32)}|0`],['kevin-74000','PS4|222222|0'],['Opponent 1',`Epic|${'d'.repeat(32)}|0`],['Opponent 2',`Epic|${'e'.repeat(32)}|0`],['Opponent 3',`Epic|${'f'.repeat(32)}|0`]].map(([Name,PrimaryId],i)=>({Name,PrimaryId,TeamNum:i<3?0:1,Score:100+i*10,Goals:0,Assists:0,Saves:1}));
 return {startedAt:now-360000,endedAt:now-1000,seenIds:players.map(p=>p.PrimaryId),end:{MatchGuid:guid,WinnerTeamNum:1},state:{MatchGuid:guid,Players:players,Game:{PlaylistId:13,Teams:[{Name:'Blue',TeamNum:0,Score:1},{Name:'Orange',TeamNum:1,Score:2}],bHasWinner:true,bReplay:false,Winner:'Orange'}}};
}
const packet=(Event,Data)=>({Event,Data});
function finish(capture,p){capture.handle(packet('MatchEnded',p.end));capture.handle(packet('UpdateState',p.state));capture.handle(packet('UpdateState',p.state));}
test('Flux officiel : objets concaténés, frames fragmentées, Data encodé en JSON et accolades échappées',()=>{
 const frames=[packet('UpdateState',{MatchGuid:'synthetic',Name:'Nom "{ }" \\ é'}),packet('MatchEnded',JSON.stringify({MatchGuid:'synthetic',WinnerTeamNum:1}))];
 const text=frames.map(JSON.stringify).join('\n'),stream=statsStream(),out=[];
 for(let i=0;i<text.length;i+=7)out.push(...stream.push(text.slice(i,i+7)));
 assert.deepEqual(out,[frames[0],{...frames[1],Data:JSON.parse(frames[1].Data)}]);assert.deepEqual(stream.push('  '),[]);
 assert.throws(()=>stream.push('x'));assert.throws(()=>stream.push('x'.repeat(262145)));assert.deepEqual(stream.push(JSON.stringify(frames[0])),[frames[0]]);
});
test('Capture : attendre deux tableaux finaux cohérents, jamais le dernier tick avant la fin',()=>{
 const received=[],p=payload(),capture=matchCapture(p=>received.push(p),()=>now);
 capture.handle(packet('MatchCreated',{MatchGuid:p.state.MatchGuid}));capture.handle(packet('MatchInitialized',{MatchGuid:p.state.MatchGuid}));
 const pre=structuredClone(p.state);pre.Game.bHasWinner=false;pre.Game.Winner='';pre.Game.bReplay=true;capture.handle(packet('UpdateState',pre));
 capture.handle(packet('MatchEnded',p.end));capture.handle(packet('UpdateState',pre));assert.equal(received.length,0);
 capture.handle(packet('UpdateState',p.state));assert.equal(received.length,0);
 const final=structuredClone(p.state);final.Players[0].Score=250;
 capture.handle(packet('UpdateState',final));assert.equal(received.length,0);capture.handle(packet('UpdateState',final));assert.equal(received.length,1);assert.equal(parseLiveMatch(received[0],now).rows[0].score,250);
 finish(capture,p);assert.equal(received.length,1);
});
test('Capture : replay historique, connexion en milieu de match et tableau disparu jamais importés',()=>{
 for(const mode of ['replay','mid-match','destroyed','missing-player']){
  const out=[],p=payload(mode),capture=matchCapture(p=>out.push(p),()=>now);
  if(mode==='replay')capture.handle(packet('ReplayCreated',{MatchGuid:mode}));
  if(mode!=='mid-match')capture.handle(packet('MatchCreated',{MatchGuid:mode}));
  capture.handle(packet('UpdateState',p.state));
  if(mode==='destroyed')capture.handle(packet('MatchDestroyed',{MatchGuid:mode}));
  if(mode==='missing-player')p.state.Players.pop();
  finish(capture,p);assert.equal(out.length,0,mode);
 }
});
test('Validation : pas de forfait déduit du score, pas de bots, privé, vainqueur inconnu, doublon ou snapshot incomplet',()=>{
 const forfeited=payload();forfeited.state.Game.Teams[0].Score=5;assert.equal(parseLiveMatch(forfeited,now).rows.length,6);
 const mutations=[p=>p.end.WinnerTeamNum=2,p=>p.end.MatchGuid='other',p=>p.state.Game.bHasWinner=false,p=>p.state.Game.bReplay=true,p=>p.state.Game.Winner='Blue',p=>p.state.Game.PlaylistId=6,p=>p.state.Game.PlaylistId=40,p=>p.state.Players.pop(),p=>p.seenIds.pop(),p=>p.state.Players[1].PrimaryId=p.state.Players[0].PrimaryId,p=>p.state.Players[0].PrimaryId='Bot|1|0',p=>p.state.Players[0].Score=NaN,p=>p.endedAt=now+60000,p=>p.startedAt=now+1];
 for(const mutate of mutations){const p=payload();mutate(p);assert.throws(()=>parseLiveMatch(p,now));}
});
test('Minuit Paris : le direct utilise le début du match comme l’historique Epic',()=>{
 const p=payload();p.startedAt=Date.parse('2026-11-05T22:58:00Z');p.endedAt=Date.parse('2026-11-05T23:05:00Z');
 assert.equal(parseLiveMatch(p,p.endedAt).rows[0].day,'2026-11-05');
});
async function server(){
 const f=await fixture({legacy:false});
 for(const [slot,owner,id] of [['chat-pris-tea','current-user',`Epic|${account}|0`],['nokouki','friend-one',`Epic|${'c'.repeat(32)}|0`],['kevin-74000','friend-two','PS4|222222|0']]){f.db.prepare('INSERT INTO player_identities (slot,owner,player_id) VALUES (?,?,?)').run(slot,owner,id);f.db.prepare('INSERT INTO player_identity_aliases VALUES (?,?,?,?)').run(id,slot,owner,'synthetic');}
 const context={env:f.env,getChatGPTUser:async()=>f.actor.user,roster,parseLiveMatch,observationWrites,readPlayerIdentities,readIdentityBindings,attributeLivePlayers,canonicalPlayerId};
 const route=await loadRoute('../../app/api/live/route.ts',context);
 const post=(body,origin='https://club.example')=>route.POST(new Request('https://club.example/api/live',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body)}));
 return {...f,route,post};
}
test('Vraie route direct : auth, origine et identité liée contrôlées ; aucun jeton dans le navigateur',async()=>{
 const f=await server();try{
  const status=await (await f.route.GET()).json();assert.deepEqual(status,{players:['chat-pris-tea']});
  const p=payload();assert.equal((await f.post(p,'https://other.example')).status,403);assert.equal((await f.post('x'.repeat(64001))).status,413);
  const other=structuredClone(p);other.state.Players[0].PrimaryId=`Epic|${'1'.repeat(32)}|0`;other.seenIds[0]=other.state.Players[0].PrimaryId;assert.equal((await f.post(other)).status,403);
  const broken=structuredClone(p);broken.end.WinnerTeamNum=2;assert.equal((await f.post(broken)).status,400);
  f.actor.user=null;assert.equal((await f.post(p)).status,401);assert.equal((await f.route.GET()).status,401);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM result_observations').get().n,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM epic_accounts').get().n,0);
 }finally{f.db.close();}
});
test('Vraie route direct : réception visible par tous, identité liée renommée, répétition et confirmation Epic sans doublon',async()=>{
 const f=await server();try{
  const p=payload();for(let i=0;i<2;i++){const r=await f.post(p);assert.equal(r.status,200);assert.equal((await r.json()).ok,true);}
  let state=await (await f.readState()).json(),stats=summarize(state.results,state.exercises,'',state.matchRosters);
  assert.deepEqual(stats.map(p=>p.played),[1,1,1]);assert.deepEqual(stats.map(p=>p.remaining),[5,5,5]);assert.equal(state.matchRosters.length,1);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM result_observations').get().n,6);
  const parsed=parseLiveMatch(p);parsed.rows[0].name='chat-pris-tea';for(const row of parsed.rows)row.winner=0;
  await f.env.DB.batch(await observationWrites(f.env.DB,{...parsed,sourceType:'epic',sourceId:'chat-pris-tea'},new Date().toISOString()));
  state=await (await f.readState()).json();stats=summarize(state.results,state.exercises,'',state.matchRosters);assert.deepEqual(stats.map(p=>p.played),[1,1,1]);assert.deepEqual(stats.map(p=>p.wins),[1,1,1]);assert.deepEqual(stats.map(p=>p.remaining),[0,0,0]);assert.equal(state.matchRosters.length,1);
 }finally{f.db.close();}
});
test('Onglet réel : panne après sauvegarde, file locale reprise sans perdre ni doubler la partie',async()=>{
 const f=await server();const storage=new Map(),timers=new Map(),sockets=[],statuses=[];let nextTimer=0,fail=true,posts=0;
 class Socket{constructor(url){assert.equal(url,'ws://localhost:49124/');sockets.push(this);}close(){}emit(message){this.onmessage({data:JSON.stringify(message)});}}
 const config={WebSocketType:Socket,storage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},schedule:(fn,delay)=>{timers.set(++nextTimer,{fn,delay});return nextTimer;},cancel:id=>timers.delete(id),now:()=>now,onStatus:patch=>statuses.push(patch),fetcher:async(url,options)=>{assert.equal(url,'/api/live');assert.equal(options.headers.Authorization,undefined);posts++;const r=await f.post(options.body);if(fail){fail=false;throw Error('Synthetic connection lost after commit');}return r;}};
 let bridge=liveBridge(config);try{
  bridge.start();sockets[0].onopen();const p=payload();sockets[0].emit(packet('MatchCreated',{MatchGuid:p.state.MatchGuid}));for(const m of [packet('UpdateState',p.state),packet('MatchEnded',p.end),packet('UpdateState',p.state),packet('UpdateState',p.state)])sockets[0].emit(m);
  await new Promise(done=>setTimeout(done,20));assert.equal(posts,1);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM result_observations').get().n,6);assert.equal(JSON.parse(storage.get('rl-live-queue-v1')).length,1);
  bridge.stop();assert.equal(timers.size,0);bridge=liveBridge(config);bridge.start();await new Promise(done=>setTimeout(done,20));assert.equal(posts,2);assert.equal(JSON.parse(storage.get('rl-live-queue-v1')).length,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM result_observations').get().n,6);assert.ok(statuses.some(s=>s.lastReceived===now));
  const merged=await readMerged(f.env.DB);assert.deepEqual(summarize(merged.rows,[],'',merged.rosters).map(p=>p.played),[1,1,1]);
 }finally{bridge.stop();f.db.close();}
});

test('Vraie page direct : activation explicite, réception du match, arrêt du socket et données visibles dans le tableau',async()=>{
 const f=await server(),saved=new Map(),storage=new Map(),sockets=[];
 const source=readFileSync(new URL('../app/direct/client.tsx',import.meta.url),'utf8');
 const compiled=transpileModule(source,{compilerOptions:{module:ModuleKind.ESNext,jsx:JsxEmit.ReactJSX}}).outputText.replaceAll('"react/jsx-runtime"',JSON.stringify(import.meta.resolve('react/jsx-runtime'))).replaceAll("'react'",JSON.stringify(import.meta.resolve('react'))).replaceAll("'../../lib/live-bridge.mjs'",JSON.stringify(new URL('../lib/live-bridge.mjs',import.meta.url).href));
 const {default:Live}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
 function override(key,value){saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
 class Socket{closed=false;constructor(){sockets.push(this);}close(){this.closed=true;}emit(message){this.onmessage({data:JSON.stringify(message)});}}
 let markPost;const posted=new Promise(done=>{markPost=done;});
 override('IS_REACT_ACT_ENVIRONMENT',true);override('window',{addEventListener(){},removeEventListener(){}});override('WebSocket',Socket);override('localStorage',{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)});
 override('fetch',async(url,options)=>{assert.equal(url,'/api/live');if(!options)return f.route.GET();const r=await f.post(options.body);setImmediate(markPost);return r;});
 const content=node=>typeof node==='string'?node:node.children?.map(content).join('')||'';
 let view;const oldError=console.error;console.error=(message,...args)=>{if(!String(message).startsWith('react-test-renderer is deprecated'))oldError(message,...args);};
 try{
  await act(async()=>{view=create(React.createElement(Live));await new Promise(done=>setImmediate(done));});
  assert.equal(sockets.length,0);const button=()=>view.root.findAllByType('button').find(b=>content(b)==='Activer le direct sur ce PC');assert.equal(button().props.disabled,false);
  await act(async()=>{button().props.onClick();sockets[0].onopen();});assert.equal(sockets.length,1);assert.equal(storage.get('rl-live-enabled-v1'),'true');assert.match(content(view.root.findByProps({role:'status'})),/Connecté au jeu/);
  const p=payload('synthetic-page-match');await act(async()=>{sockets[0].emit(packet('MatchCreated',{MatchGuid:p.state.MatchGuid}));sockets[0].emit(packet('UpdateState',p.state));sockets[0].emit(packet('MatchEnded',p.end));sockets[0].emit(packet('UpdateState',p.state));sockets[0].emit(packet('UpdateState',p.state));await posted;await new Promise(done=>setImmediate(done));});
  assert.match(content(view.root),/Match reçu par RL-Pompes/);assert.match(content(view.root),/Dernier envoi confirmé/);
  const state=await (await f.readState()).json();assert.deepEqual(summarize(state.results,[],'',state.matchRosters).map(p=>p.played),[1,1,1]);
  await act(async()=>view.root.findAllByType('button').find(b=>content(b)==='Arrêter le direct').props.onClick());assert.equal(sockets[0].closed,true);assert.equal(storage.has('rl-live-enabled-v1'),false);
 }finally{if(view)await act(async()=>view.unmount());console.error=oldError;for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}f.db.close();}
});
