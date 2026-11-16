import * as Phaser from 'phaser';
import { sfx } from '../../audio.ts';
import type { BattleEvent } from '../../core/battle.ts';
import { SPELLS } from '../../core/spells.ts';
import type { Clip } from '../../data/v2.ts';
import { BATTLE, CREATURES } from '../../data/v2.ts';
import motion from '../../data/v2/motion.json';
import { slot } from '../../state/save.ts';
import type { Battle } from '../../state/session.ts';
import { useSession } from '../../state/session.ts';
import { Avatar, BATTLE_CLIPS, queueAvatar } from '../avatar.ts';
import { addCreature, breathe, monsterImage, petImage, SIZE } from '../creature.ts';
import type { VfxName } from '../fx.ts';
import { burst, coinsFly, queueVfx, shieldRing, tween, vfx, wait } from '../fx.ts';
import { reducedMotion } from '../motion.ts';
import { queue, queueSheet, STAGE_H, STAGE_W, stageCamera } from '../stage.ts';

// Layout on the 640×360 stage. The question card covers the bottom, so everyone stands above it:
// the background is drawn 1.5× and bottom-aligned, which lifts its floor into view.
const FEET = 224;
const PLAYER_X = 150;
const FOE_X = 474;
const BG_SCALE = 1.5;
const VFX_USED: VfxName[] = ['hit-spark', 'coin-burst', 'capture-sparkle', 'level-up-rays', 'heal-swirl', 'shield-bubble', 'spell-cast', 'spell-projectile', 'spell-impact', 'hurt-flash', 'defeat-poof'];

/** Animates battle events from the session store, then tells it when they're done. */
export class BattleScene extends Phaser.Scene {
  private player!: Avatar;
  /** A regular monster is one image moved by code; a boss plays its idle and attack clips. */
  private foe!: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
  private foeScale = 1;
  private clips: Record<string, Clip> | null = null;
  private foeTop = 0;
  private shield: Phaser.GameObjects.Graphics | null = null;
  private barrier: Phaser.GameObjects.Graphics | null = null;
  private bubble: Phaser.GameObjects.Graphics | null = null;
  private pet: Phaser.GameObjects.Image | null = null;
  private fast = false;
  private zone = '';

  constructor() {
    super('battle');
  }

  init(): void {
    const b = useSession.getState().battle!;
    this.zone = b.monster.zone;
    this.clips = b.monster.boss ? (CREATURES.bosses[b.monster.art]?.clips ?? null) : null;
    this.shield = null;
    this.barrier = null;
    this.bubble = null;
    this.pet = null;
  }

  private get bg(): string {
    return BATTLE.backgrounds[this.zone] ?? BATTLE.backgrounds.ledgerhold!;
  }

  preload(): void {
    const b = useSession.getState().battle!;
    const s = slot();
    queue(this, this.bg);
    if (this.clips) for (const c of Object.values(this.clips)) queueSheet(this, c.image, c.cell);
    else queue(this, monsterImage(b.monster, 'left'));
    queueAvatar(this, s.look, s.inventory.hat, BATTLE_CLIPS);
    const pet = s.inventory.pet ? petImage(s.inventory.pet, 'right', s.inventory.petLook) : null;
    if (pet) queue(this, pet.image);
    queueVfx(this, VFX_USED);
  }

  create(): void {
    const b = useSession.getState().battle!;
    const s = slot();
    this.fast = reducedMotion(s.settings.reducedMotion);
    stageCamera(this);
    this.add.image(STAGE_W / 2, STAGE_H, this.bg).setOrigin(0.5, 1).setDisplaySize(STAGE_W * BG_SCALE, STAGE_H * BG_SCALE).setDepth(-1000);

    this.player = new Avatar(this, PLAYER_X, FEET, s.look, s.inventory.hat, SIZE.playerBattle);
    // The equipped pet stands beside you and helps each spell.
    const pet = s.inventory.pet ? petImage(s.inventory.pet, 'right', s.inventory.petLook) : null;
    if (pet) {
      this.pet = addCreature(this, pet.image, PLAYER_X - 62, FEET + 6, pet.tall * 1.15);
      breathe(this, this.pet, this.fast);
    }

    const idle = this.clips?.idle;
    if (idle) {
      // Bosses play their idle clip: scale it so the body is bossBattle px from head to feet.
      for (const [name, c] of Object.entries(this.clips!)) if (!this.anims.exists(c.image)) this.anims.create({ key: c.image, frames: this.anims.generateFrameNumbers(c.image, { start: 0, end: c.frames - 1 }), frameRate: name === 'idle' ? 7 : 12, repeat: name === 'idle' ? -1 : 0 });
      this.foeScale = SIZE.bossBattle / idle.foot[1];
      this.foe = this.add.sprite(FOE_X, FEET, idle.image, 0).setOrigin(idle.foot[0] / idle.cell[0], idle.foot[1] / idle.cell[1]).setScale(this.foeScale).setDepth(FEET);
      if (!this.fast) (this.foe as Phaser.GameObjects.Sprite).play(idle.image);
      this.foeTop = FEET - SIZE.bossBattle;
    } else {
      const tall = b.monster.boss ? SIZE.bossBattle : SIZE.monsterBattle;
      this.foe = addCreature(this, monsterImage(b.monster, 'left'), FOE_X, FEET, tall);
      this.foeScale = this.foe.scaleX;
      breathe(this, this.foe, this.fast);
      this.foeTop = FEET - tall;
    }

    const off = useSession.subscribe((st, prev) => {
      if (st.battle && st.battle.seq !== prev.battle?.seq) void this.play(st.battle);
    });
    this.events.once('shutdown', off);
    void this.intro();
  }

