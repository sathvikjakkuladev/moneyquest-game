// Cosmetics: hats (worn on the head) and pets (follow you, small battle assist). PLAN.md §12:
// hats are bought with coins, priced by rarity; pets are the monsters you have beaten. The Laurel
// Wreath and Bull Calf are reward-card prizes only and can never be bought
// (src/rewards/redeem.ts REWARD_ONLY_ITEMS, tested). Prices and rarity labels are DRAFTS.

import { MONSTERS } from '../core/monsters.ts';
import type { Rarity } from './v2.ts';
import { HATS } from './v2.ts';

export interface Item { id: string; kind: 'hat' | 'pet'; name: string; price: number | null; art: string; rarity?: Rarity; legendary?: boolean; tamed?: boolean }

export const RARITY_PRICE: Record<Rarity, number> = { common: 40, rare: 80, epic: 140, legendary: 220 };
const HAT_NAMES: Record<string, string> = { 'hat-laurel': 'Laurel Wreath', 'hat-top-hat': 'Banker Top Hat', 'hat-wizard-hat': 'Star Wizard Hat', 'hat-crown': 'Coin Crown' };
const title = (s: string) => s.split('-').map((w) => w[0]!.toUpperCase() + w.slice(1)).join(' ');
const ORDER: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

/** The Bull Calf: the Hype Bull in its fire look, which nothing else in the game uses. */
export const BULL_CALF = { species: 'hype-bull', look: 'fire', scale: 0.85 };

export const ITEMS: Item[] = [
  ...[...HATS].sort((a, b) => ORDER.indexOf(a.rarity) - ORDER.indexOf(b.rarity) || a.art.localeCompare(b.art)).map((h): Item => ({ id: h.id, kind: 'hat', name: HAT_NAMES[h.id] ?? title(h.art), price: h.rewardOnly ? null : RARITY_PRICE[h.rarity], art: h.art, rarity: h.rarity })),
  { id: 'pet-bull', kind: 'pet', name: 'Bull Calf', price: null, art: BULL_CALF.species, legendary: true },
];

/** A captured monster as a pet: `tame:<monster id>` (bosses are legendary). */
export const tameId = (monsterId: string) => `tame:${monsterId}`;
export const tamedMonster = (petId: string) => (petId.startsWith('tame:') ? petId.slice(5) : null);

export function item(id: string): Item | undefined {
  if (id.startsWith('tame:')) {
    const m = MONSTERS[id.slice(5)];
    return m ? { id, kind: 'pet', name: m.name, price: null, art: m.art, legendary: m.boss, tamed: true } : undefined;
  }
  return ITEMS.find((i) => i.id === id);
}

/** What the shop sells: everything with a price, never a reward-card prize. */
export const shopItems = (rewardOnly: ReadonlySet<string>) => ITEMS.filter((i) => i.price !== null && !rewardOnly.has(i.id));
