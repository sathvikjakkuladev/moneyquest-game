// Vaultspire: the hub city Ledgerhold and its seven districts (PLAN.md §12, decision 2). `at` is the
// place's pin on the 640×360 world map, from the art set's world-map data. The topic mapping is a
// DRAFT for review.
import type { Topic } from '../core/types.ts';
import { WORLD } from './v2.ts';

export interface Zone { id: string; name: string; topic: Topic | 'mixed'; bonus: boolean; at: [number, number]; boss: string | null; costume: string | null; ready: boolean }

const at = (id: string): [number, number] => [WORLD.pins[id]!.x, WORLD.pins[id]!.y];
const boss = (id: string) => `boss_${WORLD.pins[id]!.boss!.replace(/-/g, '_')}`;
const district = (id: string, name: string, topic: Topic | 'mixed', costume: string): Zone => ({ id, name, topic, bonus: topic === 'mixed', at: at(id), boss: boss(id), costume, ready: true });

export const HUB_ID = 'ledgerhold';
/** The hub. Its only monster is the finale, the Debt Dragon, which asks mixed questions. */
export const HUB: Zone = { id: HUB_ID, name: 'Ledgerhold', topic: 'mixed', bonus: false, at: at(HUB_ID), boss: 'boss_debt_dragon', costume: null, ready: true };
export const FINALE = 'boss_debt_dragon';

/** The districts in play order. Phish Fens is the mixed-review district (`bonus`). Each one's boss
 *  also unlocks a costume colour set. */
export const ZONES: Zone[] = [
  district('coinfall-docks', 'Coinfall Docks', 'Spending and Saving', 'coral-tide'),
  district('the-sprawl', 'The Sprawl', 'Financial Decision Making', 'royal-amethyst'),
  district('frostvault', 'Frostvault', 'Employment and Income', 'frost-guard'),
  district('credit-citadel', 'Credit Citadel', 'Credit and Debt', 'shadow-rogue'),
  district('compound-rift', 'Compound Rift', 'Investing', 'sunburst'),
  district('the-exchange', 'The Exchange', 'Risk and Insurance', 'ember-knight'),
  district('phish-fens', 'Phish Fens', 'mixed', 'forest-ranger'),
];
export const zoneById = (id: string): Zone => (id === HUB_ID ? HUB : ZONES.find((z) => z.id === id)!);
export const BONUS_ZONES = ZONES.filter((z) => z.bonus).map((z) => z.id);
export const placeName = (id: string) => (id === HUB_ID ? HUB.name : (ZONES.find((z) => z.id === id)?.name ?? id));
