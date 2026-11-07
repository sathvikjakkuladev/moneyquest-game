// Asset importer: `../MoneyQuest Assets/` (read-only) → public/assets/, src/assets/manifest.json and
// ASSET_REPORT.md. Also pixelizes the few pieces the pack doesn't have from the archived v1 art
// (read-only), and imports any extra PixelLab characters saved in `assets-src/pixellab/`.
//   node tools/import-assets.ts   (or: npm run import:assets)

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Img } from './lib/img.ts';
import { alphaBox, atlasJson, flipX, loadImg, pack, padBottomCenter, pixelize, toSharp } from './lib/img.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACK = join(root, '..', 'MoneyQuest Assets');
const V1 = join(root, '..', '_archive', 'game-old-2026-11-07', 'public', 'assets'); // smooth v1 art, read-only
const EXTRA = join(root, 'assets-src', 'pixellab'); // PixelLab characters made for this game
const OUT = join(root, 'public', 'assets');
const MANIFEST = join(root, 'src', 'assets', 'manifest.json');
const REPORT = join(root, 'ASSET_REPORT.md');
const WEBP = { lossless: true, effort: 6 };

if (!existsSync(join(PACK, 'locations'))) {
  console.error(`✗ Asset pack not found at ${PACK}. Nothing written.`);
  process.exit(1);
}

// Every source file gets a row in the report: how it's used, or why it isn't.
const used = new Map<string, { use: string; notes: string[] }>();
const claim = (abs: string, use: string, ...notes: string[]) => used.set(abs, { use, notes: notes.filter(Boolean) });
const defects: string[] = [];
let bytes = 0;
const outRel = (p: string) => relative(OUT, p);

async function writeWebp(img: Img | string, out: string): Promise<string> {
  mkdirSync(dirname(out), { recursive: true });
  await (typeof img === 'string' ? (await import('sharp')).default(img) : toSharp(img)).webp(WEBP).toFile(out);
  bytes += statSync(out).size;
  return outRel(out);
}
function writeJson(obj: unknown, out: string): string {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(obj));
  bytes += statSync(out).size;
  return outRel(out);
}
const listDirs = (p: string) => (existsSync(p) ? readdirSync(p).filter((f) => !f.startsWith('.') && !f.startsWith('_') && statSync(join(p, f)).isDirectory()).sort() : []);

// ── Locations ─────────────────────────────────────────────────────────────
interface Exit { edge: 'left' | 'right' | 'top' | 'bottom'; range: [number, number]; to: string; enter_at: [number, number] | null }
interface PackScreen { image: string; landmark?: string; npcs?: string[]; exits: Exit[]; entries?: Record<string, [number, number]>; monster_spawns?: [number, number][]; boss_spawn?: [number, number]; portals?: { at: [number, number]; color: string; to: string }[] }
interface PackRooms { zone: string; topic?: string; start: string; screens: Record<string, PackScreen>; battle_background?: string; notes?: string }
const KNOWN_ROUGH: Record<string, string> = {
  'borrowers_bridges/toll': 'darker than its neighbours (pack README): brighten slightly in the game',
  'piggybank_village/cottages': 'darker than its neighbours (pack README): brighten slightly in the game',
  'compound_orchard/orchard_gate': 'the gate is drawn closed (pack README): treat as a doorway',
};

const locations: Record<string, { topic: string; start: string; battleBg: string | null; screens: Record<string, { image: string } & Omit<PackScreen, 'image'>> }> = {};

