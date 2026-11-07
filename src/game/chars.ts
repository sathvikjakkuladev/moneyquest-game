// Characters (PixelLab layout): origin on the feet, and the best frame or animation for a facing.
import type * as Phaser from 'phaser';
import type { Facing } from '../data/rooms.ts';
import { characterAnims, manifest } from './manifest.ts';

export function addChar(scene: Phaser.Scene, id: string, x: number, y: number): Phaser.GameObjects.Sprite {
  const c = manifest.characters[id]!;
  characterAnims(scene, id);
  return scene.add.sprite(x, y, c.atlas, c.rotations.south).setOrigin(0.5, c.foot / c.size).setDepth(y);
}

/**
 * Show an animation facing a direction: the drawn direction, else east mirrored for west, else the
 * still rotation image for that direction (e.g. there's no idle drawn facing north).
 */
export function pose(s: Phaser.GameObjects.Sprite, id: string, anim: string, face: Facing): void {
  const c = manifest.characters[id]!;
  const drawn = c.anims[anim] ?? {};
  const use = drawn[face] ? face : face === 'west' && drawn.east ? 'east' : null;
  if (use) {
    s.setFlipX(face === 'west' && use === 'east');
    s.play(`${id}:${anim}:${use}`, true);
    return;
  }
  s.stop();
  s.setFlipX(false);
  s.setFrame(c.rotations[face] ?? c.rotations.south!);
}
