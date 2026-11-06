// Retired integration. These compatibility entry points never contact Epic or PsyNet.
import {roster,dailyRecap} from './domain.mjs';
import {readMerged} from './reconcile.mjs';
import {readDoublesRanks} from './doubles-ranks.mjs';
import {readPlayerIdentities} from './player-identities.mjs';

export const slots=['observer',...roster];
export const retiredReason='Connexion communautaire Epic retirée. Utilise le Direct PC officiel.';
// Retirement is unconditional; changing an environment flag cannot restore logins.
export const collectionPaused=()=>true;
export async function beginLink(){throw Error(retiredReason);}
export async function finishLink(){throw Error(retiredReason);}
export async function syncHistories(..._unused){return {synced:0,ranksUpdated:0,paused:true,retired:true,reason:retiredReason,results:[]};}
export async function autoSync(..._unused){return {ran:false,paused:true,retired:true};}
export async function connectionStatus(env,userId){
 const identities=await readPlayerIdentities(env.DB);
 const credentialsStored=await env.DB.prepare('SELECT (SELECT COUNT(*) FROM epic_accounts) AS accounts,(SELECT COUNT(*) FROM epic_grants) AS pending').first();
 return {connections:slots.map(slot=>{const identity=identities.find(i=>i.slot===slot);return {slot,connected:false,owned:identity?.owner===userId,identityKnown:!!identity,status:'retired',lastSync:identity?.last_sync??null,lastAttempt:identity?.last_attempt??null,coverage:identity?.coverage??'recent_only',detail:retiredReason};}),pending:[],doublesRanks:await readDoublesRanks(env.DB),configured:false,paused:true,retired:true,vaultConfigured:!!env.EPIC_VAULT_KEY,credentialsStored};
}
// An old tab may still ask to disconnect. Forget only its owner's old credentials;
// keep the non-secret identity required by the official local score collector.
export async function disconnect(env,userId,slot){
 if(!slots.includes(slot))throw Error('Compte inconnu.');
 const identity=(await readPlayerIdentities(env.DB)).find(i=>i.slot===slot);
 if(identity&&identity.owner!==userId)throw Error('Seul le membre associé à cette identité peut la gérer.');
 await env.DB.batch([env.DB.prepare('DELETE FROM epic_accounts WHERE slot=? AND owner=?').bind(slot,userId),env.DB.prepare('DELETE FROM epic_grants WHERE slot=? AND owner=?').bind(slot,userId)]);
 return {ok:true,retired:true};
}
export async function recapState(env,day){const merged=await readMerged(env.DB);return {...dailyRecap(merged.rows,day,merged.rosters),reliability:merged.reliability,coverage:(await readPlayerIdentities(env.DB)).map(i=>({slot:i.slot,status:'retired',last_sync:i.last_sync,coverage:i.coverage,detail:retiredReason}))};}
