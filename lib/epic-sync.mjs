// Server only. Tokens are encrypted at rest, never returned by public status APIs.
import {roster,normalizeParticipant,parisDay,dailyRecap} from './domain.mjs';
import {validateMatchRosters} from './match-rules.mjs';
import {playerKey,observationWrites,readMerged} from './reconcile.mjs';
import {seal,unseal} from './epic-vault.mjs';
import {startDevice,pollDevice,refreshToken,connectPsy} from './epic-protocol.mjs';

export const slots=['observer',...roster];
const changes=r=>Number(r?.meta?.changes??r?.changes??0);
const tokenContext=(owner,slot)=>`epic-account:${owner}:${slot}`;
const grantContext=(owner,slot)=>`epic-grant:${owner}:${slot}`;
const ensureSlot=slot=>{if(!slots.includes(slot))throw Error('Compte inconnu.');};
const ensureVault=env=>{if(!env.EPIC_VAULT_KEY)throw Error('Connexion Epic indisponible pour le moment.');};
const errorCode=e=>typeof e?.code==='string'?e.code:'';
export async function connectionStatus(env,userId){
 const rows=(await env.DB.prepare('SELECT slot,owner,status,last_sync,last_attempt,cooldown_until,coverage,detail FROM epic_accounts').all()).results;
 const pending=(await env.DB.prepare('SELECT slot,expires,interval FROM epic_grants WHERE owner=? AND expires>? ORDER BY expires DESC').bind(userId,Date.now()).all()).results;
 return {connections:slots.map(slot=>{const r=rows.find(r=>r.slot===slot);return r?{slot,connected:true,owned:r.owner===userId,status:r.status,lastSync:r.last_sync,lastAttempt:r.last_attempt,cooldownUntil:r.cooldown_until,coverage:r.coverage,detail:r.detail}:{slot,connected:false,owned:false};}),pending,configured:!!env.EPIC_VAULT_KEY};
}
export async function beginLink(env,userId,slot){
 ensureSlot(slot);ensureVault(env);const db=env.DB,now=Date.now();
 const existing=await db.prepare('SELECT owner,lease_until FROM epic_accounts WHERE slot=?').bind(slot).first();
 if(existing&&existing.owner!==userId)throw Error('Ce compte a été connecté par un autre membre.');
 if(existing?.lease_until>now)throw Error('Synchronisation en cours. Réessaie dans quelques minutes.');
 const pending=await db.prepare('SELECT owner,expires FROM epic_grants WHERE slot=?').bind(slot).first();
 if(pending?.owner!==undefined&&pending.owner!==userId&&pending.expires>now)throw Error('Une connexion est déjà en cours.');
 const device=await startDevice(),encrypted=await seal({device:device.device},env.EPIC_VAULT_KEY,grantContext(userId,slot));
 const saved=await db.prepare('INSERT INTO epic_grants (slot,owner,device,expires,next_poll,interval,lease_until) VALUES (?,?,?,?,?,?,0) ON CONFLICT(slot) DO UPDATE SET owner=excluded.owner,device=excluded.device,expires=excluded.expires,next_poll=excluded.next_poll,interval=excluded.interval,lease_until=0 WHERE epic_grants.owner=excluded.owner OR epic_grants.expires<=?').bind(slot,userId,encrypted,now+device.expiresIn*1000,now+device.interval*1000,device.interval,now).run();
 if(!changes(saved))throw Error('Une connexion est déjà en cours.');
 return {slot,code:device.code,url:device.url,expires:now+device.expiresIn*1000,interval:device.interval};
}
export async function finishLink(env,userId,slot){
 ensureSlot(slot);ensureVault(env);const db=env.DB,now=Date.now();
 const grant=await db.prepare('SELECT * FROM epic_grants WHERE slot=? AND owner=?').bind(slot,userId).first();
 if(!grant||grant.expires<=now)throw Error('Code expiré. Lance une nouvelle connexion.');
 if(grant.next_poll>now||grant.lease_until>now)return {pending:true};
 const claim=await db.prepare('UPDATE epic_grants SET lease_until=? WHERE slot=? AND owner=? AND device=? AND lease_until<=? AND next_poll<=?').bind(now+30000,slot,userId,grant.device,now,now).run();
 if(!changes(claim))return {pending:true};
 try{
  const device=await unseal(grant.device,env.EPIC_VAULT_KEY,grantContext(userId,slot));
  let tokens;
  try{tokens=await pollDevice(device.device);}catch(e){const code=errorCode(e);if(code.includes('authorization_pending')||code.includes('slow_down')){const interval=grant.interval+(code.includes('slow_down')?5:0);await db.prepare('UPDATE epic_grants SET next_poll=?,interval=?,lease_until=0 WHERE slot=? AND owner=? AND device=?').bind(Date.now()+interval*1000,interval,slot,userId,grant.device).run();return {pending:true};}throw Error('Autorisation Epic refusée ou expirée. Relance la connexion.');}
  if(!/^[a-f0-9]{32}$/i.test(tokens.account_id)||typeof tokens.refresh_token!=='string'||typeof tokens.access_token!=='string')throw Error('Réponse Epic invalide.');
  const other=await db.prepare('SELECT slot FROM epic_accounts WHERE account_id=? AND slot<>?').bind(tokens.account_id,slot).first();
  if(other)throw Error('Ce compte Epic est déjà associé. Le compte secondaire doit être différent de tous les joueurs.');
  if(slot!=='observer'){
   const ids=(await db.prepare('SELECT player_id FROM results WHERE name=?').bind(slot).all()).results.map(r=>playerKey(r.player_id)).filter(id=>id.startsWith('Epic|'));
   if(ids.length&&!ids.some(id=>id===`Epic|${tokens.account_id}|0`||id===`Epic|${tokens.account_id}`))throw Error('Ce compte Epic ne correspond pas au joueur choisi.');
  }
  const encrypted=await seal(tokens,env.EPIC_VAULT_KEY,tokenContext(userId,slot));
  // Keep historical coverage and cooldown on reauthorization; never overwrite another owner.
  const saved=await db.prepare("INSERT INTO epic_accounts (slot,owner,account_id,tokens,status,coverage) VALUES (?,?,?,?,'ready','recent_only') ON CONFLICT(slot) DO UPDATE SET account_id=excluded.account_id,tokens=excluded.tokens,status='ready',detail=NULL WHERE epic_accounts.owner=excluded.owner AND epic_accounts.account_id=excluded.account_id AND epic_accounts.lease_until<=?").bind(slot,userId,tokens.account_id,encrypted,Date.now()).run();
  if(!changes(saved))throw Error('Compte déjà associé ou synchronisation en cours.');
  await db.prepare('DELETE FROM epic_grants WHERE slot=? AND owner=? AND device=?').bind(slot,userId,grant.device).run();
  return {connected:true,slot};
 }finally{await db.prepare('UPDATE epic_grants SET lease_until=0,next_poll=MAX(next_poll,?) WHERE slot=? AND owner=? AND device=?').bind(Date.now()+grant.interval*1000,slot,userId,grant.device).run();}
}
export async function disconnect(env,userId,slot){ensureSlot(slot);const db=env.DB,now=Date.now();const existing=await db.prepare('SELECT owner,lease_until FROM epic_accounts WHERE slot=?').bind(slot).first();if(existing?.owner!==undefined&&existing.owner!==userId)throw Error('Seul le membre qui a connecté ce compte peut le retirer.');if(existing?.lease_until>now)throw Error('Synchronisation en cours. Réessaie dans quelques minutes.');await db.batch([db.prepare('DELETE FROM epic_accounts WHERE slot=? AND owner=? AND lease_until<=?').bind(slot,userId,now),db.prepare('DELETE FROM epic_grants WHERE slot=? AND owner=?').bind(slot,userId)]);return {ok:true};}

