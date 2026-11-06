import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/exercise-fixture.mjs';
import {publicProfileHtml} from './helpers/public-profile.mjs';
import {publicProfiles,parsePublicRank,syncPublicMmr} from '../lib/public-ranks.mjs';
import {monthlyRanking,closeMonthlyMmr,readMonthlyMmr,recordMmr} from '../lib/monthly-mmr.mjs';
import {roster} from '../lib/domain.mjs';
const now=Date.parse('2026-11-30T22:59:30Z'),cutoff=Date.parse('2026-11-30T23:00:00Z');
const htmlResponse=html=>new Response(html,{headers:{'content-type':'text/html; charset=utf-8'}});
function owners(f){for(const [i,p] of roster.entries())f.db.prepare('INSERT INTO player_identities (slot,owner,player_id) VALUES (?,?,?)').run(p,i===0?'current-user':`member-${i}`,`Epic|private-synthetic-${i}|0`);}
const rows=f=>f.db.prepare('SELECT * FROM mmr_entries').all();
test('Page publique : isoler le 2v2, exclure les estimations, lire la vraie date sans exécuter le HTML',()=>{
 const profile=publicProfiles[0],rank=parsePublicRank(publicProfileHtml(profile),profile,now);
 assert.equal(rank.mmr,1500);assert.equal(rank.tier,17);assert.equal(rank.division,2);assert.equal(rank.sourceAt,'2026-11-30T22:59:00.000Z');assert.equal(rank.sourceUrl,profile.url);assert.equal(globalThis.shouldNotExecute,undefined);
 assert.equal(parsePublicRank(publicProfileHtml(profile,{tier:0}),profile,now).division,null);
});
for(const [name,options] of [['autre joueur',{handle:'someone-else'}],['autre plateforme',{platform:'Steam'}],['autre URL',{url:'https://example.org/profile'}],['date absente',{stamp:''}],['date invalide',{stamp:'Feb/31/2026 22:59:00 GMT'}],['relevé ancien',{stamp:'Nov/30/2026 22:40:00 GMT'}],['date future',{stamp:'Nov/30/2026 23:01:00 GMT'}],['table dupliquée',{duplicate:true}],['MMR vide',{mmr:''}],['MMR absent',{mmr:'—'}],['MMR négatif',{mmr:-1}],['MMR fractionnaire',{mmr:1200.5}],['rang inconnu',{tier:23}],['division inconnue',{division:'V'}]]){
 test(`Page ambiguë (${name}) : refuser le relevé, jamais inventer zéro`,()=>{assert.throws(()=>parsePublicRank(publicProfileHtml(publicProfiles[0],options),publicProfiles[0],now));});
}
test('Saison : ignorer les anciens tableaux et refuser une ancienne saison sélectionnée',()=>{
 const p=publicProfiles[0],html=publicProfileHtml(p);
 assert.equal(parsePublicRank(html.replace('<div class="block-body"','<span class="season-selector" onclick="SelectSeason(37)">Season 23</span><div class="block-body"'),p,now).season,24);
 assert.throws(()=>parsePublicRank(html.replace('<div class="block-body"','<span class="season-selector" onclick="SelectSeason(39)">Season 25</span><div class="block-body"'),p,now));
});
test('Relevé réel en D1 : trois URLs publiques seulement, aucune donnée Epic stockée ne sort, puis cartes et classement mis à jour',async()=>{
 const f=await fixture({legacy:false});try{owners(f);const calls=[];
  const result=await syncPublicMmr(f.env.DB,{now,fetcher:async(url,options)=>{calls.push({url,options});const p=publicProfiles.find(p=>p.url===url);assert.ok(p);assert.equal(options.body,undefined);assert.equal(options.headers.Authorization,undefined);assert.equal(options.headers.Cookie,undefined);assert.ok(!JSON.stringify({url,options}).includes('private-synthetic'));return htmlResponse(publicProfileHtml(p,{mmr:1500-publicProfiles.indexOf(p)*100}));}});
  assert.equal(result.status,'ready');assert.equal(calls.length,3);assert.equal(rows(f).length,3);assert.ok(rows(f).every(e=>e.source==='rlstats'));assert.equal(f.db.prepare('SELECT status FROM player_ranks LIMIT 1').get().status,'public');
  // Give the synthetic fixture the same reception clock as the remote reading.
  f.db.prepare("UPDATE mmr_entries SET recorded_at=? WHERE source='rlstats'").run(new Date(now).toISOString());
  const state=await readMonthlyMmr(f.env.DB,'current-user',now);assert.deepEqual(state.current.rows.map(r=>r.mmr),[1500,1400,1300]);assert.ok(state.current.rows.every(r=>r.confirmedForClose&&r.source==='rlstats'));assert.ok(!JSON.stringify(state).includes('private-synthetic'));
  await closeMonthlyMmr(f.env.DB,cutoff+300000);assert.equal(f.db.prepare('SELECT count(*) n FROM drink_debts').get().n,2);
 }finally{f.db.close();}
});
test('Requêtes simultanées et réessai : un seul lot réseau, trois relevés, réimport du même relevé sans doublon',async()=>{
 const f=await fixture({legacy:false});try{owners(f);let calls=0;const fetcher=async url=>{calls++;return htmlResponse(publicProfileHtml(publicProfiles.find(p=>p.url===url)));};
  await Promise.all([syncPublicMmr(f.env.DB,{now,fetcher}),syncPublicMmr(f.env.DB,{now,fetcher})]);assert.equal(calls,3);assert.equal(rows(f).length,3);
  await syncPublicMmr(f.env.DB,{now:now+180000,fetcher});assert.equal(calls,6);assert.equal(rows(f).length,3);
 }finally{f.db.close();}
});
test('Une panne, une page de challenge ou un format inattendu conservent les valeurs reçues',async()=>{
 const f=await fixture({legacy:false});try{owners(f);
  await syncPublicMmr(f.env.DB,{now,fetcher:async url=>htmlResponse(publicProfileHtml(publicProfiles.find(p=>p.url===url)))});
  const result=await syncPublicMmr(f.env.DB,{now:now+180000,fetcher:async url=>url===publicProfiles[0].url?new Response('blocked',{status:403}):url===publicProfiles[1].url?htmlResponse('<html>Challenge</html>'):new Response('{}',{headers:{'content-type':'application/json'}})});
  assert.equal(result.status,'unavailable');assert.equal(result.errors.length,3);assert.equal(rows(f).length,3);assert.equal(f.db.prepare('SELECT mmr FROM player_ranks LIMIT 1').get().mmr,1500);
 }finally{f.db.close();}
});
test('Corps volumineux et requête expirée : pas d’écriture de MMR',async()=>{
 const f=await fixture({legacy:false});try{owners(f);const result=await syncPublicMmr(f.env.DB,{now,fetcher:async url=>url===publicProfiles[0].url?htmlResponse('x'.repeat(512001)):Promise.reject(Object.assign(Error('Timeout'),{name:'TimeoutError'}))});assert.equal(result.updated.length,0);assert.equal(result.errors.length,3);assert.equal(rows(f).length,0);
 }finally{f.db.close();}
});
test('Une observation avant minuit peut arriver pendant la marge ; les valeurs après minuit ou trop tard ne décident pas du mois précédent',()=>{
 const source=roster.map((player,i)=>({player,mmr:1500-i*100,source:'rlstats',source_at:'2026-11-30T22:59:00.000Z',recorded_at:'2026-11-30T23:01:00.000Z'}));
 assert.equal(monthlyRanking(source,'2026-11').status,'final');
 assert.equal(monthlyRanking(source.map(e=>({...e,source_at:'2026-11-30T23:00:00.000Z'})),'2026-11').status,'incomplete');
 assert.equal(monthlyRanking(source.map(e=>({...e,recorded_at:'2026-11-30T23:05:00.001Z'})),'2026-11').status,'incomplete');
 assert.equal(monthlyRanking(source.map(e=>({...e,source_at:'2026-11-30T22:44:59.999Z'})),'2026-11').status,'incomplete');
});
test('Un relevé public plus ancien ne remplace pas une confirmation manuelle plus récente',async()=>{
 const f=await fixture({legacy:false});try{owners(f);const entry={id:crypto.randomUUID(),player:roster[0],mmr:1600};await recordMmr(f.env.DB,'current-user',entry);
  f.db.prepare('UPDATE mmr_entries SET recorded_at=?').run(new Date(now).toISOString());f.db.prepare('UPDATE player_ranks SET fetched_at=?').run(new Date(now).toISOString());
  await syncPublicMmr(f.env.DB,{now,fetcher:async url=>htmlResponse(publicProfileHtml(publicProfiles.find(p=>p.url===url),{mmr:1400}))});
  assert.equal(f.db.prepare('SELECT mmr FROM player_ranks WHERE player=?').get(roster[0]).mmr,1600);assert.equal((await readMonthlyMmr(f.env.DB,'current-user',now)).current.rows[0].mmr,1600);
 }finally{f.db.close();}
});
test('Un relevé public hors fenêtre finale ne masque pas une confirmation manuelle admissible',()=>{
 const manual=roster.map((player,i)=>({player,mmr:1500-i*100,source:'manual',recorded_at:'2026-11-30T22:40:00.000Z'}));
 const publicOld={player:roster[0],mmr:1000,source:'rlstats',source_at:'2026-11-30T22:44:00.000Z',recorded_at:'2026-11-30T22:55:00.000Z'};
 const closed=monthlyRanking([...manual,publicOld],'2026-11');assert.equal(closed.status,'final');assert.equal(closed.rows.find(r=>r.player===roster[0]).mmr,1500);assert.equal(closed.debts[0].payer,roster[2]);
 const live=monthlyRanking([...manual,publicOld],'2026-11',{live:true});assert.equal(live.rows.find(r=>r.player===roster[0]).mmr,1000);
});
test('Redirection publique : mode compatible Workers, aucun suivi vers une autre adresse',async()=>{
 const f=await fixture({legacy:false});try{owners(f);const urls=[];
  const result=await syncPublicMmr(f.env.DB,{now,fetcher:async(url,options)=>{assert.equal(options.redirect,'manual');urls.push(url);return new Response(publicProfileHtml(publicProfiles.find(p=>p.url===url)),{status:302,headers:{'location':'https://another.example/profile','content-type':'text/html'}});}});
  assert.deepEqual(urls,publicProfiles.map(p=>p.url));assert.equal(result.updated.length,0);assert.equal(rows(f).length,0);assert.ok(result.errors.every(e=>e.error.includes('302')));
 }finally{f.db.close();}
});
