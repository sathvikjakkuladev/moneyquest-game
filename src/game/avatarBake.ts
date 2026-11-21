// Baking the layered avatar (PLAN.md §12; ported from docs/assets_v2/overlay.py and fit2.py).
//
// A look is baked into one sprite sheet per clip: each of the clip's 16 body frames is recoloured
// (skin tone, costume colour set), then hair, face and hat are drawn on it, placed from the clip's
// per-frame head track. This file only needs a canvas, so the game scenes (avatar.ts) and the
// React previews (ui/AvatarView.tsx) share it.
import type { Look } from '../core/look.ts';
import { fill, hexRgb, paintBody, reskin, tint } from '../core/recolor.ts';
import type { Clip, HatArt, Layer } from '../data/v2.ts';
import { AVATAR, hatArt } from '../data/v2.ts';
import { RENDER } from './stage.ts';

/** Head-top to feet in the idle clip, in export px: what "N px tall" is measured against. */
const BODY_H = AVATAR.clips.idle!.foot[1] - AVATAR.clips.idle!.head![0]![0]!;
/** Room around each clip cell for hair and hats, in export px. */
const PAD_X = 34, PAD_TOP = 64;

export type ClipName = 'idle' | 'walk' | 'walk-back' | 'attack' | 'hit' | 'cheer' | 'nod' | 'victory' | 'defeat';
export const OVERWORLD_CLIPS: ClipName[] = ['idle', 'walk', 'walk-back'];
export const BATTLE_CLIPS: ClipName[] = ['idle', 'attack', 'hit', 'victory', 'defeat'];
// The walk clips pack about six steps into 16 frames, so they play slowly to keep the steps calm.
const LOOPS: Partial<Record<ClipName, number>> = { idle: 8, walk: 9, 'walk-back': 9 };

// The walk clips were cut from generated video, so the body drifts sideways, hops up and down out
// of step and pauses at the start. Baking steadies them: each frame is moved so the head stays on one
// line (the back walk: the body, which sways more than the head) and the planted foot stays on the
// ground, a small even bob replaces the random one, and the near-still frames at the ends of the
// walk are left out of the loop.
const STEADY: Partial<Record<ClipName, { order: number[]; bob: number; body?: boolean }>> = {
  walk: { order: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], bob: 0.012 },
  'walk-back': { order: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], bob: 0.01, body: true },
};
/** The frames a clip plays, in order. */
export const clipOrder = (clip: ClipName): number[] => STEADY[clip]?.order ?? Array.from({ length: clipOf(clip).frames }, (_, i) => i);

export const clipOf = (name: ClipName): Clip => AVATAR.clips[name]!;
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
export const lookKey = (look: Look, hatId: string | null) => `${look.skin}.${look.eyes}.${look.hair}.${look.hairColour}.${look.face}.${look.costume}.${hatId ?? '-'}`;

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
function colour(get: Get, kind: string, l: Layer, look: Look): CanvasImageSource {
  const src = get(l.image);
  if (kind === 'iris' || kind === 'hair-front' || kind === 'hair-back' || kind === 'face') {
    const [c, g] = canvas(src.width, src.height);
    g.drawImage(src, 0, 0);
    const im = g.getImageData(0, 0, c.width, c.height);
    if (kind === 'iris') fill(im.data, hexRgb(AVATAR.eyes[look.eyes]!.hex));
    else if (kind === 'face') reskin(im.data, hexRgb(AVATAR.skin[look.skin]!), AVATAR.skinBase);
    else tint(im.data, hexRgb(AVATAR.hairColours[look.hairColour]!.hex), AVATAR.hairTintBase);
    // The hair was split into front and back pieces along a straight line, and both edges of that
    // cut are soft, so a see-through line showed beside the face. The back piece's cut edge is made
    // solid here, and it's drawn 2 px higher (below) so it tucks under the front piece.
    if (kind === 'hair-back') {
      const w = c.width, d = im.data;
      for (let y = 0; y < 3; y++) for (let x = 0; x < w; x++) d[(y * w + x) * 4 + 3] = Math.max(d[(y * w + x) * 4 + 3]!, d[(3 * w + x) * 4 + 3]!);
      for (let y = 0; y < 3; y++) for (let x = 0; x < w; x++) if (d[(3 * w + x) * 4 + 3]! > 0) for (let ch = 0; ch < 3; ch++) d[(y * w + x) * 4 + ch] = d[(3 * w + x) * 4 + ch]!;
    }
    g.putImageData(im, 0, 0);
    return c;
  }
  return src;
}

/** How a loaded image is fetched: Phaser's texture manager in the game, an image cache in React. */
export type Get = (rel: string) => HTMLImageElement | HTMLCanvasElement;
export interface Baked { canvas: HTMLCanvasElement; cellW: number; cellH: number; cols: number; frames: number; /** The frames to play, in order. */ order: number[]; /** The feet, as a fraction of a cell. */ ox: number; oy: number }

/**
 * Bake one clip of a look at `tall` stage px (head-top to feet). Every image from `avatarSources`
 * must be loaded. The sheet is drawn at RENDER× (canvas px).
 */
