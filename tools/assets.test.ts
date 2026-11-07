import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Img } from './lib/img.ts';
import { alphaBox, flipX, pack, padBottomCenter, pixelize } from './lib/img.ts';

const solid = (w: number, h: number, rgba = [200, 100, 50, 255]): Img => {
  const data = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(rgba, i * 4);
  return { w, h, data };
};

describe('image helpers', () => {
  it('pixelize trims, fits the box, and leaves only hard alpha', async () => {
    const img = solid(100, 50);
    const big = { w: 120, h: 70, data: Buffer.alloc(120 * 70 * 4) };
    for (let y = 0; y < 50; y++) img.data.copy(big.data, ((y + 10) * 120 + 10) * 4, y * 400, (y + 1) * 400);
    const out = await pixelize(big, 40, 40);
    expect(out.w).toBe(40);
    expect(out.h).toBe(20);
    const alphas = new Set<number>();
    for (let i = 3; i < out.data.length; i += 4) alphas.add(out.data[i]!);
    expect([...alphas].every((a) => a === 0 || a === 255)).toBe(true);
  });
  it('flipX mirrors and padBottomCenter anchors to the bottom middle', () => {
    const img = solid(2, 1);
    img.data.set([1, 2, 3, 255], 0);
    expect([...flipX(img).data.subarray(4, 8)]).toEqual([1, 2, 3, 255]);
    const padded = padBottomCenter(solid(2, 2), 6, 5);
    expect(alphaBox(padded)).toEqual({ x: 2, y: 3, w: 2, h: 2 });
  });
  it('pack places frames without overlap and with a gap', () => {
    const items = [{ name: 'a', img: solid(10, 10) }, { name: 'b', img: solid(20, 5) }, { name: 'c', img: solid(30, 8) }];
    const p = pack(items, 40);
    for (const a of p.placed)
      for (const b of p.placed)
        if (a !== b) expect(a.x + a.img.w <= b.x || b.x + b.img.w <= a.x || a.y + a.img.h <= b.y || b.y + b.img.h <= a.y).toBe(true);
    expect(p.placed.every((q) => q.x >= 1 && q.y >= 1 && q.x + q.img.w < p.w && q.y + q.img.h < p.h)).toBe(true);
  });
});

const manifestUrl = new URL('../src/assets/manifest.json', import.meta.url);
describe.skipIf(!existsSync(manifestUrl))('generated manifest (run npm run import:assets first)', () => {
  const m = JSON.parse(readFileSync(manifestUrl, 'utf8'));
  const pub = (p: string) => new URL(`../public/assets/${p}`, import.meta.url);
  it('has all 11 locations, 40 monsters, the player and the mentor', () => {
    expect(Object.keys(m.locations)).toHaveLength(11);
    expect(Object.keys(m.monsters)).toHaveLength(40);
    expect(m.characters.player_coin_wizard.anims.walk.east).toHaveLength(6);
    expect(m.characters.mentor_piggybank_village).toBeTruthy();
  });
  it('every screen, battle background and sheet file exists', () => {
    for (const [zone, loc] of Object.entries<{ battleBg: string | null; screens: Record<string, { image: string }> }>(m.locations)) {
      for (const s of Object.values(loc.screens)) expect(existsSync(pub(s.image)), s.image).toBe(true);
      if (zone !== 'coin_academy') expect(loc.battleBg && existsSync(pub(loc.battleBg)), zone).toBeTruthy();
    }
    for (const mon of Object.values<{ image: string; json: string }>(m.monsters)) expect(existsSync(pub(mon.image)) && existsSync(pub(mon.json))).toBe(true);
  });
  it('the reward prizes have art: Bull Calf walk cycle and Laurel Wreath icon', () => {
    expect(m.v1px.pet_bull_calf_walk.anims.left.frames).toHaveLength(4);
    expect(existsSync(pub(m.v1px.laurel_icon.image))).toBe(true);
  });
});
