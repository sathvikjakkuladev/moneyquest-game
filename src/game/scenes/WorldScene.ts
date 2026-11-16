import * as Phaser from 'phaser';
import { canEnter } from '../../core/unlocks.ts';
import { WORLD } from '../../data/v2.ts';
import { HUB, ZONES } from '../../data/zones.ts';
import { slot } from '../../state/save.ts';
import { reducedMotion } from '../motion.ts';
import { STAGE_H, STAGE_W, stageCamera } from '../stage.ts';

/** The world map of Vaultspire. The places you can travel to are React buttons (WorldButtons). */
export class WorldScene extends Phaser.Scene {
  constructor() {
    super('world');
  }

  create(): void {
    stageCamera(this);
    this.add.image(0, 0, WORLD.image).setOrigin(0).setDisplaySize(STAGE_W, STAGE_H);
    // A soft glow marks the places that are open.
    const s = slot();
    const calm = reducedMotion(s.settings.reducedMotion);
    const glow = (x: number, y: number, r: number) => {
      const c = this.add.circle(x, y, r).setStrokeStyle(2, 0xfff3bf, 0.9);
      if (!calm) this.tweens.add({ targets: c, scale: 1.12, alpha: 0.35, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    };
    glow(HUB.at[0], HUB.at[1], WORLD.pins[HUB.id]!.r);
    for (const z of ZONES) if (canEnter(z.id, s.progress.zonesCleared, z.bonus, s.moneyCheck.post !== null)) glow(z.at[0], z.at[1], WORLD.pins[z.id]!.r * 0.8);
    this.cameras.main.fadeIn(calm ? 60 : 200, 0, 0, 0);
  }
}
