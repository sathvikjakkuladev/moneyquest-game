// The layered avatar (PLAN.md §12; ported from docs/assets_v2/overlay.py and fit2.py).
//
// A look is baked into one sprite sheet per clip: each of the clip's 16 body frames is recoloured
// (skin tone, costume colour set), then hair, face and hat are drawn on it, placed from the clip's
// per-frame head track. The result is an ordinary Phaser texture, so players (and classmates) are
// plain sprites: one draw call each, sorted by their feet like everything else.
import * as Phaser from 'phaser';
import type { Look } from '../core/look.ts';
import { fill, hexRgb, paintBody, reskin, tint } from '../core/recolor.ts';
import type { Clip, HatArt, Layer } from '../data/v2.ts';
import { AVATAR, hatArt } from '../data/v2.ts';
import { queue, RENDER } from './stage.ts';

/** Head-top to feet in the idle clip, in export px: what "N px tall" is measured against. */
const BODY_H = AVATAR.clips.idle!.foot[1] - AVATAR.clips.idle!.head![0]![0]!;
/** Room around each clip cell for hair and hats, in export px. */
const PAD_X = 34, PAD_TOP = 64;

export type ClipName = 'idle' | 'walk' | 'walk-back' | 'attack' | 'hit' | 'cheer' | 'nod' | 'victory' | 'defeat';
export const OVERWORLD_CLIPS: ClipName[] = ['idle', 'walk', 'walk-back'];
export const BATTLE_CLIPS: ClipName[] = ['idle', 'attack', 'hit', 'victory', 'defeat'];
const LOOPS: Partial<Record<ClipName, number>> = { idle: 8, walk: 14, 'walk-back': 14 };

const clipOf = (name: ClipName): Clip => AVATAR.clips[name]!;
const viewOf = (name: ClipName) => clipOf(name).view ?? 'front';

/** The hairstyle actually drawn: covering hats swap it for the neat under-hat cut. */
const hairFor = (look: Look, hat: HatArt | undefined) => (hat?.hairRule === 'swap' ? AVATAR.neat : look.hair);
function layersFor(look: Look, hat: HatArt | undefined, view: 'front' | 'back'): { kind: string; l: Layer }[] {
  const L = AVATAR.layers[view];
  const hair = hairFor(look, hat);
  const pick = (kind: string, i: number) => (L[kind] ?? []).filter((l) => l.i === i).map((l) => ({ kind, l }));
  return [...pick('hair-back', hair), ...(view === 'front' ? [...pick('face', look.face), ...pick('iris', look.face)] : []), ...pick('hair-front', hair)];
}

/** Images a look needs for these clips. Queue them, then bake once they have loaded. */
export function avatarSources(look: Look, hatId: string | null, clips: readonly ClipName[]): string[] {
  const hat = hatArt(hatId);
  const out = new Set<string>();
  for (const c of clips) {
    out.add(clipOf(c).image);
    const view = viewOf(c);
    for (const { l } of layersFor(look, hat, view)) out.add(l.image);
    if (hat) out.add(hat.views[view].image);
  }
  return [...out];
}
export function queueAvatar(scene: Phaser.Scene, look: Look, hatId: string | null, clips: readonly ClipName[]): string[] {
  return avatarSources(look, hatId, clips).map((rel) => queue(scene, rel));
}

const lookKey = (look: Look, hatId: string | null) => `${look.skin}.${look.eyes}.${look.hair}.${look.hairColour}.${look.face}.${look.costume}.${hatId ?? '-'}`;
const texKey = (look: Look, hatId: string | null, clip: ClipName, tall: number) => `av:${lookKey(look, hatId)}:${clip}:${tall}`;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  return [c, g];
}
/** A coloured copy of a small layer (hair tint, eye colour, skin tone). */
function colour(scene: Phaser.Scene, kind: string, l: Layer, look: Look): CanvasImageSource {
  const src = scene.textures.get(l.image).getSourceImage() as HTMLImageElement;
  if (kind === 'iris' || kind === 'hair-front' || kind === 'hair-back' || kind === 'face') {
    const [c, g] = canvas(src.width, src.height);
    g.drawImage(src, 0, 0);
    const im = g.getImageData(0, 0, c.width, c.height);
    if (kind === 'iris') fill(im.data, hexRgb(AVATAR.eyes[look.eyes]!.hex));
    else if (kind === 'face') reskin(im.data, hexRgb(AVATAR.skin[look.skin]!), AVATAR.skinBase);
    else tint(im.data, hexRgb(AVATAR.hairColours[look.hairColour]!.hex), AVATAR.hairTintBase);
    g.putImageData(im, 0, 0);
    return c;
  }
  return src;
}

/**
 * Bake one clip of a look at `tall` stage px (head-top to feet) and return its texture key. Every
 * image from `avatarSources` must be loaded. Baked textures are cached under their key.
 */
