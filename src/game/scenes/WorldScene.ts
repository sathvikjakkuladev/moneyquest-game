import * as Phaser from 'phaser';
import { zoneOpen } from '../../core/progression.ts';
import { ACADEMY_AT, ZONES } from '../../data/zones.ts';
import { slot } from '../../state/save.ts';

/** World map (placeholder until Phase 3): the pixelized map with a glow on islands you can visit.
 *  The island buttons themselves are React, so they work with the keyboard and screen readers. */
export class WorldScene extends Phaser.Scene {
  constructor() {
    super('world');
  }

  create(): void {
    if (this.textures.exists('worldmap')) this.add.image(0, 0, 'worldmap').setOrigin(0);
    else this.add.rectangle(0, 0, 640, 360, 0x4dabf7).setOrigin(0);
    const cleared = slot().progress.zonesCleared;
    const glow = (x: number, y: number) => {
      const g = this.add.circle(x, y, 34, 0xfff3bf, 0.25);
      this.tweens.add({ targets: g, alpha: 0.05, duration: 1000, yoyo: true, repeat: -1 });
    };
    glow(...ACADEMY_AT);
    for (const z of ZONES) if (z.ready && zoneOpen(z.id, cleared)) glow(...z.at);
    this.cameras.main.fadeIn(200, 0, 0, 0);
  }
}
