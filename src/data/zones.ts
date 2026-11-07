// Zones for the world map. `at` is the island's centre on the 640×360 world map.
import type { Topic } from '../core/types.ts';

export interface Zone { id: string; name: string; topic: Topic | 'mixed'; bonus: boolean; at: [number, number]; ready: boolean }

export const ZONES: Zone[] = [
  { id: 'piggybank_village', name: 'Piggybank Village', topic: 'Spending and Saving', bonus: false, at: [237, 45], ready: true },
  { id: 'borrowers_bridges', name: "Borrowers' Bridges", topic: 'Credit and Debt', bonus: false, at: [380, 45], ready: true },
  { id: 'guildworks', name: 'Guildworks', topic: 'Employment and Income', bonus: false, at: [507, 55], ready: true },
  { id: 'compound_orchard', name: 'Compound Orchard', topic: 'Investing', bonus: false, at: [110, 95], ready: true },
  { id: 'stormwatch_coast', name: 'Stormwatch Coast', topic: 'Risk and Insurance', bonus: false, at: [70, 180], ready: true },
  { id: 'crossroads_observatory', name: 'Crossroads Observatory', topic: 'Financial Decision Making', bonus: false, at: [567, 140], ready: true },
  { id: 'sunfire_pass', name: 'Sunfire Pass', topic: 'mixed', bonus: true, at: [543, 225], ready: true },
  { id: 'moonwell_cavern', name: 'Moonwell Cavern', topic: 'mixed', bonus: true, at: [160, 280], ready: true },
  { id: 'astral_ruins', name: 'Astral Ruins', topic: 'mixed', bonus: true, at: [340, 303], ready: true },
  { id: 'nebula_grove', name: 'Nebula Grove', topic: 'mixed', bonus: true, at: [533, 320], ready: true },
];
export const ACADEMY_AT: [number, number] = [320, 165];
export const zoneById = (id: string) => ZONES.find((z) => z.id === id)!;
export const BONUS_ZONES = ZONES.filter((z) => z.bonus).map((z) => z.id);
