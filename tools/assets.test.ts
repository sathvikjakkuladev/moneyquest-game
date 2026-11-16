import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../', import.meta.url);
const v2 = JSON.parse(readFileSync(new URL('src/assets/v2.json', root), 'utf8')) as { basePath: string; totalBytes: number; files: Record<string, { w: number; h: number; bytes: number }> };
const entries = Object.entries(v2.files);
const MB = 1e6;

describe('the exported art (src/assets/v2.json)', () => {
  it('lists only files that are in public/, with the size it says', () => {
    expect(entries.length).toBeGreaterThan(900);
    for (const [rel, f] of entries) {
      const url = new URL(`public/${v2.basePath}${rel}`, root);
      expect(existsSync(url), rel).toBe(true);
      expect(statSync(url).size, rel).toBe(f.bytes);
      expect(f.w > 0 && f.h > 0, rel).toBe(true);
    }
  });
  it('is WebP only, and never ships masters, clips as video or review sheets', () => {
    for (const [rel] of entries) expect(rel, rel).toMatch(/^(loc|props|map|battle|mon|boss|npc|avatar|vfx)\/[a-z0-9@/_-]+\.webp$/);
  });
  it('stays inside the budgets: under 40 MB in all, under 10 MB before the hub shows', () => {
    const total = entries.reduce((n, [, f]) => n + f.bytes, 0);
    expect(total).toBe(v2.totalBytes);
    expect(total).toBeLessThan(34 * MB); // leaves room for the code, fonts and sounds inside 40 MB
    // What the title, the character creator and Ledgerhold can ask for: the hub, the avatar, NPCs, the map.
    const first = entries.filter(([p]) => /^(loc\/ledgerhold|props\/ledgerhold|avatar|map|npc)\//.test(p)).reduce((n, [, f]) => n + f.bytes, 0);
    expect(first).toBeLessThan(8 * MB);
    // No single file is big enough to stall a school connection.
    for (const [rel, f] of entries) expect(f.bytes, rel).toBeLessThan(1.2 * MB);
  });
  it('draws screens at the canvas size and keeps every sheet a whole number of cells', () => {
    for (const [rel, f] of entries) if (/^(loc|battle|map)\//.test(rel)) expect([f.w, f.h], rel).toEqual([1280, 720]);
    const avatar = JSON.parse(readFileSync(new URL('src/data/v2/avatar.json', root), 'utf8')) as { clips: Record<string, { image: string; cell: [number, number]; cols: number; frames: number }> };
    for (const c of Object.values(avatar.clips)) expect([v2.files[c.image]!.w, v2.files[c.image]!.h], c.image).toEqual([c.cell[0] * c.cols, c.cell[1] * Math.ceil(c.frames / c.cols)]);
  });
});
