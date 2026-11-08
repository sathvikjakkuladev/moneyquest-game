import { describe, expect, it } from 'vitest';
import { seeded } from '../core/rng.ts';
import { CODE_ALPHABET, CODE_LENGTH, isClassCode, makeClassCode, normalizeCode } from './codes.ts';
import { ROOMS } from '../data/rooms.ts';
import { SCREENS } from './protocol.ts';
import { isGeneratedName, isListName, makeName, NAME_ADJECTIVES, NAME_ANIMALS, nameChoices } from './names.ts';

describe('public names', () => {
  it('the generator only makes names from the friendly lists, and the checker only accepts those', () => {
    const rng = seeded(7);
    for (let i = 0; i < 500; i++) expect(isGeneratedName(makeName(rng))).toBe(true);
    for (const bad of ['BraveOtter0', 'BraveOtter100', 'braveotter4', 'BraveOtter', 'MeanOtter4', 'BraveTroll4', 'Brave Otter4', 'BraveOtter4!', 'BraveOtter04', '']) expect(isGeneratedName(bad), bad).toBe(false);
    expect(new Set(NAME_ADJECTIVES).size).toBe(NAME_ADJECTIVES.length);
    expect(new Set(NAME_ANIMALS).size).toBe(NAME_ANIMALS.length);
  });
  it('choices skip taken names', () => {
    const taken = new Set(nameChoices(seeded(1), new Set(), 4));
    const more = nameChoices(seeded(1), taken, 4);
    expect(more).toHaveLength(4);
    expect(more.some((n) => taken.has(n))).toBe(false);
  });
  it('teacher list names: letters, digits, single spaces, 2–16 characters', () => {
    for (const ok of ['Owl 01', 'Team Blue 7', 'AB']) expect(isListName(ok), ok).toBe(true);
    for (const bad of ['A', 'Owl  01', ' Owl', 'Owl!', '<b>x</b>', 'A very long name here']) expect(isListName(bad), bad).toBe(false);
  });
});

describe('class codes', () => {
  it('are 6 characters with no look-alikes (0/O, 1/I/L, U/V)', () => {
    for (const c of 'O0I1LU') expect(CODE_ALPHABET.includes(c)).toBe(false);
    const rng = seeded(3);
    const bytes = (n: number) => Uint8Array.from({ length: n }, () => Math.floor(rng() * 256));
    for (let i = 0; i < 200; i++) {
      const code = makeClassCode(bytes);
      expect(code).toHaveLength(CODE_LENGTH);
      expect(isClassCode(code)).toBe(true);
    }
  });
  it('typed codes are tidied: case, spaces and dashes', () => {
    expect(normalizeCode(' ab c-d9 2')).toBe('ABCD92');
    expect(isClassCode('ABCD9O')).toBe(false); // O isn't used
  });
});

describe('protocol screens', () => {
  it('match the room files exactly (the server only accepts these)', () => {
    const all = Object.values(ROOMS).flatMap((r) => Object.keys(r.screens).map((s) => `${r.zone}/${s}`)).sort();
    expect([...SCREENS].sort()).toEqual(all);
  });
});
