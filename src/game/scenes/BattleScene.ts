import * as Phaser from 'phaser';
import { sfx } from '../../audio.ts';
import type { BattleEvent } from '../../core/battle.ts';
import { SPELLS } from '../../core/spells.ts';
import { MONSTER_FACES_RIGHT } from '../../data/monsterFacing.ts';
import { slot } from '../../state/save.ts';
import type { Battle } from '../../state/session.ts';
import { useSession } from '../../state/session.ts';
import { addChar, pose } from '../chars.ts';
import { beam, burst, coinsFly, shieldRing, tween, wait } from '../fx.ts';
import { battleKey, manifest, monsterAnims, queueBattleBg, queueCharacter, queueMonster } from '../manifest.ts';
import { reducedMotion } from '../motion.ts';
import { PLAYER } from './RoomScene.ts';

// Layout on the 640×360 canvas. The question card covers the bottom, so everyone stands above it.
const FEET = 210;
const PLAYER_X = 150;
const FOE_X = 470;

/** Animates battle events from the session store, then tells it when they're done. */
export class BattleScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite;
  private foe!: Phaser.GameObjects.Sprite;
  private foeId = '';
  private foeTop = 0;
  private shield: Phaser.GameObjects.Graphics | null = null;
  private fast = false;
  private zone = '';

  constructor() {
    super('battle');
  }

  init(): void {
    const b = useSession.getState().battle!;
    this.foeId = b.monster.id;
    this.zone = b.monster.zone;
    this.shield = null;
  }

  preload(): void {
    queueBattleBg(this, this.zone);
    queueMonster(this, this.foeId);
    queueCharacter(this, PLAYER);
  }

  create(): void {
    const b = useSession.getState().battle!;
    this.fast = reducedMotion(slot().settings.reducedMotion);
    this.add.image(0, 0, battleKey(this.zone)).setOrigin(0).setScale(2);

    this.player = addChar(this, PLAYER, PLAYER_X, FEET);
    pose(this.player, PLAYER, 'idle', 'east');

    // Bosses are drawn at 2× in battle (192 px, 3× the player); regular monsters at 1×.
    const info = manifest.monsters[this.foeId]!;
    const k = b.monster.boss ? 2 : 1;
    monsterAnims(this, this.foeId);
    this.foe = this.add.sprite(FOE_X, FEET, info.atlas).setOrigin(0.5, info.baseline / info.cell).setScale(k).play(`${this.foeId}_idle`);
    if (MONSTER_FACES_RIGHT.has(this.foeId)) this.foe.setFlipX(true);
    this.foeTop = FEET - info.size * k;

    const off = useSession.subscribe((s, prev) => {
      if (s.battle && s.battle.seq !== prev.battle?.seq) void this.play(s.battle);
    });
    this.events.once('shutdown', off);
    void this.intro();
  }

  private async intro(): Promise<void> {
    this.player.x -= 120;
    this.foe.x += 160;
    const d = this.fast ? 100 : 380;
    await Promise.all([tween(this, { targets: this.player, x: PLAYER_X, duration: d, ease: 'Back.easeOut' }), tween(this, { targets: this.foe, x: FOE_X, duration: d, ease: 'Back.easeOut' })]);
    useSession.getState().introDone();
  }

  private once(s: Phaser.GameObjects.Sprite, key: string, after: (() => void) | null, fallbackMs: number): Promise<void> {
    if (this.fast || !this.anims.exists(key)) return wait(this, this.fast ? 120 : fallbackMs);
    return new Promise((resolve) => {
      s.play(key);
      s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        after?.();
        resolve();
      });
    });
  }

  private async play(b: Battle): Promise<void> {
    for (const e of b.events) await this.show(e);
    await wait(this, this.fast ? 80 : 200);
    useSession.getState().animated();
  }

  private async show(e: BattleEvent): Promise<void> {
    const f = this.fast;
    const s = useSession.getState();
    const foeMid = (FEET + this.foeTop) / 2;
    const playerMid = FEET - 30;
    const idleP = () => pose(this.player, PLAYER, 'idle', 'east');
    const idleF = () => this.foe.play(`${this.foeId}_idle`);
    switch (e.type) {
      case 'cast':
        sfx('cast');
        await this.once(this.player, `${PLAYER}:cast:east`, idleP, 300);
        await beam(this, PLAYER_X + 24, FOE_X - 24, playerMid, SPELLS[e.spell].color, f);
        return;
      case 'monsterHurt':
        sfx('hit');
        burst(this, FOE_X, foeMid, 0xffffff, 12, 30, f);
        s.float(FOE_X, this.foeTop - 6, `-${e.amount}`, 'damage');
        if (e.hp > 0) await this.once(this.foe, `${this.foeId}_hit`, idleF, 250);
        return;
      case 'potUp':
        s.float(PLAYER_X, FEET - 80, `+${e.amount} coins`, 'coin');
        return;
      case 'shieldUp':
        this.shield?.destroy();
        this.shield = shieldRing(this, PLAYER_X, playerMid, 34, SPELLS.save_shield.color);
        return;
      case 'attack':
        if (e.hit === 1) s.float(320, 40, `${e.name}!`, 'info');
        await this.once(this.foe, `${this.foeId}_attack`, idleF, 350);
        return;
      case 'playerHurt':
        if (this.shield) {
          const g = this.shield;
          this.shield = null;
          void tween(this, { targets: g, alpha: 0, duration: 200 }).then(() => g.destroy());
        }
        if (e.blocked) s.float(PLAYER_X, FEET - 96, `Shield blocked ${e.blocked}`, 'info');
        if (e.amount) {
          sfx('hurt');
          if (!f) this.cameras.main.shake(140, 0.008);
          s.float(PLAYER_X, FEET - 72, `-${e.amount}`, 'hurt');
          await this.once(this.player, `${PLAYER}:hit:east`, idleP, 300);
        } else await wait(this, f ? 100 : 250);
        return;
      case 'shieldEaten':
        s.float(PLAYER_X, FEET - 110, 'Shield eaten!', 'info');
        return;
      case 'coinsTaken':
        sfx('coins');
        s.float(PLAYER_X, FEET - 90, `-${e.amount} coins`, 'coin');
        await coinsFly(this, [PLAYER_X, playerMid], [FOE_X, foeMid], f);
        return;
      case 'warning':
        return; // shown on the question card
      case 'won':
        await this.once(this.foe, `${this.foeId}_defeat`, null, 400);
        this.foe.setVisible(false);
        if (!f) for (let i = 0; i < 3; i++) burst(this, FOE_X + (i - 1) * 30, foeMid - i * 10, [0xffd43b, 0x63e6be, 0xf783ac][i]!, 14, 40);
        return;
      case 'lost':
        sfx('faint');
        await tween(this, { targets: this.player, alpha: 0.4, angle: -10, duration: f ? 100 : 450 });
        return;
    }
  }
}
