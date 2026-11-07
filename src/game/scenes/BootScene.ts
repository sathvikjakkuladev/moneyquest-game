import * as Phaser from 'phaser';
import { useSession } from '../../state/session.ts';
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
    s.setScreen('title');
    s.go({ kind: 'room', zone: 'coin_academy', attract: true });
  }
}
