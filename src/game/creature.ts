// Monsters, bosses, pets and NPCs: single images (four views each) moved by code, following the
// art set's motion spec (src/data/v2/motion.json): a breathing idle, a lunge, a knock-back.
import type * as Phaser from 'phaser';
import type { MonsterDef } from '../core/monsters.ts';
import { MONSTERS } from '../core/monsters.ts';
import { BULL_CALF, tamedMonster } from '../data/items.ts';
import type { View } from '../data/v2.ts';
import { art, CREATURES } from '../data/v2.ts';
import motion from '../data/v2/motion.json';
import { RENDER, stageSize } from './stage.ts';

/** Heights on the 640×360 stage (PLAN.md §12). */
export const SIZE = { player: 64, playerBattle: 108, monster: 56, monsterBattle: 100, boss: 96, bossBattle: 180, pet: 40, petBoss: 50, npc: 66 };

/** A monster's image: bosses have one look; regular monsters wear a district's look (their own by default). */
export function monsterImage(def: MonsterDef, view: View | 'portrait', look?: string | null): string {
  if (def.boss) return art.boss(def.art, view);
  const looks = CREATURES.monsters[def.art]?.looks ?? [];
  return art.monster(def.art, look && looks.includes(look) ? look : def.zone, view);
}

/** What a pet id draws: a captured monster in a look, or the Bull Calf (the Hype Bull's fire look). */
export function petImage(petId: string, view: View | 'portrait', look?: string | null): { image: string; tall: number; legendary: boolean } | null {
  if (petId === 'pet-bull') return { image: art.monster(BULL_CALF.species, BULL_CALF.look, view), tall: SIZE.pet * BULL_CALF.scale, legendary: true };
  const m = MONSTERS[tamedMonster(petId) ?? ''];
  return m ? { image: monsterImage(m, view, look), tall: m.boss ? SIZE.petBoss : SIZE.pet, legendary: m.boss } : null;
}

/** Add a creature standing at (x, y), `tall` stage px high, sorted by its feet. */
export function addCreature(scene: Phaser.Scene, image: string, x: number, y: number, tall: number): Phaser.GameObjects.Image {
  return scene.add.image(x, y, image).setOrigin(0.5, 1).setScale(tall / (stageSize(image).h * RENDER)).setDepth(y);
}

/** The idle from the motion spec: a slow breath, squashing from the feet. */
export function breathe(scene: Phaser.Scene, s: Phaser.GameObjects.Image, calm: boolean): void {
  if (calm) return;
  const b = motion.idle.breathe;
  scene.tweens.add({ targets: s, scaleY: s.scaleY * b.scaleY[1]!, scaleX: s.scaleX * b.scaleX[1]!, duration: b.period / 2, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: Math.random() * 600 });
}