async function importLocations() {
  for (const zone of listDirs(join(PACK, 'locations'))) {
    const dir = join(PACK, 'locations', zone);
    const roomsPath = join(dir, 'rooms.json');
    const rooms = JSON.parse(readFileSync(roomsPath, 'utf8')) as PackRooms;
    claim(roomsPath, 'layout source for this location (copied into the manifest; game-side layouts live in src/data/rooms/)');
    const screens: (typeof locations)[string]['screens'] = {};
    for (const [name, s] of Object.entries(rooms.screens)) {
      const src = join(dir, s.image);
      if (!existsSync(src)) {
        defects.push(`${zone}/${name}: image ${s.image} is missing`);
        continue;
      }
      const img = await loadImg(src);
      const notes: string[] = [];
      if (img.w !== 320 || img.h !== 180) notes.push(`size ${img.w}×${img.h}, expected 320×180`);
      if (KNOWN_ROUGH[`${zone}/${name}`]) notes.push(KNOWN_ROUGH[`${zone}/${name}`]!);
      notes.forEach((n) => defects.push(`${zone}/${name}: ${n}`));
      const image = await writeWebp(img, join(OUT, 'screens', zone, `${name}.webp`));
      claim(src, `screen "${name}" of ${zone} (drawn at 2× to fill 640×360)`, ...notes);
      const { image: _src, ...rest } = s;
      screens[name] = { image, ...rest };
    }
    let battleBg: string | null = null;
    const bg = join(dir, rooms.battle_background ?? 'battle_bg.png');
    if (existsSync(bg)) {
      battleBg = await writeWebp(bg, join(OUT, 'battle', `${zone}.webp`));
      claim(bg, `battle background for ${zone}`);
    } else if (zone !== 'coin_academy') defects.push(`${zone}: no battle background`);
    locations[zone] = { topic: rooms.topic ?? '', start: rooms.start, battleBg, screens };
    // The pack keeps alternate palette versions and helper scripts; note them as unused.
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (used.has(p)) continue;
      if (f === 'v1_palette') for (const g of readdirSync(p)) claim(join(p, g), 'not used: alternate palette version of a screen');
      else if (f.endsWith('.sh')) claim(p, 'not used: download script (the images are already in the pack)');
      else if (f.endsWith('.md')) claim(p, 'read for layout notes');
    }
  }
}

// ── Monsters ──────────────────────────────────────────────────────────────
interface MonsterEntry { zone: string; atlas: string; image: string; json: string; cell: number; baseline: number; size: number; boss: boolean; anims: { key: string; frames: string[]; frameRate: number; repeat: number }[] }
const monsters: Record<string, MonsterEntry> = {};
const EXPECTED_ROWS = { idle: 4, attack: 6, hit: 4, defeat: 5 };

async function importMonsters() {
  for (const zone of listDirs(join(PACK, 'monsters'))) {
    const dir = join(PACK, 'monsters', zone);
    for (const f of readdirSync(dir).filter((f) => f.endsWith('_sheet.json')).sort()) {
      const id = f.replace('_sheet.json', '');
      const json = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      const sheet = join(dir, json.meta.image);
      const single = join(dir, `${id}.png`);
      const notes: string[] = [];
      for (const [row, n] of Object.entries(EXPECTED_ROWS)) {
        const a = (json.anims as { key: string; frames: string[] }[]).find((x) => x.key.endsWith(`_${row}`));
        if (!a) notes.push(`no ${row} animation`);
        else if (a.frames.length !== n) notes.push(`${row} has ${a.frames.length} frames, expected ${n}`);
      }
      notes.forEach((n) => defects.push(`${id}: ${n}`));
      const singleMeta = await loadImg(single);
      const boss = id.startsWith('boss_');
      const image = await writeWebp(sheet, join(OUT, 'monsters', `${id}.webp`));
      const jsonOut = writeJson({ frames: json.frames, meta: { ...json.meta, image: `${id}.webp` } }, join(OUT, 'monsters', `${id}.json`));
      monsters[id] = { zone, atlas: `mon:${id}`, image, json: jsonOut, cell: json.meta.frame.w, baseline: json.meta.baseline_y, size: singleMeta.h, boss, anims: json.anims };
      claim(sheet, `${boss ? 'boss' : 'monster'} animation sheet (idle, attack, hit, defeat)`, ...notes);
      claim(join(dir, f), 'Phaser atlas for the sheet');
      claim(single, 'not used directly: the sheet already contains this pose (kept for reference)');
    }
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (f === 'ai_animations') for (const g of readdirSync(p)) claim(join(p, g), 'not used: only the first frame of a PixelLab animation (the other frames are behind download links)');
    }
  }
  for (const f of ['monster_attacks.json', 'MONSTER_ATTACKS.md', 'README.md', 'download_ai_animations.sh']) {
    const p = join(PACK, 'monsters', f);
    if (!existsSync(p)) continue;
    claim(p, f === 'monster_attacks.json' ? 'monster data (copied to src/data/monster_attacks.json by this importer)' : f.endsWith('.sh') ? 'not used: download script' : 'read for notes');
  }
  // monster_attacks.json is the only source of monster data; copy it in so the game can import it.
  writeFileSync(join(root, 'src', 'data', 'monster_attacks.json'), readFileSync(join(PACK, 'monsters', 'monster_attacks.json')));
}

