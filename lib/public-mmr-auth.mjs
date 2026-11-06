export function canImportPublicMmr(settings,userId){return typeof settings.MMR_UPDATER_USER_ID==='string'&&settings.MMR_UPDATER_USER_ID.length>0&&settings.MMR_UPDATER_USER_ID===userId;}
export function publicMmrKeyMatches(expected,provided){
 if(typeof expected!=='string'||expected.length<32||typeof provided!=='string'||provided.length!==expected.length)return false;
 let different=0;for(let i=0;i<expected.length;i++)different|=expected.charCodeAt(i)^provided.charCodeAt(i);return different===0;
}
