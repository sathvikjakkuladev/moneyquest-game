// World mode: players from other classes (with world mode on) on the same screen. Shared by the game
// and the server. Classmates are shown by the class's own room; a WorldScreen only adds others.

import { seeded } from '../core/rng.ts';
import { isGeneratedName, makeName } from './names.ts';

/** Each player sees at most this many players from other classes: the nearest ones. */
export const WORLD_VISIBLE = 15;
/** Connections per WorldScreen shard; a full shard sends players on to the next one. */
export const SHARD_CAP = 40;
export const MAX_SHARDS = 4;

/**
 * The name other classes see. Generated names ("BraveOtter42") are shown as they are. A name from a
 * teacher's list could be a real first name, so outside the class it's replaced by a generated name
 * that is the same every time for that student.
 */
export function worldName(memberId: string, publicName: string): string {
  if (isGeneratedName(publicName)) return publicName;
  let h = 0x811c9dc5; // FNV-1a
  for (let i = 0; i < memberId.length; i++) h = Math.imul(h ^ memberId.charCodeAt(i), 0x01000193) >>> 0;
  return makeName(seeded(h));
}

/** World players' ids are shown to the game as negative numbers, so they never clash with classmates'. */
export const worldKey = (pid: number) => -pid;
