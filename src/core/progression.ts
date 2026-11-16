// Levels, zone unlocks and boss gating. Pure functions over save data.

/** Total XP to reach a level: 0, 100, 300, 600, 1000, … */
export const xpToReach = (level: number) => 50 * (level - 1) * level;
export function levelFor(xp: number): number {
  let l = 1;
  while (xp >= xpToReach(l + 1)) l++;
  return l;
}

/** The six topic districts in play order (PLAN.md §12). Phish Fens, the mixed district, comes after them. */
export const TOPIC_ZONE_ORDER = ['coinfall-docks', 'the-sprawl', 'frostvault', 'credit-citadel', 'compound-rift', 'the-exchange'] as const;
export const MIXED_ZONE = 'phish-fens';
export const ALL_DISTRICTS = [...TOPIC_ZONE_ORDER, MIXED_ZONE] as const;

/** Topic zones open in order: each opens when the previous zone's boss is beaten. */
export function zoneOpen(zone: string, cleared: readonly string[]): boolean {
  const i = (TOPIC_ZONE_ORDER as readonly string[]).indexOf(zone);
  if (i < 0) return false;
  return i === 0 || cleared.includes(TOPIC_ZONE_ORDER[i - 1]!);
}

/** A boss waits until each regular monster in its zone has been beaten once. */
export const bossReady = (regulars: readonly string[], defeated: readonly string[]) => regulars.every((id) => defeated.includes(id));
