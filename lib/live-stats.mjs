import {normalizeParticipant,parisDay} from './domain.mjs';
import {validateMatchRosters} from './match-rules.mjs';

// Official local Stats API. Public matchmaking playlists only; unknown, private,
// training and bot playlists fail closed. Count is the full standard scoreboard.
const playerCounts=new Map([[1,2],[2,4],[3,6],[4,8],[10,2],[11,4],[13,6],[27,4],[28,6],[29,6],[30,6],[34,6]]);
const canonical=id=>String(id).replace(/^PSN\|/,'PS4|').replace(/^(Epic\|)([^|]+)/,(_,prefix,uid)=>prefix+uid.toLowerCase());
export function parseLiveMatch(input,now=Date.now()){
 const {state,end,startedAt,endedAt,seenIds}=input||{},game=state?.Game;
 const guid=state?.MatchGuid;
 if(typeof guid!=='string'||!guid.trim()||guid.length>128||end?.MatchGuid!==guid||![0,1].includes(end?.WinnerTeamNum))throw Error('Fin de match absente ou incohérente.');
 if(!Number.isSafeInteger(startedAt)||!Number.isSafeInteger(endedAt)||startedAt>endedAt||endedAt-startedAt>10800000||endedAt>now+30000||endedAt<now-86400000)throw Error('Date du match invalide.');
 const count=playerCounts.get(game?.PlaylistId);
 if(!count||game?.bHasWinner!==true||game?.bReplay!==false)throw Error('Match public terminé requis.');
 if(!Array.isArray(game.Teams)||game.Teams.length!==2||new Set(game.Teams.map(t=>t.TeamNum)).size!==2||!game.Teams.every(t=>[0,1].includes(t.TeamNum)&&typeof t.Name==='string'&&t.Name&&Number.isSafeInteger(t.Score)&&t.Score>=0))throw Error('Équipes finales invalides.');
 const winner=game.Teams.find(t=>t.TeamNum===end.WinnerTeamNum);
 if(game.Winner!==winner.Name)throw Error('Gagnant du tableau différent de la fin de match.');
 if(!Array.isArray(state.Players)||state.Players.length!==count||!Array.isArray(seenIds)||seenIds.length!==count)throw Error('Tableau final incomplet : lecture Epic différée conservée.');
 const ids=state.Players.map(p=>canonical(p.PrimaryId));
 if(new Set(ids).size!==count||new Set(seenIds.map(canonical)).size!==count||!seenIds.every(id=>ids.includes(canonical(id))))throw Error('Participants du tableau incomplets ou ambigus.');
 if(!state.Players.every(p=>typeof p.PrimaryId==='string'&&/^(Epic|Steam|PS4|PSN|XboxOne|Switch|PsyNet)\|[^\s|]{1,128}\|0$/.test(p.PrimaryId)))throw Error('Identité de joueur manquante ou bot.');
 if(![0,1].every(team=>state.Players.filter(p=>p.TeamNum===team).length===count/2))throw Error('Tableau des équipes incomplet.');
 // Epic groups its history by RecordStartTimestamp. Use the observed start,
 // including matches that finish after Paris midnight, to keep that convention.
 const day=parisDay(new Date(startedAt));
 const rows=state.Players.map(p=>normalizeParticipant({MatchGuid:guid.trim().toLowerCase(),PlayerId:canonical(p.PrimaryId),Name:p.Name,Day:day,Kind:'match',Team:p.TeamNum,Winner:end.WinnerTeamNum,Score:p.Score,Goals:p.Goals,Assists:p.Assists,Saves:p.Saves}));
 const rosters=validateMatchRosters([{MatchGuid:rows[0].matchGuid,PlayerCount:count}],rows);
 return {rows,rosters};
}

// WebSocket frames may contain several JSON objects, or part of one object.
// Bound the stream and handle braces inside escaped JSON strings correctly.
export function statsStream(){
 let buffer='';
 return {push(text){
  if(typeof text!=='string'||text.length>262144||(buffer+=text).length>262144){buffer='';throw Error('Message local trop volumineux.');}
  const messages=[];let start=-1,depth=0,quoted=false,escaped=false,consumed=0;
  try{for(let i=0;i<buffer.length;i++){
   const c=buffer[i];
   if(start<0){if(/\s/.test(c)){consumed=i+1;continue;}if(c!=='{')throw Error();start=i;depth=1;continue;}
   if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
   if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0){const message=JSON.parse(buffer.slice(start,i+1));if(typeof message.Data==='string')message.Data=JSON.parse(message.Data);messages.push(message);if(messages.length>100)throw Error();start=-1;consumed=i+1;}
  }}catch{buffer='';throw Error('Message local illisible.');}
  buffer=buffer.slice(consumed);return messages;
 },reset(){buffer='';}};
}

// A live match must be observed from its creation/initialization. Never import
// a loaded replay or reuse another match's cached scoreboard. Wait for two
// identical post-winner updates instead of treating the last pre-end tick as final.
export function matchCapture(onComplete,now=Date.now){
 let current=null;const blocked=new Set();
 return {handle(message){
  const {Event:event,Data:data}=message||{};if(!data||typeof data.MatchGuid!=='string')return;
  const guid=data.MatchGuid;
  if(event==='ReplayCreated'){blocked.add(guid);if(blocked.size>30)blocked.delete(blocked.values().next().value);if(current?.guid===guid)current=null;return;}
  if(event==='MatchDestroyed'){if(current?.guid===guid)current=null;return;}
  if((event==='MatchCreated'||event==='MatchInitialized')&&!blocked.has(guid)){
   if(current?.guid!==guid)current={guid,startedAt:now(),seen:new Set(),end:null,endedAt:null,candidate:null,sent:false};return;
  }
  if(!current||current.guid!==guid||current.sent||blocked.has(guid))return;
  if(event==='MatchEnded'){current.end={MatchGuid:guid,WinnerTeamNum:data.WinnerTeamNum};current.endedAt=now();current.candidate=null;return;}
  if(event!=='UpdateState'||!Array.isArray(data.Players))return;
  for(const player of data.Players)current.seen.add(player.PrimaryId);
  if(current.seen.size>16){current=null;return;}
  if(!current.end)return;
  const state={MatchGuid:guid,Players:data.Players.map(({Name,PrimaryId,TeamNum,Score,Goals,Assists,Saves})=>({Name,PrimaryId,TeamNum,Score,Goals,Assists,Saves})),Game:{PlaylistId:data.Game?.PlaylistId,Teams:data.Game?.Teams?.map(({Name,TeamNum,Score})=>({Name,TeamNum,Score})),bHasWinner:data.Game?.bHasWinner,bReplay:data.Game?.bReplay,Winner:data.Game?.Winner}};
  const payload={state,end:current.end,startedAt:current.startedAt,endedAt:current.endedAt,seenIds:[...current.seen]};
  try{parseLiveMatch(payload,now());}catch{current.candidate=null;return;}
  const snapshot=JSON.stringify(state);
  if(snapshot!==current.candidate){current.candidate=snapshot;return;}
  current.sent=true;onComplete(payload);
 },reset(){current=null;}};
}
