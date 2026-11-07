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
  borrowers_bridges: {
    docks: { walk: [R(65, 85, 520, 190), R(245, 0, 60, 360)], block: [R(85, 105, 45, 40), R(500, 105, 50, 40), R(85, 215, 45, 40), R(500, 215, 45, 40), R(220, 80, 22, 40), R(315, 210, 22, 45)] },
    bridge: { walk: [R(0, 0, 640, 95), R(232, 40, 98, 270), R(0, 282, 640, 78)], block: [R(220, 25, 35, 55), R(330, 25, 30, 55), R(330, 250, 30, 50), R(590, 282, 50, 50)] },
    toll: { walk: [R(85, 100, 475, 145), R(85, 245, 245, 60), R(235, 300, 75, 60)], block: [R(212, 30, 115, 95), R(150, 80, 75, 45), R(318, 148, 16, 55), R(525, 90, 32, 70), R(448, 100, 74, 50)] },
  },
  guildworks: {
    lemonade_lane: { walk: [R(100, 0, 455, 360), R(0, 180, 640, 60)], block: [R(145, 0, 90, 180), R(395, 245, 120, 115), R(135, 250, 55, 50), R(500, 175, 60, 50)] },
    workshop_square: { walk: [R(0, 0, 640, 360)], block: [R(240, 100, 90, 100), R(0, 0, 80, 70), R(440, 235, 40, 30), R(400, 30, 80, 80), R(35, 205, 45, 45), R(395, 225, 40, 45), R(140, 30, 60, 70), R(0, 85, 30, 135), R(585, 175, 55, 155), R(0, 290, 150, 70), R(595, 20, 45, 120)] },
    bakery_smithy: { walk: [R(60, 150, 520, 160), R(255, 300, 80, 60)], block: [R(85, 125, 50, 55), R(505, 100, 70, 60)] },
  },
  compound_orchard: {
    orchard_gate: { walk: [R(150, 0, 345, 360)], block: [R(230, 215, 30, 145), R(375, 215, 30, 145)] },
    sapling_rows: { walk: [R(130, 125, 375, 165), R(255, 0, 100, 125), R(255, 290, 100, 70)], block: [R(400, 225, 95, 50)] },
    great_tree: { walk: [[[140, 170], [175, 130], [420, 130], [460, 170], [420, 235], [335, 245], [335, 360], [255, 360], [255, 245], [175, 235]]], block: [R(250, 100, 90, 50), R(345, 225, 40, 60)] },
  },
  stormwatch_coast: {
    beach: { walk: [[[225, 0], [440, 0], [440, 100], [470, 130], [490, 250], [495, 360], [225, 360]], R(125, 155, 120, 60)], block: [R(415, 150, 50, 45)] },
    cliff_path: { walk: [[[0, 0], [400, 0], [420, 120], [410, 200], [470, 260], [470, 360], [0, 360]]], block: [R(185, 165, 55, 50), R(0, 0, 90, 40), R(355, 275, 45, 30), R(0, 330, 40, 30)] },
    lighthouse: { walk: [[[115, 120], [230, 110], [420, 110], [545, 140], [540, 300], [500, 330], [330, 330], [330, 360], [260, 360], [260, 330], [140, 330], [115, 250]]], block: [R(225, 95, 85, 45), R(320, 85, 40, 45), R(375, 105, 35, 30), R(140, 145, 40, 30)] },
  },
  crossroads_observatory: {
    crossroads: { walk: [R(0, 0, 640, 360)], block: [R(255, 55, 85, 105), R(95, 75, 60, 50), R(445, 70, 55, 45), R(100, 190, 55, 45), R(0, 90, 45, 45), R(0, 200, 45, 45), R(440, 205, 45, 45), R(525, 255, 55, 55), R(580, 90, 55, 50)] },
    observatory: { walk: [R(0, 60, 640, 300)], block: [R(205, 0, 180, 170), R(65, 165, 50, 45), R(0, 0, 60, 140), R(570, 60, 70, 60)] },
    portal_ring: { walk: [R(0, 140, 640, 220), R(55, 115, 510, 30)], block: [R(0, 270, 60, 45), R(140, 270, 50, 50), R(590, 275, 50, 50)] },
  },
  sunfire_pass: {
    canyon_portal: { walk: [R(60, 40, 515, 290), R(270, 300, 60, 60)], block: [R(0, 0, 95, 110), R(235, 225, 35, 95), R(330, 225, 35, 95), R(525, 45, 40, 45), R(80, 270, 45, 45), R(590, 190, 45, 45)] },
    lava_crossing: { walk: [R(55, 0, 530, 125), R(232, 120, 96, 120), R(55, 235, 530, 125)], block: [R(55, 0, 85, 70), R(495, 0, 90, 60), R(55, 290, 60, 70), R(480, 290, 105, 70)] },
    sun_temple: { walk: [R(130, 120, 370, 200), R(255, 300, 60, 60)], block: [R(250, 0, 140, 130), R(225, 65, 20, 40), R(390, 65, 20, 40), R(250, 240, 20, 40), R(350, 240, 20, 40)] },
  },
  nebula_grove: {
    forest_portal: { walk: [R(65, 0, 510, 360)], block: [R(205, 235, 50, 125), R(325, 235, 45, 125)] },
    pond_path: { walk: [R(110, 0, 530, 360)], block: [R(390, 160, 215, 150), R(195, 160, 90, 55), R(590, 150, 50, 190)] },
    star_tree: { walk: [[[110, 180], [180, 120], [420, 120], [490, 180], [460, 265], [330, 285], [330, 360], [250, 360], [250, 285], [140, 265]]], block: [R(235, 60, 125, 95)] },
  },
  astral_ruins: {
    island_portal: { walk: [[[20, 160], [60, 70], [180, 20], [460, 20], [600, 90], [630, 180], [600, 280], [370, 300], [370, 360], [280, 360], [280, 300], [60, 300]]], block: [R(15, 10, 50, 140), R(120, 0, 40, 40), R(430, 0, 40, 40), R(485, 105, 45, 140), R(55, 240, 45, 40), R(190, 235, 90, 125), R(365, 235, 40, 125)] },
    rune_bridge: { walk: [R(205, 0, 140, 360), R(120, 0, 410, 120), R(130, 250, 300, 110)], block: [R(130, 0, 40, 50), R(380, 0, 40, 50), R(150, 170, 40, 110), R(390, 170, 45, 110), R(100, 260, 50, 100), R(395, 250, 50, 110)] },
    rune_shrine: { walk: [[[90, 120], [170, 60], [460, 60], [540, 140], [520, 250], [330, 255], [330, 360], [245, 360], [245, 255], [90, 230]]], block: [R(85, 55, 40, 110), R(140, 40, 30, 70), R(410, 40, 30, 70), R(470, 60, 40, 90), R(500, 100, 40, 80), R(185, 200, 40, 70), R(350, 200, 40, 70), R(210, 0, 160, 90)] },
  },
  moonwell_cavern: {
    cave_portal: { walk: [R(30, 30, 580, 300), R(205, 0, 180, 60), R(260, 300, 85, 60)], block: [R(200, 230, 60, 130), R(345, 230, 55, 130), R(560, 110, 60, 90), R(0, 260, 90, 100), R(530, 290, 60, 70)] },
    crystal_stream: { walk: [R(60, 0, 520, 360)], block: [R(60, 50, 80, 90), R(160, 20, 60, 55), R(480, 30, 80, 90), R(80, 250, 70, 80), R(380, 10, 70, 50)] },
    moon_pool: { walk: [R(40, 60, 560, 300)], block: [R(150, 90, 295, 150), R(70, 20, 70, 90), R(560, 200, 80, 90), R(30, 310, 70, 50)] },
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
  borrowers_bridges: {
    docks: { monsters: [{ id: 'mon_debt_slime', x: 180, y: 180 }, { id: 'mon_interest_imp', x: 440, y: 200 }] },
    bridge: { npcs: [{ id: 'mentor', sprite: 'mentor_borrowers_bridges', x: 372, y: 322, face: 'west' }], monsters: [{ id: 'mon_late_fee_troll', x: 520, y: 50 }] },
    toll: { monsters: [{ id: 'boss_loan_shark_lord', x: 270, y: 168 }] },
  },
  guildworks: {
    lemonade_lane: { monsters: [{ id: 'mon_tax_gremlin', x: 175, y: 210 }, { id: 'mon_slacker_golem', x: 460, y: 205 }] },
    workshop_square: { npcs: [{ id: 'mentor', sprite: 'mentor_guildworks', x: 520, y: 120, face: 'south' }], monsters: [{ id: 'mon_gig_goblin', x: 520, y: 255 }] },
    bakery_smithy: { monsters: [{ id: 'boss_burnout_blaze', x: 320, y: 200 }] },
  },
  compound_orchard: {
    orchard_gate: { monsters: [{ id: 'mon_hype_hornet', x: 190, y: 190 }, { id: 'mon_bubble_beetle', x: 450, y: 210 }] },
    sapling_rows: { npcs: [{ id: 'mentor', sprite: 'mentor_compound_orchard', x: 200, y: 165, face: 'south' }], monsters: [{ id: 'mon_panic_bear', x: 360, y: 210 }] },
    great_tree: { monsters: [{ id: 'boss_crash_treant', x: 300, y: 215 }] },
  },
  stormwatch_coast: {
    beach: { monsters: [{ id: 'mon_risk_squall', x: 300, y: 150 }, { id: 'mon_mishap_crab', x: 380, y: 260 }] },
    cliff_path: { npcs: [{ id: 'mentor', sprite: 'mentor_stormwatch_coast', x: 330, y: 150, face: 'south' }], monsters: [{ id: 'mon_flood_eel', x: 150, y: 270 }] },
    lighthouse: { monsters: [{ id: 'boss_catastrophe_leviathan', x: 380, y: 210 }] },
  },
  crossroads_observatory: {
    crossroads: { npcs: [{ id: 'mentor', sprite: 'mentor_crossroads_observatory', x: 420, y: 290, face: 'west' }], monsters: [{ id: 'mon_scam_serpent', x: 120, y: 270 }, { id: 'mon_inflation_balloon', x: 530, y: 160 }] },
    observatory: { monsters: [{ id: 'mon_doubt_wraith', x: 140, y: 280 }, { id: 'boss_chaos_sphinx', x: 300, y: 250 }] },
    portal_ring: {},
  },
  sunfire_pass: {
    canyon_portal: { monsters: [{ id: 'mon_ember_jackal', x: 170, y: 190 }, { id: 'mon_sunscale_basilisk', x: 470, y: 210 }] },
    lava_crossing: { monsters: [{ id: 'mon_cinder_scarab', x: 160, y: 95 }] },
    sun_temple: { monsters: [{ id: 'boss_solar_wyrm', x: 320, y: 205 }] },
  },
  nebula_grove: {
    forest_portal: { monsters: [{ id: 'mon_starmoth', x: 170, y: 190 }, { id: 'mon_nebula_lynx', x: 470, y: 210 }] },
    pond_path: { monsters: [{ id: 'mon_void_sprout', x: 440, y: 110 }] },
    star_tree: { monsters: [{ id: 'boss_galaxy_stag', x: 300, y: 225 }] },
  },
  astral_ruins: {
    island_portal: { monsters: [{ id: 'mon_rune_golem', x: 170, y: 190 }, { id: 'mon_relic_wraith', x: 420, y: 210 }] },
    rune_bridge: { monsters: [{ id: 'mon_comet_hound', x: 420, y: 80 }] },
    rune_shrine: { monsters: [{ id: 'boss_astral_colossus', x: 300, y: 185 }] },
  },
  moonwell_cavern: {
    cave_portal: { monsters: [{ id: 'mon_moonbat', x: 170, y: 190 }, { id: 'mon_crystal_crawler', x: 470, y: 210 }] },
    crystal_stream: { monsters: [{ id: 'mon_tide_specter', x: 200, y: 200 }] },
    moon_pool: { monsters: [{ id: 'boss_lunar_hydra', x: 300, y: 300 }] },
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