export function bakeAvatar(scene: Phaser.Scene, look: Look, hatId: string | null, clip: ClipName, tall: number): string {
  const key = texKey(look, hatId, clip, tall);
  if (scene.textures.exists(key)) return key;
  const C = clipOf(clip), view = viewOf(clip), T = AVATAR.templates[view];
  const hat = hatArt(hatId);
  const k = (tall * RENDER) / BODY_H; // export px → baked px
  const [cw, ch] = C.cell;
  const cellW = Math.ceil((cw + 2 * PAD_X) * k), cellH = Math.ceil((ch + PAD_TOP) * k);
  const rows = Math.ceil(C.frames / C.cols);

  // 1. The body sheet at the baked size, recoloured: skin tone and costume colour set.
  const sheet = scene.textures.get(C.image).getSourceImage() as HTMLImageElement;
  const bw = Math.round(cw * k), bh = Math.round(ch * k);
  const [body, bg] = canvas(bw * C.cols, bh * rows);
  bg.drawImage(sheet, 0, 0, bw * C.cols, bh * rows);
  const set = AVATAR.costume.sets[look.costume] ?? null;
  const im = bg.getImageData(0, 0, body.width, body.height);
  // Above the neck (head top + 1.15 × head width, per frame) only skin changes colour.
  const necks = C.head!.map(([top, , w]) => (top! + AVATAR.costume.neck * w!) * k);
  paintBody(im.data, body.width, body.height, {
    skin: hexRgb(AVATAR.skin[look.skin]!), skinBase: AVATAR.skinBase, set: set && Object.keys(set.map).length ? set : null, spec: AVATAR.costume,
    protectAbove: (x, y) => { const f = Math.floor(y / bh) * C.cols + Math.floor(x / bw); return y % bh < (necks[f] ?? 0); },
  });
  bg.putImageData(im, 0, 0);

  // 2. Each frame: hair behind, body, face, hair in front, hat — placed from the head track.
  const layers = layersFor(look, hat, view).map(({ kind, l }) => ({ kind, l, img: colour(scene, kind, l, look) }));
  const hatView = hat?.views[view];
  const hatImg = hatView ? (scene.textures.get(hatView.image).getSourceImage() as HTMLImageElement) : null;
  // The halo floats above tall hair: lift it by 0.9 × how far the hair rises over the head.
  const hairTop = Math.min(T.top, ...layers.filter((x) => x.kind === 'hair-front').map((x) => x.l.off[1]));
  const lift = hat?.kind === 'halo' ? 0.9 * (T.top - hairTop) : 0;
  const [out, g] = canvas(cellW * C.cols, cellH * rows);
  for (let f = 0; f < C.frames; f++) {
    const [top, cx, w] = C.head![f] as [number, number, number];
    const s = w / T.w; // head-template px → export px
    const ox = (f % C.cols) * cellW + PAD_X * k, oy = Math.floor(f / C.cols) * cellH + PAD_TOP * k;
    const hx = cx - T.cx * s, hy = top - T.top * s; // where the template's corner sits in the cell
    const put = (img: CanvasImageSource, off: [number, number], w0: number, h0: number, dy = 0) => g.drawImage(img, ox + (hx + off[0] * s) * k, oy + (hy + (off[1] - dy) * s) * k, w0 * s * k, h0 * s * k);
    g.save();
    g.beginPath();
    g.rect((f % C.cols) * cellW, Math.floor(f / C.cols) * cellH, cellW, cellH);
    g.clip(); // nothing spills into the next cell
    for (const x of layers) if (x.kind === 'hair-back') put(x.img, x.l.off, x.l.w, x.l.h);
    g.drawImage(body, (f % C.cols) * bw, Math.floor(f / C.cols) * bh, bw, bh, ox, oy, bw, bh);
    for (const x of layers) if (x.kind !== 'hair-back') put(x.img, x.l.off, x.l.w, x.l.h);
    if (hatView && hatImg) put(hatImg, hatView.off, hatView.w, hatView.h, lift);
    g.restore();
  }
  const tex = scene.textures.addCanvas(key, out)!;
  for (let f = 0; f < C.frames; f++) tex.add(f, 0, (f % C.cols) * cellW, Math.floor(f / C.cols) * cellH, cellW, cellH);
  const rate = LOOPS[clip];
  scene.anims.create({ key, frames: Array.from({ length: C.frames }, (_, f) => ({ key, frame: f })), frameRate: rate ?? 12, repeat: rate ? -1 : 0 });
  // Where the feet are in a cell, as the sprite's origin.
  tex.customData = { ox: ((C.foot[0] + PAD_X) * k) / cellW, oy: ((C.foot[1] + PAD_TOP) * k) / cellH, head: ((C.head![0]![0]! + PAD_TOP) * k) / RENDER, feet: ((C.foot[1] + PAD_TOP) * k) / RENDER };
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
  show(clip: ClipName, flip = false, restart = false): void {
    const s = this.sprite;
    s.setFlipX(flip);
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