// ── Characters (PixelLab layout) ──────────────────────────────────────────
interface CharEntry { atlas: string; image: string; json: string; size: number; foot: number; height: number; source: 'pack' | 'pixellab-extra' | 'v1-pixelized'; anims: Record<string, Record<string, string[]>>; rotations: Record<string, string> }
const characters: Record<string, CharEntry> = {};

async function importCharacter(id: string, base: string, source: CharEntry['source']) {
  const meta = JSON.parse(readFileSync(join(base, 'metadata.json'), 'utf8'));
  claim(join(base, 'metadata.json'), `character "${id}" layout`);
  const state = meta.states[0];
  const items: { name: string; img: Img }[] = [];
  const add = async (name: string, rel: string) => {
    const p = join(base, rel);
    items.push({ name, img: await loadImg(p) });
    claim(p, `character "${id}" frame ${name}`);
  };
  const rotations: Record<string, string> = {};
  for (const [dir, rel] of Object.entries(state.frames.rotations as Record<string, string>)) {
    rotations[dir] = `rot_${dir}`;
    await add(`rot_${dir}`, rel);
  }
  const anims: CharEntry['anims'] = {};
  for (const [anim, byDir] of Object.entries((state.frames.animations ?? {}) as Record<string, Record<string, string[]>>)) {
    anims[anim] = {};
    for (const [dir, frames] of Object.entries(byDir)) {
      anims[anim][dir] = [];
      for (let i = 0; i < frames.length; i++) {
        anims[anim][dir].push(`${anim}_${dir}_${i}`);
        await add(`${anim}_${dir}_${i}`, frames[i]!);
      }
    }
  }
  // Feet line and visible height from the south rotation, so characters on different canvas sizes
  // (PixelLab standard mode pads to 92 px) stand on the same spot.
  const south = items.find((it) => it.name === 'rot_south')!.img;
  const box = alphaBox(south)!;
  const packed = pack(items);
  const image = await writeWebp(packed.sheet, join(OUT, 'characters', `${id}.webp`));
  const json = writeJson(atlasJson(`${id}.webp`, packed), join(OUT, 'characters', `${id}.json`));
  characters[id] = { atlas: `chr:${id}`, image, json, size: state.character.size.height, foot: box.y + box.h, height: box.h, source, anims, rotations };
}

async function importCharacters() {
  for (const id of listDirs(join(PACK, 'characters'))) await importCharacter(id, join(PACK, 'characters', id), 'pack');
  for (const id of listDirs(EXTRA)) await importCharacter(id, join(EXTRA, id), 'pixellab-extra');
}

// ── Gaps filled from the archived v1 art (pixelized, PLAN.md §7) ─────────
const v1px: Record<string, { atlas: string; image: string; json: string; frames: string[]; anims?: Record<string, { frames: string[]; flipX: boolean }> }> = {};
let worldMap: string | null = null;

async function v1Frames(atlasName: string): Promise<Record<string, Img>> {
  const json = JSON.parse(readFileSync(join(V1, 'atlas', `${atlasName}.json`), 'utf8')) as { frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }> };
  const src = join(V1, 'atlas', `${atlasName}.webp`);
  claim(src, `v1 art (archive), pixelized for the game`);
  const out: Record<string, Img> = {};
  for (const [name, f] of Object.entries(json.frames)) out[name] = await loadImg(src, f.frame);
  return out;
}

