import * as Phaser from 'phaser';
import { characterAnims, manifest, monsterAnims, queueCharacter, queueMonster, queueScreens, screenKey } from './manifest.ts';

/**
 * Phase 1 pipeline check: every screen of every location at true size (screen art at 2×, sprites
 * at 1×), with the player, the mentor and each zone's monsters on their rooms.json spots.
 * ←/→ change screen. Replaced by the real game in Phase 2.
 */
export class CheckScene extends Phaser.Scene {
  private list: { zone: string; screen: string }[] = [];
  private i = 0;
  private layer!: Phaser.GameObjects.Container;
  onLabel: (text: string) => void = () => {};

  constructor() {
    super('check');
  }

  preload(): void {
    for (const zone of Object.keys(manifest.locations)) {
      queueScreens(this, zone);
      for (const name of Object.keys(manifest.locations[zone]!.screens)) this.list.push({ zone, screen: name });
    }
    for (const id of Object.keys(manifest.monsters)) queueMonster(this, id);
    for (const id of Object.keys(manifest.characters)) queueCharacter(this, id);
  }

  create(): void {
    this.layer = this.add.container();
    for (const id of Object.keys(manifest.monsters)) monsterAnims(this, id);
    for (const id of Object.keys(manifest.characters)) characterAnims(this, id);
    this.input.keyboard?.on('keydown-RIGHT', () => this.show(this.i + 1));
    this.input.keyboard?.on('keydown-LEFT', () => this.show(this.i - 1));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.show(this.i + (p.x < 320 ? -1 : 1)));
    this.show(this.list.findIndex((s) => s.zone === 'piggybank_village' && s.screen === 'gate'));
    this.game.events.emit('mq:ready');
  }

  private show(n: number): void {
    this.i = (n + this.list.length) % this.list.length;
    const { zone, screen } = this.list[this.i]!;
    const s = manifest.locations[zone]!.screens[screen]!;
    this.layer.removeAll(true);
    this.layer.add(this.add.image(0, 0, screenKey(zone, screen)).setOrigin(0).setScale(2));
    const zoneMonsters = Object.entries(manifest.monsters).filter(([, m]) => m.zone === zone);
    const regular = zoneMonsters.filter(([, m]) => !m.boss);
    const boss = zoneMonsters.find(([, m]) => m.boss);
    const put = (id: string, [x, y]: [number, number]) => {
      const m = manifest.monsters[id]!;
      const spr = this.add.sprite(x, y, m.atlas).setOrigin(0.5, m.baseline / m.cell).play(`${id}_idle`);
      this.layer.add(spr);
    };
    (s.monster_spawns ?? []).forEach((p, k) => regular[k % Math.max(1, regular.length)] && put(regular[k % regular.length]![0], p));
    if (s.boss_spawn && boss) put(boss[0], s.boss_spawn);
    const entry = Object.values(s.entries ?? {})[0] ?? [320, 300];
    const player = this.add.sprite(entry[0], entry[1], manifest.characters.player_coin_wizard!.atlas).setOrigin(0.5, 0.94).play('player_coin_wizard:walk:south');
    this.layer.add(player);
    if (zone === 'piggybank_village' && screen === 'cottages') {
      this.layer.add(this.add.sprite(205, 165, manifest.characters.mentor_piggybank_village!.atlas).setOrigin(0.5, 0.94).play('mentor_piggybank_village:idle:south'));
    }
    this.onLabel(`${zone.replace(/_/g, ' ')} · ${screen.replace(/_/g, ' ')}  (${this.i + 1}/${this.list.length}, ← → to change)`);
  }
}
