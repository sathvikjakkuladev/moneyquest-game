import * as Phaser from 'phaser';
import { devMode } from '../../core/unlocks.ts';
import { ROOMS } from '../../data/rooms.ts';
import { art, LOCATIONS, WORLD } from '../../data/v2.ts';
import { useSave } from '../../state/save.ts';
import { useSession } from '../../state/session.ts';
import { queue } from '../stage.ts';

import { ATTRACT } from '../attract.ts';

/** Loads what the title needs, then shows Ledgerhold behind the title screen. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    const w = this.scale.width, h = this.scale.height;
    const bar = this.add.rectangle(w / 2 - 300, h / 2, 1, 16, 0xf2c14e).setOrigin(0, 0.5);
    this.add.rectangle(w / 2, h / 2, 608, 24).setStrokeStyle(4, 0xf2c14e);
    this.load.on('progress', (p: number) => (bar.width = 600 * p));
    queue(this, art.ground(ATTRACT.zone, ATTRACT.screen));
    for (const p of LOCATIONS[ATTRACT.zone]!.screens[ATTRACT.screen]!.props) queue(this, art.prop(ATTRACT.zone, p.p));
    queue(this, WORLD.image);
  }

  async create(): Promise<void> {
    await document.fonts.load('600 16px Fredoka').catch(() => undefined); // for the few canvas labels
    const s = useSession.getState();
    // Dev: after the map editor saves (which reloads the page), come straight back to that room.
    const back = devMode() ? sessionStorage.getItem('mq-dev-return') : null;
    if (back && useSave.getState().active !== null) {
      sessionStorage.removeItem('mq-dev-return');
      const r = JSON.parse(back) as { zone: string; screen: string; at: [number, number] | null };
      if (ROOMS[r.zone]) {
        s.setScreen('play');
        s.go({ kind: 'room', zone: r.zone, screen: r.screen, at: r.at ?? undefined });
        return;
      }
    }
    s.setScreen('title');
    s.go({ kind: 'room', ...ATTRACT, attract: true });
  }
}
