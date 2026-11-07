// Scenery the player can walk behind. A room's "fronts" are outlines (640×360 coordinates) drawn
// around rocks, signs, trees and so on. The ground inside an outline is removed by a flood fill that
// starts on the outline and spreads through the colours found there (the screens use 22–75 colours,
// and most objects have dark outlines that stop the fill; for ones that don't, `trim` limits it).
// What's left is the object, drawn above anything whose feet are higher up the screen than its base.

import type { Poly } from './geometry.ts';
import { inPoly } from './geometry.ts';

export interface Front {
  poly: Poly;
  /** Feet above this line (640 coordinates) are behind the object; usually the bottom of its block. */
  base: number;
  /** Keep every pixel inside the outline (for outlines traced tight around the object). */
  keep?: boolean;
  /**
   * Let the fill reach at most this many screen-art pixels in from the outline. For objects that
   * share colours with the ground (leaves and grass): trace the outline just outside the object and
   * only the thin strip of ground left inside is removed.
   */
  trim?: number;
  /** Colours darker than this (every channel) are never ground; default 48. Lower it on dark screens whose floor is near-black. */
  dark?: number;
}

const DARK = 48;

export interface Cut {
  /** Source-pixel box of the cut-out. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** RGBA pixels of the box, transparent where there's no object. */
  rgba: Uint8ClampedArray;
  /** How many pixels of the object were kept. */
  kept: number;
}

/**
 * Cut one front out of a screen image (RGBA, `w`×`h` source pixels; the room is drawn at
 * 640/`w` scale). Outline edges along the screen border don't seed the fill, so objects cut off by
 * the edge keep their pixels.
 * Outlines must enclose the object with a little ground around it: where an outline cuts through an
 * object, the object's colours count as ground and get eaten.
 */
export function cutFront(src: Uint8ClampedArray, w: number, h: number, f: Front): Cut {
  const sx = 640 / w, sy = 360 / h;
  const xs = f.poly.map((p) => p[0] / sx), ys = f.poly.map((p) => p[1] / sy);
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(w, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(h, Math.ceil(Math.max(...ys)));
  const bw = Math.max(0, x1 - x0), bh = Math.max(0, y1 - y0);
  const inside = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) inside[y * bw + x] = inPoly([(x0 + x + 0.5) * sx, (y0 + y + 0.5) * sy], f.poly) ? 1 : 0;

  const colour = (x: number, y: number) => {
    const i = ((y0 + y) * w + x0 + x) * 4;
    return (src[i]! << 16) | (src[i + 1]! << 8) | src[i + 2]!;
  };
  const isInside = (x: number, y: number) => x >= 0 && y >= 0 && x < bw && y < bh && inside[y * bw + x] === 1;
  const onBorder = (x: number, y: number) => x0 + x === 0 || y0 + y === 0 || x0 + x === w - 1 || y0 + y === h - 1;

  // Near-black never counts as ground: it's the objects' outline (and the void past the world's edge).
  const lim = f.dark ?? DARK;
  const dark = (c: number) => (c >> 16) < lim && ((c >> 8) & 255) < lim && (c & 255) < lim;
  const removed = new Uint8Array(bw * bh);
  if (!f.keep) {
    // Seeds: inside pixels next to the outline (not next to the screen edge).
    const seeds: number[] = [];
    const palette = new Set<number>();
    for (let y = 0; y < bh; y++)
      for (let x = 0; x < bw; x++) {
        if (!isInside(x, y) || onBorder(x, y)) continue;
        const rim = !isInside(x - 1, y) || !isInside(x + 1, y) || !isInside(x, y - 1) || !isInside(x, y + 1);
        if (rim && !dark(colour(x, y))) {
          seeds.push(y * bw + x);
          palette.add(colour(x, y));
        }
      }
    const depth = new Uint16Array(bw * bh);
    const queue = seeds.slice();
    for (const s of seeds) (removed[s] = 1), (depth[s] = 1);
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q]!;
      if (f.trim !== undefined && depth[i]! >= f.trim) continue;
      const x = i % bw, y = (i - x) / bw;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
        if (!isInside(nx, ny)) continue;
        const j = ny * bw + nx;
        if (removed[j] || !palette.has(colour(nx, ny))) continue;
        removed[j] = 1;
        depth[j] = depth[i]! + 1;
        queue.push(j);
      }
    }
  }

  const rgba = new Uint8ClampedArray(bw * bh * 4);
  let kept = 0;
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const i = y * bw + x;
      if (!inside[i] || removed[i]) continue;
      const s = ((y0 + y) * w + x0 + x) * 4;
      rgba.set(src.subarray(s, s + 4), i * 4);
      kept++;
    }
  return { x: x0, y: y0, w: bw, h: bh, rgba, kept };
}