async function importV1Gaps() {
  if (!existsSync(V1)) {
    defects.push(`archived v1 art not found at ${V1}: pets, Bull Calf, Laurel Wreath icon and world map were skipped`);
    return;
  }
  // Pets: half the player's height (32 px).
  const pets = await v1Frames('pets');
  const petItems = await Promise.all(Object.entries(pets).map(async ([name, img]) => ({ name, img: await pixelize(img, 40, 32) })));
  const petPack = pack(petItems);
  v1px.pets = { atlas: 'v1px:pets', image: await writeWebp(petPack.sheet, join(OUT, 'v1px', 'pets.webp')), json: writeJson(atlasJson('pets.webp', petPack), join(OUT, 'v1px', 'pets.json')), frames: Object.keys(pets) };

  // Bull Calf walk frames (reward pet): 4 directions × 4 frames, padded to one cell so frames share a baseline.
  const calf = await v1Frames('walk_pet_bull_calf');
  const calfPx = await Promise.all(Object.entries(calf).map(async ([name, img]) => ({ name, img: await pixelize(img, 40, 32) })));
  const cw = Math.max(...calfPx.map((c) => c.img.w)), ch = Math.max(...calfPx.map((c) => c.img.h));
  const calfItems = calfPx.map((c) => ({ name: c.name, img: padBottomCenter(c.img, cw, ch) }));
  // Store a real right-facing set too, so the game never has to guess.
  for (const c of calfItems.filter((c) => c.name.startsWith('left_'))) calfItems.push({ name: c.name.replace('left_', 'right_'), img: flipX(c.img) });
  const calfPack = pack(calfItems);
  const dirs = ['down', 'up', 'left', 'right'];
  v1px.pet_bull_calf_walk = {
    atlas: 'v1px:pet_bull_calf_walk',
    image: await writeWebp(calfPack.sheet, join(OUT, 'v1px', 'pet_bull_calf_walk.webp')),
    json: writeJson(atlasJson('pet_bull_calf_walk.webp', calfPack), join(OUT, 'v1px', 'pet_bull_calf_walk.json')),
    frames: calfItems.map((c) => c.name),
    anims: Object.fromEntries(dirs.map((d) => [d, { frames: [0, 1, 2, 3].map((i) => `${d}_${i}`), flipX: false }])),
  };

  // Laurel Wreath icon for the shop, inventory and reward popup (the worn version is drawn in code).
  const gear = await v1Frames('avatar_gear');
  if (gear.hat_laurel_wreath) {
    const icon = await pixelize(gear.hat_laurel_wreath, 32, 32);
    v1px.laurel_icon = { atlas: 'v1px:laurel_icon', image: await writeWebp(icon, join(OUT, 'v1px', 'laurel_icon.webp')), json: '', frames: [] };
  } else defects.push('v1 avatar_gear has no hat_laurel_wreath frame');

  // Mentors not made with PixelLab yet: pixelize the v1 mentor (front from the static portrait, sides
  // and back from its walk sheet) into the same character layout, at the PixelLab mentors' height.
  const npcs = await v1Frames('npcs');
  for (const zone of ['borrowers_bridges', 'guildworks', 'compound_orchard', 'stormwatch_coast', 'crossroads_observatory']) {
    const id = `mentor_${zone}`;
    if (characters[id]) continue;
    const walk = await v1Frames(`walk_npc_mentor_${zone}`);
    const front = npcs[`npc_mentor_${zone}`] ?? walk.down_0;
    const side = walk.left_0 ?? front;
    // Stormwatch's v1 "up" row is a side view (archive ASSET_REPORT), so use the side frame for north there.
    const back = zone === 'stormwatch_coast' ? side : (walk.up_0 ?? side);
    if (!front) continue;
    const H = 64, CANVAS = 72;
    const px = async (img: Img) => padBottomCenter(await pixelize(img, 56, H), CANVAS, CANVAS);
    const south = await px(front), west = await px(side), north = await px(back!);
    const east = flipX(west);
    const frames = [{ name: 'rot_south', img: south }, { name: 'rot_west', img: west }, { name: 'rot_east', img: east }, { name: 'rot_north', img: north }];
    const packed = pack(frames);
    const box = alphaBox(south)!;
    characters[id] = {
      atlas: `chr:${id}`, image: await writeWebp(packed.sheet, join(OUT, 'characters', `${id}.webp`)), json: writeJson(atlasJson(`${id}.webp`, packed), join(OUT, 'characters', `${id}.json`)),
      size: CANVAS, foot: box.y + box.h, height: box.h, source: 'v1-pixelized', anims: {},
      rotations: { south: 'rot_south', west: 'rot_west', east: 'rot_east', north: 'rot_north', 'south-west': 'rot_west', 'south-east': 'rot_east', 'north-west': 'rot_west', 'north-east': 'rot_east' },
    };
    defects.push(`${id}: no PixelLab art yet, so the v1 mentor was pixelized as a stand-in (front, sides, back only)`);
  }

  // World map: the v1 painting of all 11 islands, reduced to 640×360 pixel art.
  const map = join(V1, 'bg', 'world_map.webp');
  if (existsSync(map)) {
    claim(map, 'v1 world map (archive), pixelized to 640×360');
    const img = await loadImg(await (await import('sharp')).default(map).resize(640, 360, { kernel: 'lanczos3' }).png({ palette: true, colors: 64, dither: 0 }).toBuffer());
    worldMap = await writeWebp(img, join(OUT, 'v1px', 'world_map.webp'));
  } else defects.push('v1 world map not found in the archive');
}

