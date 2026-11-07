// The equipped pet follows a few steps behind the player. The Bull Calf has a walk cycle; other pets
// are single images that hop while moving and flip to face their direction.
import type * as Phaser from 'phaser';
import type { Pt } from '../core/geometry.ts';
import { item } from '../data/items.ts';
import { manifest, queueV1px } from './manifest.ts';

const LAG = 22; // trail samples behind the player
const WALK_ART = 'pet_bull_calf';

export function queuePet(scene: Phaser.Scene, petId: string | null): void {
  const it = petId ? item(petId) : undefined;
  if (!it) return;
  queueV1px(scene, it.art === WALK_ART ? 'pet_bull_calf_walk' : 'pets');
}

export class Follower {
  private trail: Pt[] = [];
  private sprite: Phaser.GameObjects.Sprite;
  private walker: boolean;
  private hop = 0;

  constructor(scene: Phaser.Scene, petId: string, start: Pt) {
    const it = item(petId)!;
    this.walker = it.art === WALK_ART;
    const key = this.walker ? manifest.v1px.pet_bull_calf_walk!.atlas : manifest.v1px.pets!.atlas;
    this.sprite = scene.add.sprite(start[0] - 18, start[1], key, this.walker ? 'down_0' : it.art).setOrigin(0.5, 1);
    if (this.walker) {
      for (const dir of ['down', 'up', 'left', 'right']) {
        const k = `pet-bull:${dir}`;
        if (!scene.anims.exists(k)) scene.anims.create({ key: k, frames: [0, 1, 2, 3].map((i) => ({ key, frame: `${dir}_${i}` })), frameRate: 8, repeat: -1 });
      }
    }
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
    const dx = target[0] - s.x, dy = target[1] - (s.y + 0);
    const going = Math.hypot(dx, dy) > 0.5;
    s.x = target[0];
    s.y = target[1];
    s.setDepth(s.y - 0.5);
    if (this.walker) {
      if (going) s.play(`pet-bull:${Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down'}`, true);
      else s.stop();
    } else {
      if (Math.abs(dx) > 0.2) s.setFlipX(dx > 0);
      this.hop = going ? this.hop + dtMs / 90 : 0;
      s.y = target[1] - Math.round(Math.abs(Math.sin(this.hop)) * 3);
    }
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
