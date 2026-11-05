import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDoublesSkill,doublesRankLabel,rankTargets,readDoublesRanks,refreshDoublesRanks} from '../lib/doubles-ranks.mjs';
import {fixture} from './helpers/exercise-fixture.mjs';
const skill={Playlist:11,Mu:55,MMR:55,Tier:17,Division:1,PlacementMatchesPlayed:10};
const response=s=>({Skills:[{...skill,Playlist:10,Mu:80,Tier:22},s,{...skill,Playlist:13,Mu:20,Tier:10}]});
const rows=[{name:'nokouki',kind:'match',player_id:'Epic|synthetic|0'}];
test('Seulement le 2v2 classé : Champion II, division API 1 => Division II, Mu 55 => 1200 MMR',()=>{
 const rank=normalizeDoublesSkill(response(skill));assert.deepEqual(rank,{playlist:11,mmr:1200,tier:17,division:2,placementMatches:10});assert.equal(doublesRankLabel(rank),'Champion II · Division II');
 assert.equal(normalizeDoublesSkill(response({...skill,Mu:55.025})).mmr,1201);
 for(const value of [{Skills:[]},{Skills:[{...skill,Playlist:2}]},{Skills:[skill,skill]},{}])assert.throws(()=>normalizeDoublesSkill(value));
});
test('Rangs officiels, divisions de I à IV et SSL sans division inventée',()=>{
 for(const [tier,label] of [[1,'Bronze I'],[4,'Argent I'],[7,'Or I'],[10,'Platine I'],[13,'Diamant I'],[16,'Champion I'],[19,'Grand Champion I']]){
  for(let division=0;division<4;division++){const rank=normalizeDoublesSkill({Skills:[{...skill,Tier:tier,Division:division}]});assert.match(doublesRankLabel(rank),new RegExp('^'+label+' · Division '));assert.equal(rank.division,division+1);}
 }
 const ssl=normalizeDoublesSkill({Skills:[{...skill,Tier:22,Division:null}]});assert.equal(ssl.division,null);assert.equal(doublesRankLabel(ssl),'Légende supersonique');
});
test('Placement et MMR absent distingués ; aucune valeur inventée à zéro ou au rang de la saison passée',()=>{
 const rank=normalizeDoublesSkill({Skills:[{...skill,PlacementMatchesPlayed:3}]});assert.equal(doublesRankLabel(rank),'Non classé · Placement 3/10');assert.equal(rank.division,null);
 const empty=normalizeDoublesSkill({Skills:[{Playlist:11,Mu:null,Tier:0,Division:null,PlacementMatchesPlayed:0}]});assert.equal(empty.mmr,null);assert.match(doublesRankLabel(empty),/^Non classé/);
 const zero=normalizeDoublesSkill({Skills:[{...skill,Mu:-5}]});assert.equal(zero.mmr,0);
});
test('Rejet des nombres non finis, chaînes, tiers/divisions inconnus et placements invalides',()=>{
 for(const patch of [{Mu:null},{Mu:'55'},{Mu:Infinity},{Mu:NaN},{Tier:null},{Tier:23},{Tier:-1},{Division:4},{Division:-1},{Division:null},{PlacementMatchesPlayed:-1},{PlacementMatchesPlayed:11},{PlacementMatchesPlayed:'10'}])assert.throws(()=>normalizeDoublesSkill({Skills:[{...skill,...patch}]}));
});
test('Identité liée prioritaire ; pseudonyme ambigu bloqué ; équivalence PSN/PS4',()=>{
 assert.equal(rankTargets(rows,[],'owner')[1].playerId,'Epic|synthetic|0');
 const ambiguous=[...rows,{...rows[0],player_id:'Epic|other|0'}];assert.equal(rankTargets(ambiguous,[],'owner')[1].conflict,true);
 assert.equal(rankTargets([{...rows[0],source_difference:'identity'}],[],'owner')[1].conflict,true);
 assert.equal(rankTargets(ambiguous,[{slot:'nokouki',owner:'owner',account_id:'linked'}],'owner')[1].playerId,'Epic|linked|0');
 assert.equal(rankTargets([{...rows[0],player_id:'PSN|synthetic|0'},{...rows[0],player_id:'PS4|synthetic|0'}],[],'owner')[1].playerId,'PS4|synthetic|0');
});
test('D1 et vraie API : lecture publique du rang via observer, dernier relevé conservé en cas d’échec',async()=>{
 const f=await fixture({legacy:false});try{
  const calls=[],accounts=[{slot:'nokouki',owner:'current-user',account_id:'synthetic-account'}];let broken=false;
  const observer={async request(service,params){calls.push({service,params});if(broken)throw Error('Synthetic unavailable');return response(skill);}};
  assert.equal(await refreshDoublesRanks(f.env.DB,observer,accounts,'current-user'),1);
  const state=await (await f.readState()).json(),rank=state.doublesRanks[1];assert.equal(rank.mmr,1200);assert.equal(rank.label,'Champion II · Division II');assert.equal(rank.status,'ready');assert.ok(rank.fetchedAt);assert.ok(!JSON.stringify(state.doublesRanks).includes('synthetic-account'));
  assert.deepEqual(calls,[{service:'Skills/GetPlayerSkill v1',params:{PlayerID:'Epic|synthetic-account|0'}}]);
  assert.equal(state.doublesRanks[0].mmr,null);
  broken=true;assert.equal(await refreshDoublesRanks(f.env.DB,observer,accounts,'current-user'),0);
  const old=(await readDoublesRanks(f.env.DB))[1];assert.equal(old.mmr,1200);assert.equal(old.status,'unavailable');assert.equal(old.fetchedAt,rank.fetchedAt);
  // A different identity cannot retain the previous account's rank after a failed lookup.
  accounts[0].account_id='new-account';await refreshDoublesRanks(f.env.DB,observer,accounts,'current-user');const changed=(await readDoublesRanks(f.env.DB))[1];assert.equal(changed.mmr,null);assert.equal(changed.fetchedAt,null);
 }finally{f.db.close();}
});
