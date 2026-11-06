import {parse} from 'parse5';
import {readPlayerIdentities} from './player-identities.mjs';
import {projectMmrRankWrite,publicCloseFreshMs} from './mmr-ledger.mjs';

// Deliberately fixed PUBLIC profile URLs. No stored Epic ID, login, cookie or
// token is ever sent to this provider. Never infer a player from a match nickname.
export const publicProfiles=[
 {player:'chat-pris-tea',platform:'Epic',handle:'chat-pris-tea'},
 {player:'nokouki',platform:'Epic',handle:'nokouki'},
 {player:'kevin-74000',platform:'PS4',handle:'kevin-74000'},
].map(p=>({...p,url:`https://rlstats.net/profile/${p.platform}/${p.handle}`}));
const retryMs=180000,maxBytes=512000,author='public-rlstats';
const attr=(node,name)=>node.attrs?.find(a=>a.name===name)?.value;
const hasClass=(node,name)=>(attr(node,'class')||'').split(/\s+/).includes(name);
const text=node=>node.nodeName==='#text'?node.value:(node.childNodes||[]).filter(n=>!['script','style'].includes(n.nodeName)).map(text).join('');
const clean=node=>text(node).replace(/\s+/g,' ').trim();
function findAll(node,test){const found=[];function walk(n){if(test(n))found.push(n);for(const c of n.childNodes||[])walk(c);}walk(node);return found;}
function one(nodes,message){if(nodes.length!==1)throw Error(message);return nodes[0];}
function sourceDate(value){
 const m=/^([A-Z][a-z]{2})\/(\d{1,2})\/(20\d{2}) (\d{2}):(\d{2}):(\d{2}) GMT$/.exec(value||'');
 if(!m)throw Error('Date du relevé public absente.');
 const month=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(m[1]);
 const nums=[+m[3],month,+m[2],+m[4],+m[5],+m[6]],date=new Date(Date.UTC(...nums));
 if(month<0||date.getUTCFullYear()!==nums[0]||date.getUTCMonth()!==month||date.getUTCDate()!==nums[2]||nums[3]>23||nums[4]>59||nums[5]>59)throw Error('Date du relevé public invalide.');
 return date.toISOString();
}
export function parsePublicRank(html,profile,now=Date.now()){
 if(typeof html!=='string'||html.length>maxBytes)throw Error('Page publique trop volumineuse.');
 const doc=parse(html),heading=one(findAll(doc,n=>n.tagName==='h1'&&findAll(n,s=>s.tagName==='span'&&/^Updated\s/.test(clean(s))).length>0),'Profil public non reconnu.');
 const canonical=one(findAll(doc,n=>n.tagName==='link'&&attr(n,'rel')==='canonical'),'Adresse du profil public absente.');
 if(attr(canonical,'href')?.toLowerCase()!==profile.url.toLowerCase())throw Error('Adresse du profil public différente.');
 const name=(heading.childNodes||[]).filter(n=>n.nodeName==='#text').map(text).join('').trim();
 const platform=one(findAll(heading,n=>n.tagName==='img'),'Plateforme du profil absente.');
 if(name.normalize('NFKC').toLowerCase()!==profile.handle.toLowerCase()||attr(platform,'alt')!==profile.platform)throw Error('Identité du profil public différente.');
 const updated=one(findAll(heading,n=>n.tagName==='span'&&/^Updated\s/.test(clean(n))),'Date du relevé public absente.');
 const observedAt=sourceDate(attr(updated,'title')),age=now-Date.parse(observedAt);
 if(age< -30000||age>publicCloseFreshMs)throw Error('Relevé public trop ancien ou daté dans le futur.');
 const skills=one(findAll(doc,n=>attr(n,'id')==='skills'),'Classements publics absents.');
 const selectors=findAll(skills,n=>hasClass(n,'season-selector')),active=one(selectors.filter(n=>hasClass(n,'active')),'Saison courante non reconnue.');
 const seasonId=/^SelectSeason\((\d+)\)$/.exec(attr(active,'onclick')||'')?.[1];
 const seasons=selectors.map(n=>Number(/^Season (\d+)$/.exec(clean(n))?.[1]));
 const season=Number(/^Season (\d+)$/.exec(clean(active))?.[1]);
 if(!seasonId||!Number.isSafeInteger(season)||!seasons.every(Number.isSafeInteger)||Math.max(...seasons)!==season)throw Error('Saison courante ambiguë.');
 const body=one(findAll(skills,n=>hasClass(n,'block-body')&&attr(n,'data-season')===seasonId),'Classements de la saison courante absents.');
 const tables=findAll(body,n=>n.tagName==='table').filter(t=>findAll(t,n=>n.tagName==='tr')[0]?.childNodes?.some(n=>n.tagName==='th'&&clean(n)==='2v2 Doubles'));
 const table=one(tables,'Classement 2v2 absent ou ambigu.');
 const rows=findAll(table,n=>n.tagName==='tr'),cells=row=>(row?.childNodes||[]).filter(n=>n.tagName==='td'||n.tagName==='th');
 const headers=cells(rows[0]),indices=headers.flatMap((n,i)=>clean(n)==='2v2 Doubles'?[i]:[]),column=one(indices,'Colonne 2v2 ambiguë.');
 if(rows.length<5||!rows.slice(0,5).every(r=>cells(r).length===headers.length))throw Error('Tableau public incomplet.');
 // The surrounding <mmr> tags are promotion/demotion ESTIMATES, not the rating.
 const ratingCell=cells(rows[3])[column],raw=(ratingCell.childNodes||[]).filter(n=>n.nodeName==='#text').map(text).join('').trim();
 if(!/^\d{1,5}$/.test(raw)||Number(raw)>10000)throw Error('MMR 2v2 public invalide.');
 const icons=findAll(cells(rows[4])[column],n=>n.tagName==='img'&&!hasClass(n,'unranked-estimate'));
 const icon=one(icons,'Rang 2v2 public ambigu.'),tier=Number(/\/s\d+rank(\d+)\.png$/.exec(attr(icon,'src')||'')?.[1]);
 const divisionText=clean(cells(rows[2])[column]),roman=['I','II','III','IV'];
 const division=tier>0&&tier<22?roman.indexOf(divisionText.replace(/^Division /,''))+1:null;
 if(!Number.isSafeInteger(tier)||tier<0||tier>22||(division!==null&&division<1))throw Error('Rang ou division 2v2 public invalide.');
 return {player:profile.player,mmr:Number(raw),tier,division,source:'rlstats',sourceAt:observedAt,sourceUrl:profile.url,season};
}
async function fetchRank(profile,fetcher,now){
 const response=await fetcher(profile.url,{redirect:'manual',headers:{'User-Agent':'RL-Pompes/1.0 (+https://example.chatgpt.site)','Accept':'text/html'},signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error(`Source publique indisponible (HTTP ${response.status}).`);
 if(!response.headers.get('content-type')?.toLowerCase().startsWith('text/html'))throw Error('Format de la source publique inattendu.');
 if(Number(response.headers.get('content-length'))>maxBytes)throw Error('Page publique trop volumineuse.');
 const reader=response.body?.getReader();if(!reader)throw Error('Page publique vide.');
 const chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes)throw Error('Page publique trop volumineuse.');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
 const data=new Uint8Array(size);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength;}
 return parsePublicRank(new TextDecoder().decode(data),profile,now);
}
export async function readPublicMmrStatus(db){
 const row=await db.prepare('SELECT last_attempt,next_attempt,status,detail FROM public_mmr_sync WHERE id=1').first();
 return {profiles:publicProfiles,lastAttempt:row?.last_attempt??null,nextAttempt:row?.next_attempt??null,status:row?.status??'waiting',...JSON.parse(row?.detail||'{"updated":[],"errors":[]}')};
}
export async function syncPublicMmr(db,{now=Date.now(),fetcher=globalThis.fetch}={}){
 const at=new Date(now).toISOString(),next=new Date(now+retryMs).toISOString();
 await db.prepare("INSERT INTO public_mmr_sync (id,next_attempt,status,detail) VALUES (1,'','waiting','{}') ON CONFLICT(id) DO NOTHING").run();
 const claim=await db.prepare("UPDATE public_mmr_sync SET next_attempt=?,last_attempt=?,status='reading' WHERE id=1 AND next_attempt<=?").bind(next,at,at).run();
 if(Number(claim.meta?.changes??claim.changes)!==1)return {ok:true,ran:false,...await readPublicMmrStatus(db)};
 const identities=await readPlayerIdentities(db),updated=[],errors=[],writes=[];
 const responses=await Promise.allSettled(publicProfiles.map(p=>identities.some(i=>i.slot===p.player)?fetchRank(p,fetcher,now):Promise.reject(Error('Identité du joueur à associer dans RL-Pompes.'))));
 for(const [i,result] of responses.entries()){
  const profile=publicProfiles[i];if(result.status!=='fulfilled'){const reason=result.reason;errors.push({player:profile.player,error:reason?.name==='TimeoutError'?'Source publique trop lente.':String(reason?.message||'Lecture publique impossible.')});continue;}
  const rank=result.value,identity=identities.find(i=>i.slot===profile.player);
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(rank))));
  const id='rlstats-'+[...digest].map(b=>b.toString(16).padStart(2,'0')).join('');
  writes.push(db.prepare("INSERT INTO mmr_entries (id,player,mmr,tier,division,author,source,source_at,source_url) VALUES (?,?,?,?,?,?,'rlstats',?,?) ON CONFLICT(id) DO NOTHING").bind(id,rank.player,rank.mmr,rank.tier,rank.division,author,rank.sourceAt,rank.sourceUrl));
  writes.push(projectMmrRankWrite(db,{playerId:identity.player_id,id,author,player:rank.player}));updated.push(rank.player);
 }
 const status=updated.length===publicProfiles.length?'ready':updated.length?'partial':'unavailable';
 writes.push(db.prepare('UPDATE public_mmr_sync SET status=?,detail=? WHERE id=1').bind(status,JSON.stringify({updated,errors})));
 await db.batch(writes);return {ok:true,ran:true,...await readPublicMmrStatus(db)};
}

// Privileged updater import. The agent reads public pages using its ordinary
// browsing access; this path parses snapshots and NEVER fetches the provider.
export async function importPublicMmr(db,pages,{now=Date.now()}={}){
 if(!Array.isArray(pages)||!pages.length||pages.length>3||new Set(pages.map(p=>p?.player)).size!==pages.length||pages.some(p=>!publicProfiles.some(t=>t.player===p?.player)||typeof p.html!=='string'||p.html.length>maxBytes))throw Error('Envoi de profils publics invalide.');
 return syncPublicMmr(db,{now,fetcher:async url=>{
  const profile=publicProfiles.find(p=>p.url===url),page=pages.find(p=>p.player===profile?.player);
  if(!page)throw Error('Relevé public non reçu.');
  return new Response(page.html,{headers:{'Content-Type':'text/html; charset=utf-8'}});
 }});
}
