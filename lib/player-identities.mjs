import {roster} from './domain.mjs';
import {playerKey} from './reconcile.mjs';

export const unassignedPrefix='Non attribué · ';
export const canonicalPlayerId=id=>playerKey(id).replace(/^(Epic\|)([^|]+)/,(_,prefix,uid)=>prefix+uid.toLowerCase());

/** @param {any} db @param {string} [owner] @returns {Promise<Array<{slot:string,owner:string,player_id:string,last_sync:string|null,last_attempt:string|null,coverage:string}>>} */
export async function readPlayerIdentities(db,owner){
 const query=owner===undefined?db.prepare('SELECT slot,owner,player_id,last_sync,last_attempt,coverage FROM player_identities'):db.prepare('SELECT slot,owner,player_id,last_sync,last_attempt,coverage FROM player_identities WHERE owner=?').bind(owner);
 return (await query.all()).results.filter(identity=>roster.includes(identity.slot));
}
/** @param {any} db @returns {Promise<Array<{slot:string,player_id:string}>>} */
export async function readIdentityBindings(db){return (await db.prepare('SELECT player_id,slot FROM player_identity_aliases').all()).results.filter(i=>roster.includes(i.slot));}
export function attributeLivePlayers(rows,bindings){return rows.map(row=>{const identity=bindings.find(i=>canonicalPlayerId(i.player_id)===canonicalPlayerId(row.playerId));return {...row,name:identity?.slot||(roster.includes(row.name)?unassignedPrefix+row.name:row.name)};});}
