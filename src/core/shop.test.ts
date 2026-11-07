import { describe, expect, it } from 'vitest';
import { ITEMS, shopItems } from '../data/items.ts';
import { HAT_ART } from '../data/hats.ts';
import { REWARD_ONLY_ITEMS, redeem } from '../rewards/redeem.ts';
import { makeCode, MAX_SERIAL } from '../rewards/rewardCodes.ts';
import { newSlot } from './save.ts';
import type { Slot } from './save.ts';
import { buy, buyScroll, equip, grantReward, SCROLL, SCROLL_PRICE } from './shop.ts';

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
  it('sells every other item, which has a price and art', () => {
    const sold = shopItems(REWARD_ONLY_ITEMS);
    expect(sold.length).toBe(ITEMS.length - 2);
    for (const it of sold) {
      expect(it.price).toBeGreaterThan(0);
      if (it.kind === 'hat') expect(HAT_ART[it.art], it.id).toBeTruthy();
    }
  });
  it('buying costs coins, needs enough coins, and only once', () => {
    const r = buy(rich(100), 'pet-coin-sprite');
    expect(r.ok && r.slot.progress.coins).toBe(40);
    expect(r.ok && buy(r.slot, 'pet-coin-sprite')).toEqual({ ok: false, reason: 'owned' });
    expect(buy(rich(10), 'pet-coin-sprite')).toEqual({ ok: false, reason: 'coins' });
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
