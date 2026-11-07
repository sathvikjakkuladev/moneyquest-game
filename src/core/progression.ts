// Levels, zone unlocks and boss gating. Pure functions over save data.

/** Total XP to reach a level: 0, 100, 300, 600, 1000, … */
export const xpToReach = (level: number) => 50 * (level - 1) * level;
export function levelFor(xp: number): number {
  let l = 1;
  while (xp >= xpToReach(l + 1)) l++;
  return l;
}

export const TOPIC_ZONE_ORDER = ['piggybank_village', 'borrowers_bridges', 'guildworks', 'compound_orchard', 'stormwatch_coast', 'crossroads_observatory'] as const;

/** Topic zones open in order: each opens when the previous zone's boss is beaten. */
export function zoneOpen(zone: string, cleared: readonly string[]): boolean {
  const i = (TOPIC_ZONE_ORDER as readonly string[]).indexOf(zone);
  if (i < 0) return false;
  return i === 0 || cleared.includes(TOPIC_ZONE_ORDER[i - 1]!);
}

/** A boss waits until each regular monster in its zone has been beaten once. */
export const bossReady = (regulars: readonly string[], defeated: readonly string[]) => regulars.every((id) => defeated.includes(id));
