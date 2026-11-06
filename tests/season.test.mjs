import test from 'node:test';
import assert from 'node:assert/strict';
import {currentSeason,seasonTiming,seasonEndLabel} from '../lib/season.mjs';

test('Fin non confirmée : jours du calendrier de Paris, sans heure inventée ni saison annoncée terminée',()=>{
 assert.equal(currentSeason.confirmedEndAt,null);
 assert.equal(seasonTiming(Date.parse('2026-11-05T23:30:00Z')).days,33);
 assert.equal(seasonEndLabel(),'mercredi 9 décembre 2026');
 for(const instant of ['2026-12-08T23:00:00Z','2026-12-10T12:00:00Z']){const state=seasonTiming(Date.parse(instant));assert.equal(state.days,0);assert.equal(state.ended,false);assert.equal(state.estimateReached,true);}
});
test('Jour de changement d’heure : compter les dates françaises, pas des tranches de 24 heures',()=>{
 const season={...currentSeason,estimatedEndDay:'2026-10-26'};
 assert.equal(seasonTiming(Date.parse('2026-10-24T22:30:00Z'),season).days,1);
});
test('Horaire confirmé éventuel : conversion hiver/été et arrêt exact sans compteur négatif',()=>{
 const winter={...currentSeason,confirmedEndAt:'2026-12-09T15:00:00Z'};
 assert.match(seasonEndLabel(winter),/16:00/);
 assert.match(seasonEndLabel({...winter,confirmedEndAt:'2026-06-10T15:00:00Z'}),/17:00/);
 assert.equal(seasonTiming(Date.parse(winter.confirmedEndAt)-1,winter).seconds,1);
 assert.equal(seasonTiming(Date.parse(winter.confirmedEndAt),winter).ended,true);
 assert.equal(seasonTiming(Date.parse(winter.confirmedEndAt)+1000,winter).days,0);
});