  private async intro(): Promise<void> {
    this.player.sprite.x -= 120;
    this.foe.x += 180;
    const d = this.fast ? 100 : 380;
    await Promise.all([tween(this, { targets: this.player.sprite, x: PLAYER_X, duration: d, ease: 'Back.easeOut' }), tween(this, { targets: this.foe, x: FOE_X, duration: d, ease: 'Back.easeOut' })]);
    useSession.getState().introDone();
  }

  /** Play one of the player's clips once, then go back to idle. */
  private act(clip: 'attack' | 'hit', ms: number): Promise<void> {
    if (this.fast) return wait(this, 120);
    this.player.show(clip, false, true);
    return wait(this, ms).then(() => this.player.show('idle'));
  }

  /** The monster's attack: a boss plays its attack clip; a regular monster lunges (motion spec). */
  private async foeAttack(): Promise<void> {
    const f = this.foe;
    const atk = this.clips?.attack, idle = this.clips?.idle;
    if (this.fast) return wait(this, 120);
    if (atk && idle && f instanceof Phaser.GameObjects.Sprite) {
      f.setTexture(atk.image, 0).setOrigin(atk.foot[0] / atk.cell[0], atk.foot[1] / atk.cell[1]).play(atk.image);
      await wait(this, (atk.frames / 12) * 1000);
      f.setTexture(idle.image, 0).setOrigin(idle.foot[0] / idle.cell[0], idle.foot[1] / idle.cell[1]).play(idle.image);
      return;
    }
    const a = motion.attack;
    await tween(this, { targets: f, x: FOE_X + 14, duration: a.windup.ms, ease: 'Quad.easeOut' });
    await tween(this, { targets: f, x: FOE_X - 70, duration: a.lunge.ms, ease: 'Quad.easeIn' });
    await tween(this, { targets: f, x: FOE_X, duration: a.recover.ms, ease: 'Quad.easeOut' });
  }

  private async foeHurt(): Promise<void> {
    if (this.fast) return wait(this, 100);
    const f = this.foe;
    f.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.time.delayedCall(motion.hit.flash.ms, () => f.clearTint().setTintMode(Phaser.TintModes.MULTIPLY));
    await tween(this, { targets: f, x: FOE_X + 12, duration: 70, yoyo: true, ease: 'Quad.easeOut' });
    await wait(this, 110);
  }

  private async play(b: Battle): Promise<void> {
    for (const e of b.events) await this.show(e, b);
    await wait(this, this.fast ? 80 : 200);
    useSession.getState().animated();
  }

