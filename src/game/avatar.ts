// The avatar in the game scenes: looks baked by avatarBake.ts become ordinary Phaser textures, so
// players (and classmates) are plain sprites: one draw call each, sorted by their feet like
// everything else.
import type * as Phaser from 'phaser';
import type { Look } from '../core/look.ts';
import type { ClipName } from './avatarBake.ts';
import { avatarSources, bakeSheet, clipRate, lookKey } from './avatarBake.ts';
import { queue, RENDER } from './stage.ts';

export type { ClipName } from './avatarBake.ts';
export { BATTLE_CLIPS, OVERWORLD_CLIPS } from './avatarBake.ts';

export function queueAvatar(scene: Phaser.Scene, look: Look, hatId: string | null, clips: readonly ClipName[]): string[] {
  return avatarSources(look, hatId, clips).map((rel) => queue(scene, rel));
}

const texKey = (look: Look, hatId: string | null, clip: ClipName, tall: number) => `av:${lookKey(look, hatId)}:${clip}:${tall}`;

/** Bake one clip of a look as a texture with an animation of the same key. Cached under that key. */
export function bakeAvatar(scene: Phaser.Scene, look: Look, hatId: string | null, clip: ClipName, tall: number): string {
  const key = texKey(look, hatId, clip, tall);
  if (scene.textures.exists(key)) return key;
  const b = bakeSheet((rel) => scene.textures.get(rel).getSourceImage() as HTMLImageElement, look, hatId, clip, tall);
  const tex = scene.textures.addCanvas(key, b.canvas)!;
  for (let f = 0; f < b.frames; f++) tex.add(f, 0, (f % b.cols) * b.cellW, Math.floor(f / b.cols) * b.cellH, b.cellW, b.cellH);
  const { rate, loop } = clipRate(clip);
  scene.anims.create({ key, frames: b.order.map((f) => ({ key, frame: f })), frameRate: rate, repeat: loop ? -1 : 0 });
  tex.customData = { ox: b.ox, oy: b.oy };
  return key;
}

/** Drop baked textures (classmates' looks) when a scene is done with them. */
export function dropAvatars(scene: Phaser.Scene, keys: Iterable<string>): void {
  for (const k of keys) {
    if (scene.anims.exists(k)) scene.anims.remove(k);
    if (scene.textures.exists(k)) scene.textures.remove(k);
  }
}

/**
 * A character drawn from baked clips. It is one Phaser sprite with its origin on the feet; `tall`
 * is its height on the stage. `show()` switches clip; left and right mirror the front clips.
 */
export class Avatar {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly keys = new Set<string>();
  private scene: Phaser.Scene;
  private look: Look;
  private hatId: string | null;
  private tall: number;
  private now: ClipName | null = null;
  private lean = 0;
  private leanTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, look: Look, hatId: string | null, tall: number, first: ClipName = 'idle') {
    this.scene = scene;
    this.look = look;
    this.hatId = hatId;
    this.tall = tall;
    const key = this.bake(first);
    this.sprite = scene.add.sprite(x, y, key, 0).setScale(1 / RENDER).setDepth(y);
    this.show(first);
  }

  private bake(clip: ClipName): string {
    const key = bakeAvatar(this.scene, this.look, this.hatId, clip, this.tall);
    this.keys.add(key);
    return key;
  }
  /** Can this clip be shown yet (are its images loaded)? */
  ready(clip: ClipName): boolean {
    return avatarSources(this.look, this.hatId, [clip]).every((k) => this.scene.textures.exists(k));
  }

  /** Play a clip (looping clips keep running if already playing). `flip` mirrors it. */
  show(clip: ClipName, flip = false, restart = false, side = false): void {
    const s = this.sprite;
    s.setFlipX(flip);
    // Walking sideways, the front walk leans a little into the direction of travel (the origin is on
    // the feet, so the body tips forward rather than sliding along upright).
    const lean = clip === 'walk' && side ? (flip ? -5 : 5) : 0;
    if (lean !== this.lean) {
      this.lean = lean;
      this.leanTween?.stop();
      this.leanTween = this.scene.tweens.add({ targets: s, angle: lean, duration: 120, ease: 'Sine.easeOut' });
    }
    if (this.now === clip && !restart) return;
    if (!this.ready(clip)) return;
    const key = this.bake(clip);
    const d = this.scene.textures.get(key).customData as { ox: number; oy: number };
    this.now = clip;
    s.setTexture(key, 0).setOrigin(d.ox, d.oy);
    s.play(key, !restart);
  }
  /** Stage y of the top of the head (for name tags and speech bubbles). */
  get headY(): number {
    return this.sprite.y - this.tall - 8;
  }
  /** Change the look or hat: the next `show` bakes it. The images must be loaded first. */
  restyle(look: Look, hatId: string | null): void {
    this.look = look;
    this.hatId = hatId;
    const clip = this.now ?? 'idle';
    this.now = null;
    this.show(clip, this.sprite.flipX);
  }
  destroy(): void {
    this.sprite.destroy();
  }
}
