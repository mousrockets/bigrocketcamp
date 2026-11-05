// Only explicitly complete scoreboards can produce a last-place classification.
export const lastPlaceRule={enabled:false,effectiveFrom:'2026-11-05',ties:'none'};
const guid=r=>r.match_guid??r.matchGuid;
const identity=r=>r.player_id??r.playerId??r.name;

export function matchIndex(rows,rosters=[]){
 const expected=new Map(rosters.map(r=>[r.match_guid??r.matchGuid,r.expected_players??r.playerCount]));
 const matches=new Map();
 for(const row of rows){
  const id=guid(row);if(row.kind!=='match'||row.review_required||typeof id!=='string'||!id)continue;
  if(!matches.has(id))matches.set(id,{players:new Map()});
  const players=matches.get(id).players,key=identity(row),previous=players.get(key);
  if(!previous||row.score>previous.score)players.set(key,row);
 }
 for(const [id,match] of matches){
  const players=[...match.players.values()],count=expected.get(id);
  match.complete=Number.isSafeInteger(count)&&count>=2&&count<=16&&players.length===count&&new Set(players.map(r=>r.team)).size===2&&new Set(players.map(r=>r.day)).size===1&&new Set(players.map(r=>r.winner)).size===1&&players.every(r=>[0,1].includes(r.team)&&[0,1].includes(r.winner)&&Number.isSafeInteger(r.score)&&r.score>=0);
  match.minimum=match.complete?Math.min(...players.map(r=>r.score)):null;
  match.last=match.complete?players.filter(r=>r.score===match.minimum):[];
 }
 return matches;
}

export function lastPlaceBonus(row,matches,rule=lastPlaceRule){
 const match=matches.get(guid(row));
 return rule.enabled&&row.day>=rule.effectiveFrom&&row.team!==row.winner&&match?.complete&&row.score===match.minimum&&(rule.ties==='all'||match.last.length===1)?5:0;
}

export function validateMatchRosters(input,rows){
 if(input===undefined)return [];
 if(!Array.isArray(input)||input.length>250)throw Error('Liste de participants invalide.');
 const seen=new Set();
 return input.map(m=>{
  if(!m||typeof m.MatchGuid!=='string'||seen.has(m.MatchGuid)||!Number.isSafeInteger(m.PlayerCount)||m.PlayerCount<2||m.PlayerCount>16)throw Error('Liste de participants invalide.');
  seen.add(m.MatchGuid);
  const players=rows.filter(r=>r.matchGuid===m.MatchGuid),unique=new Set(players.map(r=>r.playerId));
  if(players.length!==m.PlayerCount||unique.size!==m.PlayerCount||new Set(players.map(r=>r.team)).size!==2||new Set(players.map(r=>r.day)).size!==1||new Set(players.map(r=>r.winner)).size!==1)throw Error('Tableau des scores incomplet ou incohérent.');
  return {matchGuid:m.MatchGuid,playerCount:m.PlayerCount};
 });
}
