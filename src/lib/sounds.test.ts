import { describe, expect, test } from 'vitest';
import { completedBy, type SoundId, soundIds, sounds } from './sounds';

describe('the sound badges', () => {
  test('a family completes with its fifth sound, the collection with its fortieth', () => {
    const garage = sounds.filter((sound) => sound.family === 0).map((sound) => sound.id);
    const last = garage.at(-1) as SoundId;
    expect(completedBy(last, new Set(garage))).toEqual({ family: true, collection: false });
    expect(completedBy(last, new Set(garage.slice(1)))).toEqual({ family: false, collection: false });
    expect(completedBy(last, new Set(soundIds))).toEqual({ family: true, collection: true });
  });

  test('eight families of five', () => {
    expect(sounds).toHaveLength(40);
    for (let family = 0; family < 8; family++) {
      expect(sounds.filter((sound) => sound.family === family)).toHaveLength(5);
    }
  });
});
