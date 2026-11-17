import { describe, expect, it } from 'vitest';
import attacks from '../data/monster_attacks.json';
import { ATTACK_FX_NAMES, CLIP_ATTACKS, SPELL_FX_NAMES } from './attackFx.ts';
import { SPELLS } from '../core/spells.ts';

type Raw = { attack: string; type?: string; second_attack?: { attack: string } };
const all = Object.values(attacks as Record<string, Raw[]>).flat();
const names = all.flatMap((m) => [m.attack, ...(m.second_attack ? [m.second_attack.attack] : [])]);

describe('monster attack effects', () => {
  it('every attack in monster_attacks.json has its own effect', () => {
    expect(names.filter((n) => !ATTACK_FX_NAMES.includes(n))).toEqual([]);
  });

  it('has no effects for attacks that no longer exist', () => {
    expect(ATTACK_FX_NAMES.filter((n) => !names.includes(n))).toEqual([]);
  });

  it('a boss with two attacks plays its clip in only one, so the two look different', () => {
    for (const m of all.filter((x) => x.type === 'boss' && x.second_attack)) {
      expect([CLIP_ATTACKS.has(m.attack), CLIP_ATTACKS.has(m.second_attack!.attack)].filter(Boolean)).toHaveLength(1);
    }
  });

  it('every spell has its own effect', () => {
    expect(Object.keys(SPELLS).sort()).toEqual([...SPELL_FX_NAMES].sort());
  });
});
