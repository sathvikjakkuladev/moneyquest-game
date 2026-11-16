import { describe, expect, it } from 'vitest';
import { ITEMS, RARITY_PRICE, shopItems } from '../data/items.ts';
import { AVATAR, hatArt } from '../data/v2.ts';
import { DEFAULT_LOOK } from './look.ts';
import { REWARD_ONLY_ITEMS, redeem } from '../rewards/redeem.ts';
import { makeCode, MAX_SERIAL } from '../rewards/rewardCodes.ts';
import { newSlot } from './save.ts';
import type { Slot } from './save.ts';
import { buy, buyScroll, equip, grantReward, petLooks, restyle, SCROLL, SCROLL_PRICE, setPetLook } from './shop.ts';

const rich = (coins = 1000): Slot => {
  const s = newSlot('Fox', 'K-5', 'A');
  return { ...s, progress: { ...s.progress, coins } };
};

describe('the shop', () => {
  it('never sells the Laurel Wreath or the Bull Calf, and buy() refuses them even if asked directly', () => {
    const sold = shopItems(REWARD_ONLY_ITEMS).map((i) => i.id);
    expect(sold).not.toContain('hat-laurel');
    expect(sold).not.toContain('pet-bull');
    expect(buy(rich(), 'hat-laurel')).toEqual({ ok: false, reason: 'reward-only' });
    expect(buy(rich(), 'pet-bull')).toEqual({ ok: false, reason: 'reward-only' });
  });
  it('sells the other 24 hats, priced by rarity, each with art; pets are never for sale', () => {
    const sold = shopItems(REWARD_ONLY_ITEMS);
    expect(sold.length).toBe(24);
    for (const it of sold) {
      expect(it.kind).toBe('hat');
      expect(it.price).toBe(RARITY_PRICE[it.rarity!]);
      expect(hatArt(it.id), it.id).toBeTruthy();
    }
    expect(ITEMS.filter((i) => i.kind === 'pet').map((i) => i.id)).toEqual(['pet-bull']);
    expect(buy(rich(), 'tame:mon_hype_bull').ok).toBe(false);
  });
  it('buying costs coins, needs enough coins, and only once', () => {
    const r = buy(rich(100), 'hat-beret');
    expect(r.ok && r.slot.progress.coins).toBe(60);
    expect(r.ok && buy(r.slot, 'hat-beret')).toEqual({ ok: false, reason: 'owned' });
    expect(buy(rich(10), 'hat-beret')).toEqual({ ok: false, reason: 'coins' });
  });
  it('you can only wear what you own, in the right slot', () => {
    const s = rich();
    expect(equip(s, 'hat', 'hat-crown').inventory.hat).toBeNull();
    const r = buy(s, 'hat-crown');
    const owned = r.ok ? r.slot : s;
    expect(equip(owned, 'hat', 'hat-crown').inventory.hat).toBe('hat-crown');
    expect(equip(owned, 'pet', 'hat-crown').inventory.pet).toBeNull();
    expect(equip(equip(owned, 'hat', 'hat-crown'), 'hat', null).inventory.hat).toBeNull();
  });
  it('the Insurance Scroll costs 15, one at a time', () => {
    const r = buyScroll(rich(20));
    expect(r.ok && r.slot.inventory.owned).toContain(SCROLL);
    expect(r.ok && r.slot.progress.coins).toBe(20 - SCROLL_PRICE);
    expect(r.ok && buyScroll(r.slot)).toEqual({ ok: false, reason: 'owned' });
    expect(buyScroll(rich(5))).toEqual({ ok: false, reason: 'coins' });
  });
});

describe('pets and looks', () => {
  it('a captured monster can be equipped; its looks unlock as districts are cleared', () => {
    const s0 = rich();
    const s = { ...s0, inventory: { ...s0.inventory, owned: ['tame:mon_hype_bull'] } };
    expect(equip(s, 'pet', 'tame:mon_hype_bull').inventory.pet).toBe('tame:mon_hype_bull');
    expect(equip(s, 'pet', 'tame:mon_panic_bear').inventory.pet).toBeNull(); // not captured yet
    expect(petLooks([])).toEqual([]);
    expect(setPetLook(s, 'frostvault').inventory.petLook).toBeNull(); // Frostvault isn't cleared
    const cleared = { ...s, progress: { ...s.progress, zonesCleared: ['coinfall-docks', 'the-sprawl', 'frostvault'] } };
    expect(setPetLook(cleared, 'frostvault').inventory.petLook).toBe('frostvault');
    expect(setPetLook(cleared, 'fire').inventory.petLook).toBeNull(); // the Bull Calf's look is never a skin
    expect(setPetLook(setPetLook(cleared, 'frostvault'), null).inventory.petLook).toBeNull();
  });
  it('changing your look is free, and a costume that is not earned yet is refused', () => {
    const s = rich(0);
    const next = restyle(s, { ...DEFAULT_LOOK, hair: 2, costume: 3 });
    expect(next.look).toEqual({ ...DEFAULT_LOOK, hair: 2, costume: 0 });
    expect(next.progress.coins).toBe(0);
    const set = AVATAR.costume.sets.findIndex((c) => c.id === 'coral-tide');
    const cleared = { ...s, progress: { ...s.progress, zonesCleared: ['coinfall-docks'] } };
    expect(restyle(cleared, { ...DEFAULT_LOOK, costume: set }).look.costume).toBe(set);
  });
});

describe('reward cards', () => {
  it('a card adds its prize once and can then be worn', () => {
    const code = makeCode('W', MAX_SERIAL - 1); // never printed
    const r = redeem(code, []);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = grantReward(rich(0), r.code, r.items);
    expect(s.inventory.owned).toEqual(['hat-laurel']);
    expect(s.redeemed).toEqual([code]);
    expect(equip(s, 'hat', 'hat-laurel').inventory.hat).toBe('hat-laurel');
    expect(redeem(code, s.redeemed)).toEqual({ ok: false, reason: 'already-used' });
    expect(grantReward(s, r.code, r.items)).toBe(s);
  });
});
