import { describe, expect, it } from 'vitest';
import { answer, beginTurn, spellDamage, startBattle } from './battle.ts';
import type { BattleEvent } from './battle.ts';
import { fixture } from './battleFixtures.ts';
import { battleGear, buyGear, buyPotion, equipGear, POTION } from './gear.ts';
import { seeded } from './rng.ts';
import { newSlot } from './save.ts';

const rich = (coins = 1000) => ({ ...newSlot('Ann', '6-8', 'A'), progress: { ...newSlot('Ann', '6-8', 'A').progress, coins } });
const M = fixture('mon_spendling'); // hits for 8

describe('Bix’s gear', () => {
  it('buys armor and wands and wears the newest; upgrades can switch back', () => {
    let s = rich();
    const a = buyGear(s, 'armor-leather');
    if (!a.ok) throw new Error(a.reason);
    s = a.slot;
    expect(s.progress.coins).toBe(950);
    expect(s.gear.armor).toBe('armor-leather');
    const b = buyGear(s, 'armor-iron');
    if (!b.ok) throw new Error(b.reason);
    s = equipGear(b.slot, 'armor-leather');
    expect(s.gear.armor).toBe('armor-leather');
    expect(buyGear(s, 'armor-iron').ok).toBe(false); // already owned
    expect(buyGear(rich(10), 'wand-star').ok).toBe(false); // too expensive
    expect(battleGear(equipGear(s, 'armor-iron'))).toEqual({ armor: 2, wand: 0, potions: 0 });
  });
  it('potions stack up to the limit', () => {
    let s = rich();
    for (let i = 0; i < POTION.max; i++) {
      const r = buyPotion(s);
      if (!r.ok) throw new Error(r.reason);
      s = r.slot;
    }
    expect(s.gear.potions).toBe(POTION.max);
    expect(buyPotion(s).ok).toBe(false);
  });
});

describe('gear in battle', () => {
  const setup = { monster: M, band: '6-8' as const, level: 1, wallet: 0 };
  const hurt = (events: BattleEvent[]) => events.find((e): e is Extract<BattleEvent, { type: 'playerHurt' }> => e.type === 'playerHurt')!;
  it('armor blocks damage from each hit; a wand adds to spells', () => {
    const plain = startBattle(setup), geared = startBattle({ ...setup, gear: { armor: 3, wand: 2, potions: 0 } });
    const h0 = hurt(answer(beginTurn(plain, M).state, M, false, 'budget_beam', { rng: seeded(1) }).events);
    const h1 = hurt(answer(beginTurn(geared, M).state, M, false, 'budget_beam', { rng: seeded(1) }).events);
    expect(h1.amount).toBe(h0.amount - 3);
    expect(h1.blocked).toBe(3);
    expect(spellDamage(geared, 'budget_beam')).toBe(spellDamage(plain, 'budget_beam') + 2);
  });
  it('a potion is drunk once, when health drops below a third', () => {
    let s = { ...startBattle({ ...setup, gear: { armor: 0, wand: 0, potions: 2 } }), playerHp: 38 };
    let r = answer(beginTurn(s, M).state, M, false, 'budget_beam', { rng: seeded(1) });
    const drink = r.events.find((e) => e.type === 'potion');
    expect(drink).toMatchObject({ amount: Math.round(s.playerMaxHp * POTION.heal) });
    expect(r.state.potionUsed).toBe(true);
    s = { ...r.state, playerHp: 20 };
    r = answer(beginTurn(s, M).state, M, false, 'budget_beam', { rng: seeded(1) });
    expect(r.events.some((e) => e.type === 'potion')).toBe(false); // only one per battle
  });
});
