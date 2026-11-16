// Seeds the game-side room files (src/data/rooms/<place>.json) from ../assets_v2: exits, arrival
// points and collision come from the art set (divided by 3 onto the 640×360 stage), and NPCs,
// monsters and the waystone get a first placement. It never overwrites an existing room file
// (those are edited by hand or with the ?dev=1 editor); pass --force to replace one on purpose.
//   node tools/seed-rooms.ts                 every place that has no file yet
//   node tools/seed-rooms.ts frostvault --force
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Poly, Pt } from '../src/core/geometry.ts';
import { canStand } from '../src/core/geometry.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, '..', 'assets_v2', 'locations');
const OUT = join(root, 'src', 'data', 'rooms');
if (!existsSync(SRC)) {
  console.error(`assets_v2 not found at ${SRC}. It sits next to the game folder on Sathvik's Mac and is not in the repo.`);
  process.exit(1);
}
const j = (p: string) => JSON.parse(readFileSync(join(SRC, p), 'utf8'));
const r1 = (n: number) => Math.round(n / 3 * 10) / 10;
const EDGE = { N: 'top', S: 'bottom', E: 'right', W: 'left' } as const;
const FULL: Poly = [[0, 0], [640, 0], [640, 360], [0, 360]];

/** The nearest point to `want` where a character can stand with a little room around it. */
function freeSpot(block: Poly[], want: Pt, room = 12): Pt {
  const ok = ([x, y]: Pt) => x > 30 && x < 610 && y > 70 && y < 330 && [[0, 0], [room, 0], [-room, 0], [0, room * 0.6], [0, -room * 0.6]].every(([dx, dy]) => canStand([x + dx!, y + dy!], [FULL], block));
  for (let d = 0; d < 200; d += 6) for (let a = 0; a < 16; a++) {
    const p: Pt = [Math.round(want[0] + Math.cos((a / 16) * Math.PI * 2) * d), Math.round(want[1] + Math.sin((a / 16) * Math.PI * 2) * d * 0.7)];
    if (ok(p)) return p;
  }
  throw new Error(`no free spot near ${want}`);
}
const monsterId = (species: string, boss = false) => `${boss ? 'boss' : 'mon'}_${species.replace(/-/g, '_')}`;

/** Who stands at each of Ledgerhold's doors. */
const TOWN: Record<string, string> = { 'interior:bank': 'banker', 'interior:battle-arena': 'arena-master', 'interior:wardrobe': 'stylist', 'interior:item-shop': 'shopkeeper', 'ui:quest-board': 'quest-keeper', 'ui:pet-trade': 'pet-trader' };

function seed(place: string): unknown {
  const L = j(`${place}/${place}.json`);
  const screens: Record<string, unknown> = {};
  for (const [id, s] of Object.entries<any>(L.screens)) {
    const E = j(`${place}/${s.folder}/exits.json`);
    const block: Poly[] = (j(`${place}/${s.folder}/collision.json`).blocked as number[][][]).map((p) => p.map(([x, y]) => [r1(x!), r1(y!)] as Pt));
    const props = j(`${place}/${s.folder}/objects.json`).objects as { prop: string; anchor: [number, number] }[];
    const door = (target: RegExp | string) => (E.doors as any[]).find((d) => (typeof target === 'string' ? d.target === target : target.test(d.target)));
    const below = (d: any, dx = 0, dy = 14): Pt => [r1(d.rect[0] + d.rect[2] / 2) + dx, r1(d.rect[1] + d.rect[3]) + dy];
    const npcs: unknown[] = [], monsters: unknown[] = [];
    let waystone: Pt | undefined;

    // The waystone: a marked door in the districts; in Ledgerhold, the runestone on the arrival screen.
    const stone = props.find((p) => p.prop === 'waystone' || (L.teleportArrival.screen === id && p.prop === 'runestone'));
    const way = door('ui:world-map') ?? (stone && { rect: [stone.anchor[0] - 70, stone.anchor[1] - 30, 140, 30] });
    if (way) waystone = [r1(way.rect[0] + way.rect[2] / 2), r1(way.rect[1] + way.rect[3] / 2)];

    if (place === 'ledgerhold') {
      for (const d of E.doors as any[]) {
        const npc = TOWN[d.target];
        if (!npc) continue;
        const [x, y] = freeSpot(block, below(d, npc === 'arena-master' ? 62 : 44));
        npcs.push({ id: npc, sprite: npc, x, y, face: 'south' });
      }
      if (s.name === 'central-plaza') { const [x, y] = freeSpot(block, [392, 236]); npcs.push({ id: 'mentor', sprite: 'mentor', x, y, face: 'south' }); }
      if (door('interior:battle-arena')) { const [x, y] = freeSpot(block, below(door('interior:battle-arena'), 0, 30), 20); monsters.push({ id: 'boss_debt_dragon', x, y }); }
    } else {
      const landmark = door(/^interior:/);
      if (landmark) { const [x, y] = freeSpot(block, below(landmark, 44)); npcs.push({ id: 'guide', sprite: `guide-${place}`, x, y, face: 'south' }); }
      if (s.name === 'wilds') (L.monsters as string[]).forEach((sp, i) => { const [x, y] = freeSpot(block, i ? [440, 205] : [200, 175], 16); monsters.push({ id: monsterId(sp), x, y }); });
      const lair = door(/^battle:/);
      if (lair) { const [x, y] = freeSpot(block, below(lair, 0, 26), 22); monsters.push({ id: monsterId(L.boss, true), x, y }); }
    }
    screens[id] = {
      name: s.name,
      exits: (E.exits as any[]).map((e) => ({ edge: EDGE[e.edge as keyof typeof EDGE], range: [r1(e.band[0]), r1(Math.min(e.band[1], e.axis === 'x' ? 1920 : 1080))], to: e.targetScreen, enterAt: null })),
      entries: {
        default: [r1(E.spawns.default.x), r1(E.spawns.default.y)],
        ...(E.spawns.teleportArrival && L.teleportArrival.screen === id ? { arrival: [r1(E.spawns.teleportArrival.x), r1(E.spawns.teleportArrival.y) + (waystone ? 22 : 0)] } : {}),
        // Where you appear after walking in from each neighbouring screen.
        ...Object.fromEntries(Object.entries<any>(L.screens).flatMap(([from, fs]) => (j(`${place}/${fs.folder}/exits.json`).exits as any[]).filter((e) => e.targetScreen === id).map((e) => [`from_${from}`, [r1(e.spawn.x), r1(e.spawn.y)]]))),
      },
      walk: [FULL],
      block,
      npcs,
      monsters,
      ...(waystone ? { waystone } : {}),
    };
  }
  return { zone: place, start: L.teleportArrival.screen, screens };
}

mkdirSync(OUT, { recursive: true });
const force = process.argv.includes('--force');
const asked = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const places = asked.length ? asked : ['ledgerhold', 'coinfall-docks', 'the-sprawl', 'frostvault', 'credit-citadel', 'compound-rift', 'the-exchange', 'phish-fens'];
for (const place of places) {
  const out = join(OUT, `${place}.json`);
  if (existsSync(out) && !force) { console.log(`${place}: kept (already exists; --force to replace)`); continue; }
  writeFileSync(out, JSON.stringify(seed(place), null, 1) + '\n');
  console.log(`${place}: seeded`);
}
