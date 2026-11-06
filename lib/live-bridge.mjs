import {statsStream,matchCapture,parseLiveMatch} from './live-stats.mjs';

const queueKey='rl-live-queue-v1';
export function liveBridge({WebSocketType=globalThis.WebSocket,fetcher=globalThis.fetch,storage=globalThis.localStorage,onStatus=(_patch)=>{},schedule=setTimeout,cancel=clearTimeout,now=Date.now}={}){
 let queue=[],active=false,socket=null,retry=null,uploadRetry=null,sending=false,backoff=1000;
 const persist=()=>{try{storage?.setItem(queueKey,JSON.stringify(queue));}catch{onStatus({message:'Stockage local indisponible : garde cet onglet ouvert jusqu’à l’envoi.'});}onStatus({queued:queue.length});};
 try{const saved=JSON.parse(storage?.getItem(queueKey)||'[]');if(Array.isArray(saved))queue=saved.slice(-20).filter(p=>{try{parseLiveMatch(p,now());return true;}catch{return false;}});}catch{}
 const stream=statsStream();
 const capture=matchCapture(payload=>{
  const existing=queue.findIndex(p=>p.state.MatchGuid===payload.state.MatchGuid);if(existing>=0)queue[existing]=payload;else queue.push(payload);
  if(queue.length>20){queue.shift();onStatus({message:'Plus de 20 matchs en attente : le plus ancien n’a pas pu être envoyé.'});}
  persist();void upload();
 },now);
 function laterUpload(){if(active&&!uploadRetry)uploadRetry=schedule(()=>{uploadRetry=null;void upload();},10000);}
 async function upload(){
  if(!active||sending||!queue.length)return;sending=true;
  try{while(active&&queue.length){
   const payload=queue[0];
   try{parseLiveMatch(payload,now());}catch{queue.shift();persist();onStatus({message:'Un match trop ancien n’a pas pu être envoyé.'});continue;}
   let response;
   try{response=await fetcher('/api/live',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});}catch{onStatus({message:'Envoi en attente de connexion Internet.'});laterUpload();break;}
   if(!response.ok){let error;try{error=(await response.json()).error;}catch{}onStatus({message:error||'Envoi indisponible : nouvelle tentative automatique.'});
    if(response.status===400||response.status===413){if(queue[0]===payload)queue.shift();persist();continue;}
    laterUpload();break;
   }
   let receipt;try{receipt=await response.json();}catch{}
   if(receipt?.ok!==true||receipt.match!==payload.state.MatchGuid.trim().toLowerCase()){onStatus({message:'Réception non confirmée : reconnecte-toi au site. Le match reste en attente.'});laterUpload();break;}
   if(queue[0]===payload)queue.shift();persist();onStatus({lastReceived:now(),message:'Match reçu par RL-Pompes. Le tableau du club se met à jour automatiquement.'});
  }}finally{sending=false;}
 }
 function connect(){
  if(!active||socket)return;
  try{socket=new WebSocketType('ws://localhost:49124/');}catch{onStatus({connection:'Connexion locale refusée : vérifie les réglages et l’autorisation réseau local.'});reconnect();return;}
  const current=socket;
  current.onopen=()=>{if(!active||socket!==current)return;backoff=1000;onStatus({connection:'Connecté au jeu · en attente d’une nouvelle partie.'});};
  current.onmessage=event=>{if(!active||socket!==current)return;try{for(const packet of stream.push(event.data))capture.handle(packet);}catch(e){stream.reset();capture.reset();onStatus({message:e.message||'Message local illisible : en attente de la prochaine partie.'});}};
  current.onerror=()=>{if(active&&socket===current)onStatus({connection:'Jeu inaccessible : vérifie la configuration, le lancement du jeu et l’autorisation réseau local.'});};
  current.onclose=()=>{if(socket!==current)return;socket=null;stream.reset();capture.reset();if(active){onStatus({connection:'En attente de Rocket League ou de la connexion locale.'});reconnect();}};
 }
 function reconnect(){if(active&&!retry){const delay=backoff;backoff=Math.min(30000,backoff*2);retry=schedule(()=>{retry=null;connect();},delay);}}
 return {start(){if(active)return;active=true;onStatus({active:true,queued:queue.length,connection:'Connexion au jeu sur ce PC…'});connect();void upload();},stop(){active=false;cancel(retry);cancel(uploadRetry);retry=uploadRetry=null;const current=socket;socket=null;current?.close();stream.reset();capture.reset();onStatus({active:false,connection:'Direct arrêté sur cet appareil.'});},retry(){void upload();}};
}
