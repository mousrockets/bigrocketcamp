// Server only. Community protocol metadata (not personal account credentials):
// LEX0RE/rockpload @ 3b9057cd762fdef0a737b25ed13a1074f491ee2e,
// dank/rlapi and LEX0RE/rlru. See docs/epic-sync.md.
const CLIENT='REDACTED_CLIENT_ID';
const CLIENT_SECRET='REDACTED_CLIENT_SECRET';
const DEPLOYMENT='REDACTED_DEPLOYMENT_ID';
const VERSION='261013.63066.530866';
const FEATURE='REDACTED_FEATURE_SET';
const BUILD_SECRET='REDACTED_BUILD_SECRET';
const SIG_KEY='REDACTED_SIGNATURE_KEY';
const encode=s=>new TextEncoder().encode(s);
export class EpicError extends Error {constructor(code){super(code);this.code=code;}}
const codeOf=data=>String(data?.errorCode||data?.error||'epic_unavailable');
export async function epicForm(path,params,fetcher=fetch){
 try{
  const r=await fetcher('https://api.epicgames.dev/epic/oauth/v2/'+path,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',...(path==='token'?{Authorization:'Basic '+btoa(CLIENT+':'+CLIENT_SECRET)}:{})},body:new URLSearchParams(params),signal:AbortSignal.timeout(20000)});
  const data=await r.json();if(!r.ok)throw new EpicError(codeOf(data));return data;
 }catch(e){if(e instanceof EpicError)throw e;throw new EpicError('epic_unavailable');}
}
export async function startDevice(){
 const d=await epicForm('deviceAuthorization',{client_id:CLIENT});
 if(d.verification_uri!=='https://www.epicgames.com/activate'||typeof d.device_code!=='string'||typeof d.user_code!=='string'||!Number.isFinite(d.expires_in))throw new EpicError('invalid_device_response');
 return {device:d.device_code,code:d.user_code,url:d.verification_uri,expiresIn:Math.min(600,d.expires_in),interval:Math.max(5,Number(d.interval)||5)};
}
export const pollDevice=device=>epicForm('token',{grant_type:'device_code',device_code:device,deployment_id:DEPLOYMENT,scope:'basic_profile'});
export const refreshToken=token=>epicForm('token',{grant_type:'refresh_token',refresh_token:token,deployment_id:DEPLOYMENT,scope:'basic_profile'});
export function buildId(version=VERSION){let value=0xffffffff;for(const c of version){for(const b of [c.charCodeAt(0)&255,c.charCodeAt(0)>>8]){value^=b<<24;for(let i=0;i<8;i++)value=(value<<1)^((value&0x80000000)?0x04c11db7:0);}}return String((value^0xffffffff)|0);}
export async function signature(body){const key=await crypto.subtle.importKey('raw',encode(SIG_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC',key,encode('-'+body)))));}
export function parseFrame(frame){const split=frame.indexOf('\r\n\r\n');if(split<0)throw new EpicError('invalid_frame');const headers=Object.fromEntries(frame.slice(0,split).split('\r\n').map(line=>{const i=line.indexOf(':');return [line.slice(0,i).toLowerCase(),line.slice(i+1).trim()];}));return {headers,body:frame.slice(split+4)?JSON.parse(frame.slice(split+4)):null};}
export async function connectPsy(tokens,fetcher=fetch){
 const headers={'Content-Type':'application/x-www-form-urlencoded','User-Agent':`RL Win/${VERSION} gzip (x86_64-pc-win32) curl-7.67.0 Schannel`,PsyBuildID:buildId(),PsyBuildSecret:BUILD_SECRET,PsyEnvironment:'Prod',PsyRequestID:'PsyNetMessage_'+crypto.randomUUID()+'_1'};
 const body=JSON.stringify({Platform:'Epic',PlayerName:'',PlayerID:tokens.account_id,Language:'INT',AuthTicket:tokens.access_token,BuildRegion:'',FeatureSet:FEATURE,Device:'PC',LocalFirstPlayerID:`Epic|${tokens.account_id}|0`,bSkipAuth:false,bSetAsPrimaryAccount:true,EpicAuthTicket:tokens.access_token,EpicAccountID:tokens.account_id});
 headers.PsySig=await signature(body);
 let auth;
 try{const r=await fetcher('https://api.rlpp.psynet.gg/rpc/Auth/AuthPlayer/v2',{method:'POST',headers,body,signal:AbortSignal.timeout(20000)});auth=await r.json();if(!r.ok)throw new EpicError('psynet_unavailable');}catch(e){if(e instanceof EpicError)throw e;throw new EpicError('psynet_unavailable');}
 if(auth.Error)throw new EpicError(auth.Error.Type==='LoginBanned'?'LoginBanned':'psynet_auth_failed');
 const result=auth.Result,url=new URL(result?.PerConURLv2||'https://invalid');
 if(url.protocol!=='wss:'||!url.hostname.endsWith('.psynet.gg')||!result.PsyToken||!result.SessionID)throw new EpicError('invalid_psynet_session');
 url.protocol='https:';
 let socket;
 try{const r=await fetcher(url,{headers:{Upgrade:'websocket',PsyBuildID:buildId(),'User-Agent':`RL Win/${VERSION} gzip`,PsyEnvironment:'Prod',PsyToken:result.PsyToken,PsySessionID:result.SessionID},signal:AbortSignal.timeout(15000)});socket=r.webSocket;if(!socket)throw Error();socket.accept();}catch{throw new EpicError('psynet_socket_failed');}
 const waiting=new Map();let closed=false;
 const fail=()=>{closed=true;for(const p of waiting.values()){clearTimeout(p.timer);p.reject(new EpicError('psynet_closed'));}waiting.clear();};
 socket.addEventListener('close',fail);socket.addEventListener('error',fail);
 socket.addEventListener('message',event=>{try{const {headers,body}=parseFrame(event.data);if('psyping' in headers){socket.send('PsyPong: \r\n\r\n');return;}const id=headers.psyresponseid,p=waiting.get(id);if(!p)return;waiting.delete(id);clearTimeout(p.timer);if(body?.Error)p.reject(new EpicError(body.Error.Type==='LoginBanned'?'LoginBanned':'psynet_request_failed'));else p.resolve(body?.Result);}catch{fail();try{socket.close();}catch{}}});
 return {async request(service,params){if(closed)throw new EpicError('psynet_closed');const id='PsyNetMessage_'+crypto.randomUUID()+'_1',body=JSON.stringify(params),sig=await signature(body);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{waiting.delete(id);reject(new EpicError('psynet_timeout'));},20000);waiting.set(id,{resolve,reject,timer});try{socket.send(`PsyService: ${service}\r\nPsyRequestID: ${id}\r\nPsySig: ${sig}\r\n\r\n${body}`);}catch{clearTimeout(timer);waiting.delete(id);reject(new EpicError('psynet_closed'));}});},close(){fail();try{socket.close(1000,'Done');}catch{}}};
}
