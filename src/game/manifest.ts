// Typed access to the generated asset manifest, plus loaders and animation helpers for Phaser.
import type * as Phaser from 'phaser';
import manifestJson from '../assets/manifest.json';

export type Pt = [number, number];
export interface Exit { edge: 'left' | 'right' | 'top' | 'bottom'; range: [number, number]; to: string; enter_at: Pt | null }
export interface PackScreen { image: string; landmark?: string; npcs?: string[]; exits: Exit[]; entries?: Record<string, Pt>; monster_spawns?: Pt[]; boss_spawn?: Pt; portals?: { at: Pt; color: string; to: string }[] }
export interface Anim { key: string; frames: string[]; frameRate: number; repeat: number }
export interface Manifest {
  basePath: string;
  locations: Record<string, { topic: string; start: string; battleBg: string | null; screens: Record<string, PackScreen> }>;
  monsters: Record<string, { zone: string; atlas: string; image: string; json: string; cell: number; baseline: number; size: number; boss: boolean; anims: Anim[] }>;
  characters: Record<string, { atlas: string; image: string; json: string; size: number; anims: Record<string, Record<string, string[]>>; rotations: Record<string, string> }>;
  v1px: Record<string, { atlas: string; image: string; json: string; frames: string[]; anims?: Record<string, { frames: string[]; flipX: boolean }> }>;
  worldMap: string | null;
}
export const manifest = manifestJson as unknown as Manifest;
const url = (p: string) => manifest.basePath + p;

export const screenKey = (zone: string, screen: string) => `scr:${zone}/${screen}`;
export const battleKey = (zone: string) => `bat:${zone}`;

export function queueScreens(scene: Phaser.Scene, zone: string): void {
  const loc = manifest.locations[zone]!;
  for (const [name, s] of Object.entries(loc.screens)) if (!scene.textures.exists(screenKey(zone, name))) scene.load.image(screenKey(zone, name), url(s.image));
}
export function queueBattleBg(scene: Phaser.Scene, zone: string): void {
  const bg = manifest.locations[zone]!.battleBg;
  if (bg && !scene.textures.exists(battleKey(zone))) scene.load.image(battleKey(zone), url(bg));
}
export function queueMonster(scene: Phaser.Scene, id: string): void {
  const m = manifest.monsters[id]!;
  if (!scene.textures.exists(m.atlas)) scene.load.atlas(m.atlas, url(m.image), url(m.json));
}
export function queueCharacter(scene: Phaser.Scene, id: string): void {
  const c = manifest.characters[id]!;
  if (!scene.textures.exists(c.atlas)) scene.load.atlas(c.atlas, url(c.image), url(c.json));
}

/** Monster animations keep the sheet's keys, e.g. `mon_spendling_idle`. */
export function monsterAnims(scene: Phaser.Scene, id: string): void {
  const m = manifest.monsters[id]!;
  for (const a of m.anims) if (!scene.anims.exists(a.key)) scene.anims.create({ key: a.key, frames: a.frames.map((frame) => ({ key: m.atlas, frame })), frameRate: a.frameRate, repeat: a.repeat });
}

/** Character animations: `${id}:${anim}:${direction}` for each drawn direction. */
export function characterAnims(scene: Phaser.Scene, id: string): void {
  const c = manifest.characters[id]!;
  for (const [anim, byDir] of Object.entries(c.anims))
    for (const [dir, frames] of Object.entries(byDir)) {
      const key = `${id}:${anim}:${dir}`;
      if (!scene.anims.exists(key)) scene.anims.create({ key, frames: frames.map((frame) => ({ key: c.atlas, frame })), frameRate: anim === 'walk' ? 10 : 8, repeat: anim === 'walk' || anim === 'idle' ? -1 : 0 });
    }
}
