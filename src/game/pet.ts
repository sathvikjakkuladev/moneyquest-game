// The equipped pet follows a few steps behind the player: a captured monster (or the Bull Calf)
// that hops along and turns to face the way it is going (motion spec: "follow").
import type * as Phaser from 'phaser';
import type { Pt } from '../core/geometry.ts';
import type { View } from '../data/v2.ts';
import motion from '../data/v2/motion.json';
import { addCreature, petImage } from './creature.ts';
import { queue } from './stage.ts';

const LAG = 22; // trail samples behind the player
const VIEWS: View[] = ['front', 'back', 'left', 'right'];

/** The images a pet needs (its four views). Empty if the id isn't a pet this game knows. */
export function petSources(petId: string | null, look: string | null): string[] {
  return petId && petImage(petId, 'front', look) ? VIEWS.map((v) => petImage(petId, v, look)!.image) : [];
}
export const queuePet = (scene: Phaser.Scene, petId: string | null, look: string | null): string[] => petSources(petId, look).map((k) => queue(scene, k));

export class Follower {
  private trail: Pt[] = [];
  private sprite: Phaser.GameObjects.Image;
  private images: Record<View, string>;
  private view: View = 'front';
  private hop = 0;

  constructor(scene: Phaser.Scene, petId: string, look: string | null, start: Pt) {
    const p = petImage(petId, 'front', look)!;
    this.images = Object.fromEntries(VIEWS.map((v) => [v, petImage(petId, v, look)!.image])) as Record<View, string>;
    this.sprite = addCreature(scene, p.image, start[0] - 18, start[1], p.tall);
    for (let i = 0; i < LAG; i++) this.trail.push([start[0] - 18, start[1]]);
  }

  /** Call every frame with the player's feet position. */
  update(player: Pt, moving: boolean, dtMs: number): void {
    const last = this.trail[this.trail.length - 1]!;
    if (moving && (Math.abs(last[0] - player[0]) > 0.5 || Math.abs(last[1] - player[1]) > 0.5)) {
      this.trail.push([player[0], player[1]]);
      if (this.trail.length > LAG) this.trail.shift();
    }
    const target = this.trail[0]!;
    const s = this.sprite;
    const dx = target[0] - s.x, dy = target[1] - s.depth;
    const going = Math.hypot(dx, dy) > 0.3;
    if (going) {
      const v: View = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'back' : 'front';
      if (v !== this.view) (this.view = v), s.setTexture(this.images[v]);
    }
    this.hop = going ? this.hop + dtMs / motion.follow.hop.period : 0;
    s.setPosition(target[0], target[1] - Math.abs(Math.sin(this.hop * Math.PI)) * 4);
    s.setDepth(target[1] - 0.5);
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
