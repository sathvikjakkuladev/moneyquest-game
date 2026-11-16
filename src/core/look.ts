// The player's look (PLAN.md §12, decisions 4–7): indexes into the option lists that come with the
// art set. Only numbers, so a look can travel over multiplayer without any free text. The lists are
// append-only once shipped: saves and the wire format store positions in them.
import { AVATAR } from '../data/v2.ts';
import { ZONES } from '../data/zones.ts';

export interface Look { skin: number; eyes: number; hair: number; hairColour: number; face: number; costume: number }

export const LOOK_SIZES: Record<keyof Look, number> = {
  skin: AVATAR.skin.length,
  eyes: AVATAR.eyes.length,
  hair: AVATAR.hairStyles.length,
  hairColour: AVATAR.hairColours.length,
  face: AVATAR.faces.length,
  costume: AVATAR.costume.sets.length,
};
export const LOOK_KEYS = ['skin', 'eyes', 'hair', 'hairColour', 'face', 'costume'] as const;
export const DEFAULT_LOOK: Look = { skin: 3, eyes: 0, hair: 0, hairColour: 1, face: 0, costume: 0 };

const ok = (v: unknown, size: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < size;
/** A look with every index in range; anything else falls back to the default for that part. */
export function cleanLook(v: unknown): Look {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return Object.fromEntries(LOOK_KEYS.map((k) => [k, ok(o[k], LOOK_SIZES[k]) ? o[k] : DEFAULT_LOOK[k]])) as unknown as Look;
}
export const lookToList = (l: Look): number[] => LOOK_KEYS.map((k) => l[k]);
export function lookFromList(v: unknown): Look | null {
  if (!Array.isArray(v) || v.length !== LOOK_KEYS.length) return null;
  for (let i = 0; i < LOOK_KEYS.length; i++) if (!ok(v[i], LOOK_SIZES[LOOK_KEYS[i]!])) return null;
  return Object.fromEntries(LOOK_KEYS.map((k, i) => [k, v[i]])) as unknown as Look;
}
export function randomLook(rng: () => number): Look {
  const pick = (n: number) => Math.floor(rng() * n);
  // Any hairstyle but the under-hat cut, and the starting costume.
  const styles = AVATAR.hairStyles.map((_, i) => i).filter((i) => i !== AVATAR.neat);
  return { skin: pick(LOOK_SIZES.skin), eyes: pick(6), hair: styles[pick(styles.length)]!, hairColour: pick(6), face: pick(LOOK_SIZES.face), costume: 0 };
}

/** Costume colour sets are earned: the first from the start, one more per district boss beaten. */
export function costumeUnlocked(index: number, cleared: readonly string[]): boolean {
  const set = AVATAR.costume.sets[index];
  if (!set) return false;
  if (set.default) return true;
  const zone = ZONES.find((z) => z.costume === set.id);
  return zone ? cleared.includes(zone.id) : false;
}
/** Which district's boss gives a costume set (for the "beat X to unlock" label). */
export const costumeSource = (index: number) => ZONES.find((z) => z.costume === AVATAR.costume.sets[index]?.id);
