// Seeds the game-side room files (src/data/rooms/<zone>.json) from the pack's rooms.json, adding a
// first pass of collision and NPC/monster placements. It never overwrites an existing room file
// (those are edited by hand or with the ?dev=1 editor); pass --force to replace one on purpose.
//   node tools/seed-rooms.ts piggybank_village coin_academy

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Pt = [number, number];
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACK = join(root, '..', 'MoneyQuest Assets', 'locations');
const R = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

/** First-pass collision drawn from the screen art (640×360). walk = where feet can go; block = props inside it. */
const COLLISION: Record<string, Record<string, { walk: Pt[][]; block: Pt[][] }>> = {
  coin_academy: {
    great_hall: { walk: [R(105, 105, 430, 228), R(292, 0, 66, 110), R(260, 330, 120, 30)], block: [R(100, 110, 70, 178), R(492, 135, 50, 150)] },
    library: { walk: [R(112, 150, 430, 192), R(220, 340, 140, 20)], block: [R(530, 140, 20, 190)] },
  },
  piggybank_village: {
    gate: { walk: [R(55, 0, 530, 360)], block: [R(55, 0, 80, 105), R(505, 0, 80, 105), R(55, 205, 95, 100), R(490, 205, 95, 95), R(415, 270, 105, 50), R(220, 235, 22, 95), R(338, 235, 22, 95), R(170, 250, 50, 45), R(365, 270, 25, 45), R(130, 255, 35, 45)] },
    plaza: { walk: [R(0, 0, 640, 360)], block: [R(200, 0, 240, 112), R(55, 0, 80, 100), R(525, 0, 80, 100), R(30, 205, 105, 100), R(575, 185, 65, 105), R(465, 285, 175, 75), R(0, 305, 65, 55)] },
    market: { walk: [R(0, 100, 640, 260)], block: [R(0, 100, 80, 20), R(545, 100, 95, 35), R(580, 155, 60, 150), R(0, 235, 80, 125), R(88, 318, 125, 42), R(288, 318, 145, 42), R(540, 325, 100, 35)] },
    cottages: { walk: [R(150, 120, 350, 215), R(390, 40, 250, 70), R(390, 100, 110, 30)], block: [] },
  },
};

/** NPC and monster spots. rooms.json describes some only in words, so these are placed by hand (noted in PLAN.md). */
const PLACES: Record<string, Record<string, { npcs?: { id: string; sprite: string; x: number; y: number; face: string }[]; monsters?: { id: string; x: number; y: number }[] }>> = {
  coin_academy: {
    great_hall: { npcs: [{ id: 'merchant', sprite: 'merchant', x: 195, y: 215, face: 'west' }] },
    library: { npcs: [{ id: 'headmaster', sprite: 'headmaster', x: 450, y: 180, face: 'south' }] },
  },
  piggybank_village: {
    market: { npcs: [{ id: 'shopkeeper', sprite: 'merchant', x: 372, y: 118, face: 'south' }], monsters: [{ id: 'mon_spendling', x: 320, y: 260 }, { id: 'mon_jar_muncher', x: 480, y: 230 }] },
    cottages: { npcs: [{ id: 'mentor', sprite: 'mentor_piggybank_village', x: 205, y: 165, face: 'south' }], monsters: [{ id: 'mon_impulse_magpie', x: 400, y: 285 }] },
    gate: { monsters: [{ id: 'boss_king_splurge', x: 470, y: 175 }] },
  },
};

const force = process.argv.includes('--force');
for (const zone of process.argv.slice(2).filter((a) => !a.startsWith('--'))) {
  const out = join(root, 'src', 'data', 'rooms', `${zone}.json`);
  if (existsSync(out) && !force) {
    console.log(`skip ${zone}: ${out} exists (use --force to replace it)`);
    continue;
  }
  const pack = JSON.parse(readFileSync(join(PACK, zone, 'rooms.json'), 'utf8'));
  const screens: Record<string, unknown> = {};
  for (const [name, s] of Object.entries<{ exits: { edge: string; range: Pt; to: string; enter_at: Pt | null }[]; entries?: Record<string, Pt>; portals?: unknown }>(pack.screens)) {
    const col = COLLISION[zone]?.[name] ?? { walk: [R(0, 0, 640, 360)], block: [] };
    const pl = PLACES[zone]?.[name] ?? {};
    screens[name] = {
      exits: s.exits.map((e) => ({ edge: e.edge, range: e.range, to: e.to, enterAt: e.enter_at })),
      entries: s.entries ?? {},
      walk: col.walk,
      block: col.block,
      npcs: pl.npcs ?? [],
      monsters: pl.monsters ?? [],
      ...(s.portals ? { portals: s.portals } : {}),
    };
  }
  writeFileSync(out, JSON.stringify({ note: 'Game-side room layout (640×360). Edit here or with the ?dev=1 map editor; never in the asset pack.', zone, start: pack.start, screens }, null, 1) + '\n');
  console.log(`wrote ${zone}`);
}