export function bakeSheet(get: Get, look: Look, hatId: string | null, clip: ClipName, tall: number): Baked {
  const C = clipOf(clip), view = viewOf(clip), T = AVATAR.templates[view];
  const hat = hatArt(hatId);
  const k = (tall * RENDER) / BODY_H; // export px → baked px
  const [cw, ch] = C.cell;
  const cellW = Math.ceil((cw + 2 * PAD_X) * k), cellH = Math.ceil((ch + PAD_TOP) * k);
  const rows = Math.ceil(C.frames / C.cols);

  // 1. The body sheet at the baked size, recoloured: skin tone and costume colour set.
  const sheet = get(C.image);
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
  // The bald head under the hair has a teal rim light that peeked out beside the ears: inside each
  // frame's head box, teal pixels blend into the dark outline colour.
  for (let f = 0; f < C.frames; f++) {
    const [top, cx, w] = C.head![f] as [number, number, number];
    const x0 = (f % C.cols) * bw, y0 = Math.floor(f / C.cols) * bh;
    const xa = Math.max(0, Math.floor((cx - 0.62 * w) * k)), xb = Math.min(bw, Math.ceil((cx + 0.62 * w) * k));
    const ya = Math.max(0, Math.floor((top - 0.1 * w) * k)), yb = Math.min(bh, Math.ceil((top + 0.98 * w) * k));
    for (let y = ya; y < yb; y++)
      for (let x = xa; x < xb; x++) {
        const i = ((y0 + y) * body.width + x0 + x) * 4, d = im.data;
        if (!d[i + 3]) continue;
        const t = Math.min(1, Math.max(0, (Math.min(d[i + 1]!, d[i + 2]!) - d[i]! - 12) / 50)); // how teal it is
        if (t > 0) (d[i] = d[i]! + (29 - d[i]!) * t), (d[i + 1] = d[i + 1]! + (21 - d[i + 1]!) * t), (d[i + 2] = d[i + 2]! + (48 - d[i + 2]!) * t);
      }
  }
  bg.putImageData(im, 0, 0);

  // Steadying (see STEADY): where each frame's planted foot is, from the lowest solid row.
  const steady = STEADY[clip];
  const ground = C.foot[1] * k;
  const lowest = (f: number) => {
    const x0 = (f % C.cols) * bw, y0 = Math.floor(f / C.cols) * bh;
    for (let y = bh - 1; y >= 0; y--) for (let x = 0; x < bw; x += 2) if (im.data[((y0 + y) * body.width + x0 + x) * 4 + 3]! > 160) return y;
    return ground;
  };
  // The line each frame is held to: the head's centre, or the body's (mid-height rows of the art).
  const middle = (f: number) => {
    if (!steady?.body) return C.head![f]![1]! * k;
    const x0 = (f % C.cols) * bw, y0 = Math.floor(f / C.cols) * bh;
    let sum = 0, n = 0;
    for (let y = Math.floor(bh * 0.45); y < bh * 0.7; y += 2) for (let x = 0; x < bw; x++) if (im.data[((y0 + y) * body.width + x0 + x) * 4 + 3]! > 160) (sum += x), n++;
    return n ? sum / n : C.head![f]![1]! * k;
  };
  const mids = steady ? Array.from({ length: C.frames }, (_, f) => middle(f)) : [];
  const midCx = [...mids].sort((a, b) => a - b)[Math.floor(mids.length / 2)] ?? 0;
  const shift = (f: number): [number, number] => {
    if (!steady) return [0, 0];
    const i = steady.order.indexOf(f);
    const bob = i < 0 ? 0 : -steady.bob * BODY_H * k * (0.5 - 0.5 * Math.cos((12 * Math.PI * i) / steady.order.length)); // six steps per loop
    return [midCx - mids[f]!, ground - lowest(f) + bob];
  };

  // 2. Each frame: hair behind, body, face, hair in front, hat — placed from the head track.
  const layers = layersFor(look, hat, view).map(({ kind, l }) => ({ kind, l, img: colour(get, kind, l, look) }));
  const hatView = hat?.views[view];
  const hatImg = hatView ? get(hatView.image) : null;
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
    const [sx, sy] = shift(f);
    g.translate(sx, sy);
    for (const x of layers) if (x.kind === 'hair-back') put(x.img, x.l.off, x.l.w, x.l.h, 2);
    g.drawImage(body, (f % C.cols) * bw, Math.floor(f / C.cols) * bh, bw, bh, ox, oy, bw, bh);
    for (const x of layers) if (x.kind !== 'hair-back') put(x.img, x.l.off, x.l.w, x.l.h);
    if (hatView && hatImg) put(hatImg, hatView.off, hatView.w, hatView.h, lift);
    g.restore();
  }
  return { canvas: out, cellW, cellH, cols: C.cols, frames: C.frames, order: clipOrder(clip), ox: ((C.foot[0] + PAD_X) * k) / cellW, oy: ((C.foot[1] + PAD_TOP) * k) / cellH };
}

/** Frame rate of each clip: the looping ones, and the one-shot ones. */
export const clipRate = (clip: ClipName) => ({ rate: LOOPS[clip] ?? 12, loop: clip in LOOPS });