// Only explicit Offline is safe. Missing, Online, Away or a different account all block.
export function isOffline(profile,id){const data=profile?.PlayerData;if(!Array.isArray(data))return false;const found=data.filter(p=>playerKey(p.PlayerID)===playerKey(id));return found.length===1&&found[0].PresenceState==='Offline';}
const onlinePlaylists=new Set([1,2,3,4,10,11,13,27,28,29,30,34]);
export function historyRows(entries,slot,accountId){
 if(!Array.isArray(entries)||entries.length>100)throw Error('Historique Epic invalide.');
 const rows=[],rosters=[],ids=[],timestamps=[];let skipped=0;const seen=new Set();
 for(const entry of entries){try{
  const m=entry?.Match;if(!m||typeof m.MatchGUID!=='string'||seen.has(m.MatchGUID))throw Error();
  if(m.bNoContest||!onlinePlaylists.has(m.Playlist)||!Number.isSafeInteger(m.RecordStartTimestamp)||m.RecordStartTimestamp<0||m.RecordStartTimestamp>Date.now()/1000+300||!Array.isArray(m.Players))throw Error();
  const own=m.Players.filter(p=>playerKey(p.PlayerID)===`Epic|${accountId}|0`||playerKey(p.PlayerID)===`Epic|${accountId}`);
  if(own.length!==1)throw Error();
  const day=parisDay(new Date(m.RecordStartTimestamp*1000));
  const players=m.Players.map(p=>normalizeParticipant({MatchGuid:m.MatchGUID,PlayerId:p.PlayerID,Name:p===own[0]?slot:p.PlayerName,Day:day,Kind:'match',Team:p.LastTeam,Winner:m.WinningTeam,Score:p.Score,Goals:p.Goals,Assists:p.Assists,Saves:p.Saves}));
  const complete=validateMatchRosters([{MatchGuid:m.MatchGUID,PlayerCount:players.length}],players);
  rows.push(...players);rosters.push(...complete);ids.push(m.MatchGUID);timestamps.push(m.RecordStartTimestamp);seen.add(m.MatchGUID);
 }catch{skipped++;}}
 return {rows,rosters,ids,timestamps,skipped,returned:entries.length};
}
async function claim(db,account,now){const lease=crypto.randomUUID();const saved=await db.prepare('UPDATE epic_accounts SET lease_until=?,lease_id=?,last_attempt=? WHERE slot=? AND owner=? AND lease_until<=? AND cooldown_until<=?').bind(now+600000,lease,new Date(now).toISOString(),account.slot,account.owner,now,now).run();return changes(saved)?lease:null;}
async function usableToken(env,account,lease,transport){
 const old=await unseal(account.tokens,env.EPIC_VAULT_KEY,tokenContext(account.owner,account.slot));
 let tokens;try{tokens=await transport.refreshToken(old.refresh_token);}catch(e){if(errorCode(e).includes('invalid')||errorCode(e).includes('expired'))throw Object.assign(Error('Reconnecter'),{code:'reconnect'});throw e;}
 if(tokens.account_id!==account.account_id||!tokens.access_token)throw Object.assign(Error('Reconnecter'),{code:'reconnect'});
 tokens={...old,...tokens};const encrypted=await seal(tokens,env.EPIC_VAULT_KEY,tokenContext(account.owner,account.slot));
 const saved=await env.DB.prepare('UPDATE epic_accounts SET tokens=? WHERE slot=? AND lease_id=?').bind(encrypted,account.slot,lease).run();if(!changes(saved))throw Error('Synchronisation interrompue.');return tokens;
}
async function saveStatus(db,account,lease,status,detail,cooldown=0){await db.prepare('UPDATE epic_accounts SET status=?,detail=?,cooldown_until=MAX(cooldown_until,?),lease_until=0,lease_id=NULL WHERE slot=? AND lease_id=?').bind(status,detail,cooldown,account.slot,lease).run();}
const transportDefault={refreshToken,connectPsy};
export async function syncHistories(env,userId,transport=transportDefault){
 ensureVault(env);const db=env.DB,accounts=(await db.prepare('SELECT * FROM epic_accounts').all()).results;
 const helper=accounts.find(a=>a.slot==='observer'&&a.owner===userId);
 if(!helper)return {synced:0,reason:'Compte secondaire à connecter.',results:[]};
 const helperLease=await claim(db,helper,Date.now());if(!helperLease)return {synced:0,reason:'Vérification déjà en cours ou délai de sécurité actif.',results:[]};
 let observer;const outcomes=[];
 try{
  observer=await transport.connectPsy(await usableToken(env,helper,helperLease,transport));
  for(const account of accounts.filter(a=>a.slot!=='observer'&&a.owner===userId)){
   if(account.account_id===helper.account_id){outcomes.push({slot:account.slot,status:'blocked'});continue;}
   const lease=await claim(db,account,Date.now());if(!lease){outcomes.push({slot:account.slot,status:'waiting'});continue;}
   let client;
   try{
    const id=`Epic|${account.account_id}|0`;
    if(!isOffline(await observer.request('Players/GetProfile v1',{PlayerIDs:[id]}),id)){await saveStatus(db,account,lease,'waiting_offline','En ligne ou présence inconnue : aucune connexion au joueur.');outcomes.push({slot:account.slot,status:'waiting_offline'});continue;}
    const tokens=await usableToken(env,account,lease,transport);
    // A fresh second check immediately before the player login, with no cached presence.
    if(!isOffline(await observer.request('Players/GetProfile v1',{PlayerIDs:[id]}),id)){await saveStatus(db,account,lease,'waiting_offline','Le joueur doit être hors ligne.');outcomes.push({slot:account.slot,status:'waiting_offline'});continue;}
    client=await transport.connectPsy(tokens);
    const history=await client.request('Matches/GetMatchHistory v1',{PlayerID:id});
    const parsed=historyRows(history?.Matches,account.slot,account.account_id),now=new Date().toISOString();
    const known=(await db.prepare("SELECT DISTINCT match_guid FROM result_observations WHERE source_id=? AND source_type='epic'").bind(account.slot).all()).results;
    const overlap=known.some(r=>parsed.ids.includes(r.match_guid));
    const coverage=account.coverage==='gap'||(account.last_sync&&parsed.returned>=20&&!overlap)?'gap':'recent_only';
    const writes=await observationWrites(db,{...parsed,sourceId:account.slot,sourceType:'epic'},now);
    // Each batch is atomic. The source snapshots are idempotent; older matches stay intact.
    writes.push(db.prepare('UPDATE epic_accounts SET last_sync=?,status=?,coverage=?,newest_match=?,detail=?,lease_until=0,lease_id=NULL WHERE slot=? AND lease_id=?').bind(now,parsed.skipped?'partial':'synced',coverage,parsed.timestamps.length?Math.max(...parsed.timestamps):account.newest_match,parsed.skipped?`${parsed.skipped} entrée(s) non exploitable(s).`:coverage==='gap'?'Rupture entre deux lectures : des matchs peuvent manquer.':'Fenêtre récente Epic ; exhaustivité non garantie.',account.slot,lease));
    await db.batch(writes);outcomes.push({slot:account.slot,status:parsed.skipped?'partial':'synced',matches:parsed.ids.length,coverage});
   }catch(e){const code=errorCode(e),banned=code==='LoginBanned';await saveStatus(db,account,lease,code==='reconnect'?'reconnect':'error',banned?'Epic impose une attente de sécurité de 10 minutes.':code==='reconnect'?'Autorisation Epic à renouveler.':'Lecture impossible. Les données précédentes sont conservées.',banned?Date.now()+600000:Date.now()+60000);outcomes.push({slot:account.slot,status:'error'});}finally{client?.close();}
  }
  await saveStatus(db,helper,helperLease,'ready',null);
 }catch(e){const banned=errorCode(e)==='LoginBanned';await saveStatus(db,helper,helperLease,errorCode(e)==='reconnect'?'reconnect':'error',banned?'Epic impose une attente de sécurité de 10 minutes.':'Vérification de présence indisponible : aucun joueur connecté.',Date.now()+(banned?600000:60000));return {synced:0,reason:'Vérification de présence indisponible.',results:outcomes};}
 finally{observer?.close();}
 return {synced:outcomes.filter(r=>r.status==='synced'||r.status==='partial').length,results:outcomes};
}
export async function recapState(env,day){const merged=await readMerged(env.DB);return {...dailyRecap(merged.rows,day,merged.rosters),reliability:merged.reliability,coverage:(await env.DB.prepare("SELECT slot,status,last_sync,coverage,detail FROM epic_accounts WHERE slot<>'observer'").all()).results};}
