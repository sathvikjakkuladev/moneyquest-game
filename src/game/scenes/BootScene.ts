import * as Phaser from 'phaser';
import { useSession } from '../../state/session.ts';
import { useSave } from '../../state/save.ts';
import { devMode } from '../../core/unlocks.ts';
import { manifest, queueCharacter, queueScreens } from '../manifest.ts';

/** Loads what the title and hub need, then shows the Great Hall behind the title screen. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    const bar = this.add.rectangle(170, 180, 1, 8, 0xf2c14e).setOrigin(0, 0.5);
    this.add.rectangle(320, 180, 304, 12).setStrokeStyle(2, 0xf2c14e);
    this.load.on('progress', (p: number) => (bar.width = 300 * p));
    queueScreens(this, 'coin_academy');
    for (const id of ['player_coin_wizard', 'headmaster', 'merchant']) if (manifest.characters[id]) queueCharacter(this, id);
    if (manifest.worldMap) this.load.image('worldmap', manifest.basePath + manifest.worldMap);
  }

  async create(): Promise<void> {
    await document.fonts.load('600 16px Fredoka').catch(() => undefined); // for the few canvas labels
    const s = useSession.getState();
    // Dev: after the map editor saves (which reloads the page), come straight back to that room.
    const back = devMode() ? sessionStorage.getItem('mq-dev-return') : null;
    if (back && useSave.getState().active !== null) {
      sessionStorage.removeItem('mq-dev-return');
      const r = JSON.parse(back) as { zone: string; screen: string; at: [number, number] | null };
      s.setScreen('play');
      s.go({ kind: 'room', zone: r.zone, screen: r.screen, at: r.at ?? undefined });
      return;
    }
    s.setScreen('title');
    s.go({ kind: 'room', zone: 'coin_academy', attract: true });
  }
}
