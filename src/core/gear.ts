// Gear from Shopkeeper Bix: armor blocks part of every monster hit, a wand adds damage to every
// spell, and healing potions are drunk by themselves once a battle when your health drops low.
// You wear one armor and hold one wand; potions stack. Names, prices and strengths are DRAFTS.
import type { Slot } from './save.ts';

export type GearSlot = 'armor' | 'wand';
export interface GearItem { id: string; slot: GearSlot; name: string; value: number; price: number; blurb: string }

/** DRAFT: armor `value` = damage blocked from each hit; wand `value` = damage added to each spell. */
export const GEAR: GearItem[] = [
  { id: 'armor-leather', slot: 'armor', name: 'Leather Vest', value: 1, price: 50, blurb: 'Blocks 1 damage from every hit.' },
  { id: 'armor-iron', slot: 'armor', name: 'Iron Plate', value: 2, price: 120, blurb: 'Blocks 2 damage from every hit.' },
  { id: 'armor-crystal', slot: 'armor', name: 'Crystal Armor', value: 3, price: 250, blurb: 'Blocks 3 damage from every hit.' },
  { id: 'armor-dragon', slot: 'armor', name: 'Dragonscale Armor', value: 4, price: 450, blurb: 'Blocks 4 damage from every hit.' },
  { id: 'wand-oak', slot: 'wand', name: 'Oak Wand', value: 1, price: 50, blurb: 'Every spell does 1 more damage.' },
  { id: 'wand-silver', slot: 'wand', name: 'Silver Wand', value: 2, price: 120, blurb: 'Every spell does 2 more damage.' },
  { id: 'wand-crystal', slot: 'wand', name: 'Crystal Wand', value: 3, price: 250, blurb: 'Every spell does 3 more damage.' },
  { id: 'wand-star', slot: 'wand', name: 'Star Wand', value: 4, price: 450, blurb: 'Every spell does 4 more damage.' },
];
export const gear = (id: string | null) => (id ? GEAR.find((g) => g.id === id) : undefined);

/** DRAFT: healing potions. */
export const POTION = { name: 'Healing Potion', price: 30, max: 5, heal: 0.4, below: 1 / 3, blurb: 'Drunk by itself once a battle when your health falls below a third: heals 40%.' } as const;

export interface Gear { owned: string[]; armor: string | null; wand: string | null; potions: number }
export const emptyGear = (): Gear => ({ owned: [], armor: null, wand: null, potions: 0 });

export type GearBuy = { ok: true; slot: Slot } | { ok: false; reason: string };

/** Buy a piece of gear and put it on (or hold it) straight away. */
export function buyGear(s: Slot, id: string): GearBuy {
  const g = gear(id);
  if (!g) return { ok: false, reason: 'That isn’t for sale.' };
  if (s.gear.owned.includes(id)) return { ok: false, reason: 'You already have it.' };
  if (s.progress.coins < g.price) return { ok: false, reason: `You need ${g.price - s.progress.coins} more coins.` };
  return { ok: true, slot: { ...s, progress: { ...s.progress, coins: s.progress.coins - g.price }, gear: { ...s.gear, owned: [...s.gear.owned, id], [g.slot]: id } } };
}

export function equipGear(s: Slot, id: string): Slot {
  const g = gear(id);
  return g && s.gear.owned.includes(id) ? { ...s, gear: { ...s.gear, [g.slot]: id } } : s;
}

export function buyPotion(s: Slot): GearBuy {
  if (s.gear.potions >= POTION.max) return { ok: false, reason: `You can carry ${POTION.max} potions at most.` };
  if (s.progress.coins < POTION.price) return { ok: false, reason: `You need ${POTION.price - s.progress.coins} more coins.` };
  return { ok: true, slot: { ...s, progress: { ...s.progress, coins: s.progress.coins - POTION.price }, gear: { ...s.gear, potions: s.gear.potions + 1 } } };
}

/** What the battle needs from the gear you have on. */
export const battleGear = (s: Slot) => ({ armor: gear(s.gear.armor)?.value ?? 0, wand: gear(s.gear.wand)?.value ?? 0, potions: s.gear.potions });