// ── Report ────────────────────────────────────────────────────────────────
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    if (f === '.DS_Store') return [];
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function writeReport(total: number) {
  const files = walk(PACK).sort();
  const L: string[] = [
    '# Asset report',
    '',
    `Generated by \`tools/import-assets.ts\` on ${new Date().toISOString().slice(0, 10)}. Do not edit by hand.`,
    '',
    `Output: \`public/assets/\`, ${(total / 1024 / 1024).toFixed(2)} MB. Pixel art is drawn with nearest-neighbour filtering at whole-number scales: screens at 2× on the 640×360 canvas, sprites at 1×.`,
    '',
    '## Defects and rough spots',
    '',
    ...(defects.length ? defects.map((d) => `- ${d}`) : ['- none found']),
    '- Each screen was generated separately, so paths don’t line up exactly at screen edges (pack README). Entry points in `rooms.json` place the player on each screen’s own path.',
    '- Collision is not in the pack; the game ships a first pass in `src/data/rooms/` and the `?dev=1` editor refines it.',
    '',
    '## Gaps filled from the archived v1 art',
    '',
    'Pixelized from `_archive/game-old-2026-11-07/public/assets/` (smooth Meta AI art) with the same method as `_tools/make_monster_sheets.py`: trim, Lanczos downscale, alpha cut at 110, 40 colours, no dithering.',
    '',
    `- Pets: ${v1px.pets?.frames.join(', ') ?? 'skipped'} (32 px tall)`,
    `- Bull Calf walk cycle: ${v1px.pet_bull_calf_walk ? '4 directions × 4 frames, 32 px' : 'skipped'}`,
    `- Laurel Wreath icon: ${v1px.laurel_icon ? '32 px' : 'skipped'}`,
    `- World map: ${worldMap ? '640×360, 64 colours' : 'skipped'}`,
    `- Extra PixelLab characters (\`assets-src/pixellab/\`): ${Object.values(characters).filter((c) => c.source === 'pixellab-extra').length || 'none yet'}`,
    '',
    `## Every file in \`MoneyQuest Assets/\` (${files.length})`,
    '',
    '| File | Use | Notes |',
    '|---|---|---|',
  ];
  const describeUnclaimed = (rel: string) =>
    rel.startsWith('_work/') ? 'not used: working files from making the pack' :
    rel.startsWith('_tools/') ? 'not used by the game: the script that made the monster sheets (its method is reused for the v1 gaps)' :
    rel.startsWith('_to_delete/') ? 'not used: marked for deletion in the pack' :
    rel.endsWith('.sh') ? 'not used: download script (images are already in the pack)' :
    rel.endsWith('.md') || rel.endsWith('.txt') ? 'documentation (read; `_job_log.txt` is cited in docs/AI_USE.md)' : '**not used** (unexpected file)';
  for (const f of files) {
    const rel = relative(PACK, f);
    const u = used.get(f);
    L.push(`| \`${rel}\` | ${u ? u.use : describeUnclaimed(rel)} | ${u?.notes.join('; ') ?? ''} |`);
  }
  writeFileSync(REPORT, L.join('\n') + '\n');
}

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  await importLocations();
  await importMonsters();
  await importCharacters();
  await importV1Gaps();
  const manifest = {
    note: 'Generated by tools/import-assets.ts. Do not edit by hand.',
    basePath: 'assets/',
    canvas: [640, 360],
    locations, monsters, characters, v1px, worldMap,
    totalBytes: bytes,
  };
  mkdirSync(dirname(MANIFEST), { recursive: true });
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + '\n');
  writeReport(bytes);
  console.log(`✓ ${Object.keys(locations).length} locations, ${Object.keys(monsters).length} monsters, ${Object.keys(characters).length} characters → public/assets (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
  if (defects.length) console.log(`  ${defects.length} defect note(s) in ASSET_REPORT.md`);
}

await main();
