// Buying, equipping and reward-card prizes, as pure functions over a save slot.
import { item } from '../data/items.ts';
import { REWARD_ONLY_ITEMS } from '../rewards/redeem.ts';
import type { Slot } from './save.ts';

export const SCROLL = 'insurance-scroll';
export const SCROLL_PRICE = 15;

export type BuyResult = { ok: true; slot: Slot } | { ok: false; reason: 'reward-only' | 'unknown' | 'owned' | 'coins' };

/** Buy a shop item. Reward-card prizes can never be bought, whatever calls this. */
export function buy(s: Slot, id: string): BuyResult {
  if (REWARD_ONLY_ITEMS.has(id)) return { ok: false, reason: 'reward-only' };
  const it = item(id);
  if (!it || it.price === null) return { ok: false, reason: 'unknown' };
  if (s.inventory.owned.includes(id)) return { ok: false, reason: 'owned' };
  if (s.progress.coins < it.price) return { ok: false, reason: 'coins' };
  return { ok: true, slot: { ...s, progress: { ...s.progress, coins: s.progress.coins - it.price }, inventory: { ...s.inventory, owned: [...s.inventory.owned, id] } } };
}

/** Buy an Insurance Scroll (one at a time) from the Stormwatch mentor. */
export function buyScroll(s: Slot): BuyResult {
  if (s.inventory.owned.includes(SCROLL)) return { ok: false, reason: 'owned' };
  if (s.progress.coins < SCROLL_PRICE) return { ok: false, reason: 'coins' };
  return { ok: true, slot: { ...s, progress: { ...s.progress, coins: s.progress.coins - SCROLL_PRICE }, inventory: { ...s.inventory, owned: [...s.inventory.owned, SCROLL] } } };
}

/** Wear a hat or bring a pet (null takes it off). Only owned items. */
export function equip(s: Slot, kind: 'hat' | 'pet', id: string | null): Slot {
  if (id !== null && (!s.inventory.owned.includes(id) || item(id)?.kind !== kind)) return s;
  return { ...s, inventory: { ...s.inventory, [kind]: id } };
}

/** A reward card was redeemed: remember the code and add its prizes. */
export function grantReward(s: Slot, code: string, items: readonly string[]): Slot {
  if (s.redeemed.includes(code)) return s;
  const owned = [...s.inventory.owned, ...items.filter((i) => !s.inventory.owned.includes(i))];
  return { ...s, redeemed: [...s.redeemed, code], inventory: { ...s.inventory, owned } };
}
