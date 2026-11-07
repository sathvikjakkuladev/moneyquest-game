import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import manifest from '../assets/manifest.json';
import { ROOMS } from '../data/rooms.ts';
import type { Front } from './fronts.ts';
import { cutFront } from './fronts.ts';
import { standable } from '../data/rooms.ts';

// A 20×10 test screen (stretched to 640×360, so 32×36 per pixel): two grass colours, with a rock
// (black outline, grey inside) in the middle.
const GRASS = [80, 160, 60], LEAF = [90, 170, 70], BLACK = [10, 10, 10], GREY = [130, 130, 140];
function screen(left = 8): Uint8ClampedArray {
  const w = 20, h = 10, px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const inRock = x >= left && x <= left + 4 && y >= 3 && y <= 7;
      const edge = inRock && ((x === left && left > 0) || x === left + 4 || y === 3 || y === 7); // no outline where the screen edge cuts it
      const c = edge ? BLACK : inRock ? GREY : (x + y) % 3 ? GRASS : LEAF;
      px.set([...c, 255], (y * w + x) * 4);
    }
  return px;
}
const rect = (x0: number, y0: number, x1: number, y1: number): Front['poly'] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const sx = 640 / 20, sy = 360 / 10;

describe('fronts (scenery the player walks behind)', () => {
  it('cuts the object out of a loose outline and drops the ground around it', () => {
    const c = cutFront(screen(), 20, 10, { poly: rect(6 * sx, 1 * sy, 15 * sx, 9 * sy), base: 8 * sy });
    expect(c.kept).toBe(25); // the 5×5 rock, outline included
    const at = (x: number, y: number) => c.rgba[((y - c.y) * c.w + (x - c.x)) * 4 + 3];
    expect([at(10, 5), at(8, 3), at(7, 5), at(13, 5)]).toEqual([255, 255, 0, 0]);
  });
  it('keep holds every pixel; trim only clears a strip next to the outline', () => {
    const poly = rect(6 * sx, 1 * sy, 15 * sx, 9 * sy);
    expect(cutFront(screen(), 20, 10, { poly, base: 0, keep: true }).kept).toBe(9 * 8);
    expect(cutFront(screen(), 20, 10, { poly, base: 0, trim: 1 }).kept).toBe(9 * 8 - (9 * 2 + 6 * 2));
  });
  it('an outline along the screen edge keeps what the edge cuts off', () => {
    // The rock's grey touches the left edge: if the edge seeded the fill, the grey would count as ground.
    expect(cutFront(screen(0), 20, 10, { poly: rect(0, 1 * sy, 7 * sx, 9 * sy), base: 0 }).kept).toBe(25);
  });

  const rooms = Object.values(ROOMS).flatMap((r) => Object.entries(r.screens).map(([name, s]) => ({ zone: r.zone, name, s })));
  it('every screen has fronts, and each one is a sensible outline with its base below its top', () => {
    for (const { zone, name, s } of rooms) {
      expect(s.fronts?.length, `${zone}/${name}`).toBeGreaterThan(0);
      for (const f of s.fronts!) {
        const ys = f.poly.map((p) => p[1]);
        expect(f.poly.length).toBeGreaterThanOrEqual(3);
        expect(f.poly.every(([x, y]) => x >= 0 && x <= 640 && y >= 0 && y <= 360), `${zone}/${name}`).toBe(true);
        expect(f.base, `${zone}/${name} base`).toBeGreaterThanOrEqual(Math.min(...ys));
        expect(f.base, `${zone}/${name} base`).toBeLessThanOrEqual(360); // overhead parts (arches) sit above their base
      }
    }
  });
  it('every front keeps part of its screen art', async () => {
    const locs = (manifest as unknown as { locations: Record<string, { screens: Record<string, { image: string }> }> }).locations;
    for (const { zone, name, s } of rooms) {
      const file = new URL(`../../public/assets/${locs[zone]!.screens[name]!.image}`, import.meta.url);
      const { data, info } = await sharp(readFileSync(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      s.fronts!.forEach((f, i) => expect(cutFront(new Uint8ClampedArray(data), info.width, info.height, f).kept, `${zone}/${name} front ${i}`).toBeGreaterThan(20));
    }
  });
  it('blocks never cut off an exit, entry, NPC, monster or portal (flood fill from the entries)', () => {
    const S = 4, W = 640 / S + 1, H = 360 / S + 1;
    for (const { zone, name, s } of rooms) {
      const ok = (gx: number, gy: number) => standable(s, [gx * S, gy * S]);
      const seen = new Uint8Array(W * H);
      const queue: number[] = [];
      for (const [x, y] of Object.values(s.entries)) {
        const g = Math.round(y / S) * W + Math.round(x / S);
        if (ok(g % W, Math.floor(g / W))) (seen[g] = 1), queue.push(g);
      }
      for (let i = 0; i < queue.length; i++) {
        const c = queue[i]!, x = c % W, y = (c - x) / W;
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
          const j = ny * W + nx;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && !seen[j] && ok(nx, ny)) (seen[j] = 1), queue.push(j);
        }
      }
      const near = (x: number, y: number, r: number) => queue.some((c) => Math.hypot((c % W) * S - x, (Math.floor(c / W) * S - y) * 1.4) < r);
      const where = `${zone}/${name}`;
      for (const [k, [x, y]] of Object.entries(s.entries)) expect(near(x, y, 6), `${where} entry ${k}`).toBe(true);
      for (const e of s.exits) {
        const m = (e.range[0] + e.range[1]) / 2;
        const [x, y] = e.edge === 'left' ? [8, m] : e.edge === 'right' ? [632, m] : e.edge === 'top' ? [m, 8] : [m, 352];
        expect(near(x, y, 12), `${where} exit ${e.edge}`).toBe(true);
      }
      for (const n of s.npcs) expect(near(n.x, n.y, 50), `${where} ${n.id}`).toBe(true);
      for (const m of s.monsters) expect(near(m.x, m.y, m.id.startsWith('boss') ? 46 : 32), `${where} ${m.id}`).toBe(true);
      for (const p of s.portals ?? []) expect(near(p.at[0], 150, 30), `${where} portal ${p.to}`).toBe(true);
    }
  });
});
