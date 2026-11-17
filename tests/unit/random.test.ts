import { describe, expect, it } from 'vitest';
import { randomRoomCode, randomToken, secureRandom, shuffle } from '../../server/engine/random';
import { ROOM_CODE_PATTERN } from '../../shared/protocol';
import { cleanText, compareKey, looseKey } from '../../shared/text';

describe('random helpers', () => {
  it('generates human-readable room codes', () => {
    for (let i = 0; i < 200; i++) expect(randomRoomCode()).toMatch(ROOM_CODE_PATTERN);
  });

  it('generates unpredictable, unique tokens with ≥128 bits of entropy', () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => randomToken(24)));
    expect(tokens.size).toBe(1000);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it('secureRandom is within [0,1)', () => {
    for (let i = 0; i < 1000; i++) {
      const x = secureRandom();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('shuffle is a permutation', () => {
    const arr = [1, 2, 3, 4, 5, 6];
    expect(shuffle(arr, secureRandom).sort()).toEqual(arr);
  });
});

describe('text normalization', () => {
  it('cleans and compares text', () => {
    expect(cleanText('  hello \n  world ')).toBe('hello world');
    expect(compareKey(' Hello   WORLD')).toBe('hello world');
    expect(looseKey('The Moon!')).toBe('moon');
    expect(looseKey('a Frisbee')).toBe(looseKey('frisbee'));
  });
});