  private async show(e: BattleEvent, b: Battle): Promise<void> {
    const f = this.fast;
    const s = useSession.getState();
    const foeMid = (FEET + this.foeTop) / 2;
    const playerMid = FEET - SIZE.playerBattle / 2;
    const playerTop = FEET - SIZE.playerBattle;
    switch (e.type) {
      case 'cast': {
        sfx('cast');
        const colour = SPELLS[e.spell].color;
        void vfx(this, 'spell-cast', PLAYER_X, playerMid, 120, { fast: f, tint: colour, depth: FEET - 1 });
        await this.act('attack', 420);
        await vfx(this, 'spell-projectile', PLAYER_X + 40, playerMid, 80, { fast: f, tint: colour, move: [FOE_X - 30, foeMid] });
        return;
      }
      case 'monsterHurt':
        sfx('hit');
        void vfx(this, 'spell-impact', FOE_X, foeMid, 150, { fast: f });
        s.float(FOE_X, this.foeTop - 6, `-${e.amount}`, 'damage');
        if (e.hp > 0) await this.foeHurt();
        return;
      case 'potUp':
        s.float(PLAYER_X, playerTop - 8, `+${e.amount} coins`, 'coin');
        void vfx(this, 'coin-burst', PLAYER_X, playerTop, 90, { fast: f });
        return;
      case 'shieldUp':
        this.shield?.destroy();
        this.shield = shieldRing(this, PLAYER_X, playerMid, 62, SPELLS.save_shield.color);
        void vfx(this, 'shield-bubble', PLAYER_X, playerMid, 170, { fast: f });
        return;
      case 'attack':
        if (e.hit === 1) s.float(320, 40, `${e.name}!`, 'info');
        await this.foeAttack();
        return;
      case 'playerHurt':
        if (this.bubble) {
          this.bubble.destroy();
          this.bubble = null;
        }
        if (this.barrier && !b.state.barrier) {
          this.barrier.destroy();
          this.barrier = null;
        }
        if (this.shield) {
          const g = this.shield;
          this.shield = null;
          void tween(this, { targets: g, alpha: 0, duration: 200 }).then(() => g.destroy());
        }
        if (e.blocked) s.float(PLAYER_X, playerTop - 28, `Shield blocked ${e.blocked}`, 'info');
        if (e.amount) {
          sfx('hurt');
          if (!f) this.cameras.main.shake(140, 0.006);
          s.float(PLAYER_X, playerTop - 6, `-${e.amount}`, 'hurt');
          void vfx(this, 'hurt-flash', PLAYER_X, playerMid, 150, { fast: f });
          await this.act('hit', 520);
        } else await wait(this, f ? 100 : 250);
        return;
      case 'shieldEaten':
        s.float(PLAYER_X, playerTop - 40, 'Shield eaten!', 'info');
        return;
      case 'coinsTaken':
        sfx('coins');
        s.float(PLAYER_X, playerTop - 20, `-${e.amount} coins`, 'coin');
        await coinsFly(this, [PLAYER_X, playerMid], [FOE_X, foeMid], f);
        return;
      case 'warning':
        return; // shown on the question card
      case 'buff':
        void vfx(this, 'heal-swirl', PLAYER_X, playerMid, 150, { fast: f, tint: 0x91a7ff });
        if (b.state.barrier && !this.barrier) this.barrier = shieldRing(this, PLAYER_X, playerMid, 70, SPELLS.insurance_barrier.color);
        s.float(PLAYER_X, playerTop - 30, '✨', 'info');
        return;
      case 'potTaken':
        sfx('coins');
        s.float(FOE_X, this.foeTop - 10, `-${e.amount} coins from the pot`, 'coin');
        return;
      case 'monsterGrows':
        s.float(FOE_X, this.foeTop - 10, e.text.includes('split') ? 'Split!' : 'Getting stronger!', 'info');
        await tween(this, { targets: this.foe, scale: this.foeScale * 1.12, duration: f ? 60 : 160, yoyo: true });
        return;
      case 'hpBalanced':
        s.float(320, 60, 'Scales balanced!', 'info');
        await wait(this, f ? 100 : 300);
        return;
      case 'petOut':
        if (this.pet) await tween(this, { targets: this.pet, alpha: 0.3, angle: -80, duration: f ? 80 : 300 });
        s.float(PLAYER_X - 62, FEET - 60, 'Pet knocked out!', 'info');
        return;
      case 'burned':
        s.float(PLAYER_X, playerTop - 6, `🔥 -${e.amount}`, 'hurt');
        burst(this, PLAYER_X, playerMid, 0xff922b, 8, 34, f);
        return;
      case 'headDown':
        s.float(FOE_X, this.foeTop - 10, `A head is down! ${e.left} left`, 'info');
        await wait(this, f ? 100 : 350);
        return;
      case 'healed':
        s.float(FOE_X, this.foeTop - 10, `+${e.amount} HP`, 'info');
        void vfx(this, 'heal-swirl', FOE_X, foeMid, 160, { fast: f });
        return;
      case 'woke':
        s.float(PLAYER_X, playerTop - 20, 'Zzz… awake!', 'info');
        await wait(this, f ? 100 : 400);
        return;
      case 'bubble': {
        this.bubble?.destroy();
        const g = this.add.graphics().setDepth(850);
        const r = 44 + e.size * 12;
        g.lineStyle(2, 0xffffff, 0.9).strokeCircle(FOE_X, foeMid, r).fillStyle(0xa5d8ff, 0.2).fillCircle(FOE_X, foeMid, r);
        this.bubble = g;
        await wait(this, f ? 100 : 300);
        return;
      }
      case 'won': {
        // The monster shrinks into a puff, then you celebrate.
        void vfx(this, 'defeat-poof', FOE_X, foeMid, 190, { fast: f });
        await tween(this, { targets: this.foe, scale: this.foeScale * 0.6, alpha: 0, duration: f ? 120 : 380 });
        this.foe.setVisible(false);
        this.bubble?.destroy();
        this.bubble = null;
        if (!f) {
          void vfx(this, 'capture-sparkle', FOE_X, foeMid, 170);
          void vfx(this, 'level-up-rays', PLAYER_X, playerMid, 220, { depth: FEET - 1 });
          this.player.show('victory', false, true);
        }
        return;
      }
      case 'lost':
        sfx('faint');
        if (f) await tween(this, { targets: this.player.sprite, alpha: 0.4, duration: 100 });
        else (this.player.show('defeat', false, true), await wait(this, 1300));
        return;
    }
  }
}
