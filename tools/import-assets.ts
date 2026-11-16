// Asset importer: `../assets_v2` (read-only, 1.4 GB of masters) → the runtime set the game ships.
//
//   public/assets/v2/**       WebP at the sizes the game draws (canvas 1280×720, see PLAN.md §12)
//   src/assets/v2.json        every exported file with its size
//   src/data/v2/*.json        the data the game builds against (coordinates on the 640×360 stage)
//   docs/assets_v2/**         reference copies of the art set's docs and scripts
//   ASSET_REPORT.md           what was exported and how big it is
//
// Everything this writes is generated: re-run `npm run import:assets` instead of editing it.
// Run with --force to re-encode files that already exist.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, '..', 'assets_v2');
const OUT = join(root, 'public', 'assets', 'v2');
const DATA = join(root, 'src', 'data', 'v2');
const DOCS = join(root, 'docs', 'assets_v2');
const FORCE = process.argv.includes('--force');

if (!existsSync(join(SRC, 'manifest.json'))) {
  console.error(`assets_v2 not found at ${SRC}. It sits next to the game folder on Sathvik's Mac and is not in the repo.`);
  process.exit(1);
}

// ── Sizes (PLAN.md §12, decision 1). The stage is 640×360; the canvas draws it at 2×. ──
const STAGE = 3; // source screen px (1920×1080) per stage px
const RENDER = 2; // canvas px per stage px
const SCREEN_W = 640 * RENDER, SCREEN_H = 360 * RENDER;
const PROP = RENDER / STAGE; // props: @1x source size × this
const MONSTER_H = 200, MONSTER_PORTRAIT = 128;
const BOSS_H = 384, BOSS_PORTRAIT = 192, BOSS_CLIP = 0.64; // clip factor: full-size frame px → export px
const NPC_H = 160, NPC_PORTRAIT = 160, NPC_CLIP = 0.25;
const AVATAR_CLIP = 0.35;
const LAYER = 0.25; // hair, face and hats: head-template px → export px
const HAT_ICON = 128;
const Q = 82;

const j = <T = any>(p: string): T => JSON.parse(readFileSync(join(SRC, p), 'utf8')) as T;
const r1 = (n: number) => Math.round(n * 10) / 10;
const st = (n: number) => r1(n / STAGE);
const files: Record<string, { w: number; h: number; bytes: number }> = {};
const notes: string[] = [];
let encoded = 0;

function fresh(src: string, out: string): boolean {
  return !FORCE && existsSync(out) && statSync(out).mtimeMs >= statSync(src).mtimeMs;
}
async function record(rel: string): Promise<{ w: number; h: number }> {
  const out = join(OUT, rel);
  const m = await sharp(out).metadata();
  files[rel] = { w: m.width!, h: m.height!, bytes: statSync(out).size };
  return { w: m.width!, h: m.height! };
}
type Size = { w?: number; h?: number; scale?: number; exact?: [number, number] };
/** Resize one source image to WebP. Returns the exported size. */
async function img(srcRel: string, outRel: string, size: Size, opts: { alpha?: boolean; q?: number } = {}): Promise<{ w: number; h: number }> {
  const src = join(SRC, srcRel), out = join(OUT, outRel);
  if (!fresh(src, out)) {
    mkdirSync(dirname(out), { recursive: true });
    let s = sharp(src);
    const m = await s.metadata();
    let w: number, h: number;
    if (size.exact) [w, h] = size.exact;
    else if (size.scale) [w, h] = [Math.max(1, Math.round(m.width! * size.scale)), Math.max(1, Math.round(m.height! * size.scale))];
    else if (size.h) [w, h] = [Math.max(1, Math.round((m.width! * size.h) / m.height!)), size.h];
    else [w, h] = [size.w!, Math.max(1, Math.round((m.height! * size.w!) / m.width!))];
    s = s.resize(w, h, { fit: 'fill', kernel: 'lanczos3' });
    await s.webp({ quality: opts.q ?? Q, alphaQuality: 90, effort: 5 }).toFile(out);
    encoded++;
  }
  return record(outRel);
}
const dirs = (p: string) => readdirSync(join(SRC, p), { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('_')).map((d) => d.name).sort();
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]!); }));
}

// ── Locations: grounds, the overhang layer, props and where each prop stands ──
interface SrcObject { file: string; prop: string; anchor: [number, number]; size: [number, number]; flip: boolean }
const screensOut: Record<string, { grid: [number, number]; boss: string | null; monsters: string[]; arrival: { screen: string; at: [number, number] }; screens: Record<string, unknown> }> = {};
const propSizes: Record<string, Record<string, { w: number; h: number }>> = {};
async function locations(): Promise<void> {
  for (const loc of dirs('locations')) {
    const L = j(`locations/${loc}/${loc}.json`);
    const out: Record<string, unknown> = {};
    propSizes[loc] = {};
    const jobs: (() => Promise<void>)[] = [];
    for (const [id, s] of Object.entries<any>(L.screens)) {
      const dir = `locations/${loc}/${s.folder}`;
      const objs = j<{ objects: SrcObject[] }>(`${dir}/objects.json`).objects;
      const exits = j(`${dir}/exits.json`);
      jobs.push(async () => void (await img(`${dir}/ground.png`, `loc/${loc}/${id}.webp`, { exact: [SCREEN_W, SCREEN_H] }, { q: 80 })));
      const over = (await sharp(join(SRC, dir, 'overhang.png')).extractChannel(3).stats()).channels[0]!.max > 0;
      if (over) jobs.push(async () => void (await img(`${dir}/overhang.png`, `loc/${loc}/${id}-over.webp`, { exact: [SCREEN_W, SCREEN_H] })));
      const props = [];
      for (const o of objs) {
        // A prop is drawn from its master; the two arch halves only exist as placed renders.
        const master = `props/${loc}/prop-${loc}-${o.prop}.png`;
        const key = existsSync(join(SRC, master)) ? o.prop : `${o.prop}@${id}`;
        if (!propSizes[loc]![key]) {
          propSizes[loc]![key] = { w: 0, h: 0 };
          const srcRel = key === o.prop ? master : `${dir}/${o.file}`;
          jobs.push(async () => { propSizes[loc]![key] = await img(srcRel, `props/${loc}/${key.replace('@', '-at-')}.webp`, { exact: [Math.round(o.size[0] * PROP), Math.round(o.size[1] * PROP)] }); });
        }
        props.push({ p: key, x: st(o.anchor[0]), y: st(o.anchor[1]), w: st(o.size[0]), h: st(o.size[1]), ...(o.flip && key === o.prop ? { flip: true } : {}) });
      }
      out[id] = {
        name: s.name,
        over,
        props,
        doors: (exits.doors ?? []).map((d: any) => ({ kind: d.type, target: d.target, rect: d.rect.map(st) })),
        ...(exits.arch ? { arch: { opening: exits.arch.opening.map(st), lintel: st(exits.arch.lintel_bottom) } } : {}),
      };
    }
    await pool(jobs, 6, (f) => f());
    screensOut[loc] = { grid: L.grid, boss: L.boss ?? null, monsters: L.monsters ?? [], arrival: { screen: L.teleportArrival.screen, at: [st(L.teleportArrival.x), st(L.teleportArrival.y)] }, screens: out };
  }
}

// ── World map and battle backgrounds ──
let worldOut: unknown, battleOut: unknown;
async function mapAndBattle(): Promise<void> {
  const W = j('world-map/world-map.json');
  await img(W.image['720'], 'map/world.webp', { exact: [SCREEN_W, SCREEN_H] }, { q: 84 });
  worldOut = { image: 'map/world.webp', pins: Object.fromEntries(Object.entries<any>(W.pins).map(([id, p]) => [id, { x: r1(p.x * 640), y: r1(p.y * 360), r: r1(p.radius * 640), kind: p.kind, boss: p.boss, order: p.order }])) };
  const B = j('backgrounds/battle/battle-layout.json');
  const bg: Record<string, string> = {};
  for (const d of dirs('backgrounds/battle')) {
    await img(`backgrounds/battle/${d}/battle-bg-${d}@1x.webp`, `battle/${d}.webp`, { exact: [SCREEN_W, SCREEN_H] }, { q: 82 });
    bg[d === 'ledgerhold-arena' ? 'ledgerhold' : d] = `battle/${d}.webp`; // the arena is Ledgerhold's (the Debt Dragon)
  }
  battleOut = { floorTop: B.floorTop, feetY: r1(B.feetY * 360), playerX: r1(B.player.x * 640), enemyX: r1(B.enemy.x * 640), hudTop: r1(B.safeTopForHud * 360), backgrounds: bg };
}

// ── Monsters (which are also the pets), bosses and NPCs ──
const VIEWS = ['front', 'back', 'left', 'right'] as const;
const monstersOut: Record<string, { looks: string[] }> = {};
const bossesOut: Record<string, { clips: Record<string, Clip> }> = {};
const npcsOut: Record<string, { talk: Clip | null }> = {};
interface Clip { image: string; cell: [number, number]; frames: number; cols: number; foot: [number, number]; fps: number; head?: number[][]; view?: string }

/** A 16-frame sheet (4×4 cells of the full-size frame × sheet.scale) re-cut at `factor` × full size. */
async function clip(jsonRel: string, outRel: string, factor: number, withHead = false): Promise<Clip> {
  const c = j(jsonRel);
  const names = Object.keys(c.sheet.frames).sort();
  const [cw0, ch0] = c.sheet.cell as [number, number];
  const cols = Math.round(Math.max(...names.map((n) => c.sheet.frames[n].frame.x)) / cw0) + 1;
  const rows = Math.ceil(names.length / cols);
  const cw = Math.round((cw0 / c.sheet.scale) * factor), ch = Math.round((ch0 / c.sheet.scale) * factor);
  await img(join(dirname(jsonRel), c.sheet.image), outRel, { exact: [cw * cols, ch * rows] });
  const out: Clip = { image: outRel, cell: [cw, ch], frames: names.length, cols, foot: [r1(c.anchor.foot[0] * factor), r1(c.anchor.foot[1] * factor)], fps: 8 };
  if (withHead && c.head) {
    out.view = c.head.view;
    out.head = names.map((n) => (c.head.frames[c.sheet.frames[n].sourceFrame] as number[]).map((v) => r1(v * factor)));
  }
  return out;
}

async function creatures(): Promise<void> {
  const jobs: (() => Promise<void>)[] = [];
  for (const sp of dirs('monsters')) {
    const looks = dirs(`monsters/${sp}`);
    monstersOut[sp] = { looks };
    for (const look of looks) {
      for (const v of VIEWS) jobs.push(async () => void (await img(`monsters/${sp}/${look}/monster-${sp}-${look}-${v}.png`, `mon/${sp}/${look}-${v}.webp`, { h: MONSTER_H })));
      jobs.push(async () => void (await img(`monsters/${sp}/${look}/monster-${sp}-${look}-portrait.png`, `mon/${sp}/${look}-portrait.webp`, { w: MONSTER_PORTRAIT })));
    }
  }
  for (const b of dirs('bosses')) {
    bossesOut[b] = { clips: {} };
    for (const v of VIEWS) jobs.push(async () => void (await img(`bosses/${b}/boss-${b}-${v}.png`, `boss/${b}/${v}.webp`, { h: BOSS_H })));
    jobs.push(async () => void (await img(`bosses/${b}/boss-${b}-portrait.png`, `boss/${b}/portrait.webp`, { w: BOSS_PORTRAIT })));
    for (const c of dirs(`animations/bosses/${b}`)) jobs.push(async () => { bossesOut[b]!.clips[c] = await clip(`animations/bosses/${b}/${c}/boss-${b}-${c}.json`, `boss/${b}/${c}.webp`, BOSS_CLIP); });
  }
  for (const n of dirs('npcs')) {
    npcsOut[n] = { talk: null };
    // NPCs always face you: only the front view (and the talk clip) is used.
    jobs.push(async () => void (await img(`npcs/${n}/npc-${n}-front.png`, `npc/${n}/front.webp`, { h: NPC_H })));
    jobs.push(async () => void (await img(`npcs/${n}/npc-${n}-portrait.png`, `npc/${n}/portrait.webp`, { w: NPC_PORTRAIT })));
    const talk = `animations/npcs/${n}/npc-${n}-talk.json`;
    if (existsSync(join(SRC, talk))) jobs.push(async () => { npcsOut[n]!.talk = await clip(talk, `npc/${n}/talk.webp`, NPC_CLIP); });
    else notes.push(`NPC ${n} has no talk clip.`);
  }
  await pool(jobs, 8, (f) => f());
}

// ── The avatar: body clips, hair and face layers, hats, colour sets ──
let avatarOut: unknown, hatsOut: unknown;
async function avatar(): Promise<void> {
  const O = j('avatars/unisex/options.json');
  const clips: Record<string, Clip> = {};
  const templates: Record<string, { top: number; cx: number; w: number }> = {};
  for (const c of dirs('animations/avatars/unisex')) {
    const rel = `animations/avatars/unisex/${c}/avatar-unisex-${c}.json`;
    clips[c] = await clip(rel, `avatar/clips/${c}.webp`, AVATAR_CLIP, true);
    const h = j(rel).head;
    templates[h.view] = { top: r1(h.template.top * LAYER), cx: r1(h.template.cx * LAYER), w: r1(h.template.w * LAYER) };
  }
  // Skin colour the body was drawn in: the median of its skin pixels (same test as overlay.py).
  const { data } = await sharp(join(OUT, 'avatar/clips/idle.webp')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch: number[][] = [[], [], []];
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
    if (r > g && g > b && r - b > 40 && r > 80 && a > 128) { ch[0]!.push(r); ch[1]!.push(g); ch[2]!.push(b); }
  }
  const skinBase = ch.map((c) => c.sort((x, y) => x - y)[c.length >> 1]!);

  const layers = async (meta: string, view: string) => {
    const out: Record<string, { i: number; layer: string; image: string; off: [number, number]; w: number; h: number }[]> = {};
    for (const m of j(meta).layers as any[]) {
      if (m.empty) continue;
      const image = `avatar/${view}/${m.file.replace(/\.png$/, '.webp')}`;
      const s = await img(`avatars/unisex/layers/${m.file}`, image, { scale: LAYER });
      (out[m.layer] ??= []).push({ i: m.i, layer: m.layer, image, off: [r1(m.off[0] * LAYER), r1(m.off[1] * LAYER)], ...s });
    }
    return out;
  };
  const front = { ...(await layers('avatars/unisex/layers/hair-front.json', 'front')), ...(await layers('avatars/unisex/layers/face-front.json', 'front')) };
  const back = await layers('avatars/unisex/layers/hair-back.json', 'back');
  const C = j('avatars/costume-sets/costume_sets.json');
  avatarOut = {
    note: 'Generated. Sizes are export px: clip cells, head tracks [top, cx, w] per frame, and layers in head-template px.',
    skin: O.skin, eyes: Object.entries(O.eyes).map(([name, hex]) => ({ name, hex })), hairColours: Object.entries(O.hair).map(([name, hex]) => ({ name, hex })),
    hairStyles: O.hairStyles, faces: O.faces, neat: O.hairStyles.indexOf('neat'), hairTintBase: 215, skinBase,
    templates, clips, layers: { front, back },
    costume: { groups: C.groups, order: ['trim', 'light', 'cape', 'tunic'], neck: 1.15, sets: C.sets },
  };

  // Hats: the game id is `hat-<folder>`, except the Laurel Wreath, whose id must stay `hat-laurel`.
  const hats = [];
  for (const h of dirs('accessories/head')) {
    const H = j(`accessories/head/${h}/hat-${h}.json`);
    const views: Record<string, { image: string; off: [number, number]; w: number; h: number }> = {};
    for (const v of H.views as any[]) {
      const image = `avatar/hats/${h}-${v.view}.webp`;
      views[v.view] = { image, off: [r1(v.off[0] * LAYER), r1(v.off[1] * LAYER)], ...(await img(`accessories/head/${h}/${v.file}`, image, { scale: LAYER })) };
    }
    const icon = `avatar/hats/${h}-icon.webp`;
    await img(`accessories/head/${h}/${H.icon}`, icon, { w: HAT_ICON });
    hats.push({ id: h === 'laurel-wreath' ? 'hat-laurel' : `hat-${h}`, art: h, rarity: H.rarity, rewardOnly: Boolean(H.rewardOnly), kind: H.kind, hairRule: H.hairRule, icon, views });
  }
  hatsOut = { note: 'Generated. Rarity labels are drafts for review.', hats };
}

// ── VFX strips ──
let vfxOut: unknown;
async function vfx(): Promise<void> {
  const V = j('vfx/vfx-index.json');
  const out: Record<string, unknown> = {};
  for (const name of Object.keys(V.effects)) {
    const m = j(`vfx/vfx-${name}.json`);
    await img(`vfx/vfx-${name}.webp`, `vfx/${name}.webp`, { scale: 1 }, { q: 80 });
    out[name] = { image: `vfx/${name}.webp`, frame: m.frameWidth, frames: m.frames, fps: m.fps, loop: m.loop, about: m.description };
  }
  vfxOut = out;
}

// ── Reference copies and the UI kit's tokens ──
function copies(): void {
  mkdirSync(DOCS, { recursive: true });
  const stamp = (name: string, text: string) => (name.endsWith('.py') ? `# Copied from ../assets_v2 by tools/import-assets.ts. Do not edit; reference only, never run by the game.\n${text}` : `<!-- Copied from ../assets_v2 by tools/import-assets.ts. Do not edit. -->\n${text}`);
  for (const [from, to] of [['STYLE_GUIDE.md', 'STYLE_GUIDE.md'], ['AVATAR_UPDATE.md', 'AVATAR_UPDATE.md'], ['QA_REPORT.md', 'QA_REPORT.md'], ['avatars/unisex/_tools/overlay.py', 'overlay.py'], ['avatars/costume-sets/_tools/recolor.py', 'recolor.py'], ['accessories/_tools/unisex/fit2.py', 'fit2.py'], ['ui/README.md', 'UI_KIT.md']] as const)
    writeFileSync(join(DOCS, to), stamp(to, readFileSync(join(SRC, from), 'utf8')));
  copyFileSync(join(SRC, 'ui', 'tokens.json'), join(DATA, 'ui-tokens.json'));
  copyFileSync(join(SRC, 'monsters', 'motion-spec.json'), join(DATA, 'motion.json'));
}

const write = (name: string, data: unknown) => writeFileSync(join(DATA, name), JSON.stringify(data, null, 1) + '\n');

mkdirSync(DATA, { recursive: true });
await locations();
await mapAndBattle();
await creatures();
await avatar();
await vfx();
copies();

write('screens.json', { note: 'Generated from assets_v2: where each screen\'s props stand (640×360 stage px), its doors and overhang. Layouts the game edits live in src/data/rooms/.', locations: screensOut });
write('world.json', worldOut);
write('battle.json', battleOut);
write('avatar.json', avatarOut);
write('hats.json', hatsOut);
write('vfx.json', vfxOut);
write('creatures.json', { note: 'Generated. Monsters: mon/<species>/<look>-<view>.webp. Bosses and NPCs: views, a portrait and clips.', monsters: monstersOut, bosses: bossesOut, npcs: npcsOut });

const total = Object.values(files).reduce((a, f) => a + f.bytes, 0);
writeFileSync(join(root, 'src', 'assets', 'v2.json'), JSON.stringify({ note: 'Generated by tools/import-assets.ts. Do not edit by hand.', basePath: 'assets/v2/', stage: [640, 360], render: RENDER, props: propSizes, totalBytes: total, files }, null, 0) + '\n');

// ── Report ──
const groups: Record<string, [number, number]> = {};
for (const [p, f] of Object.entries(files)) {
  const g = p.split('/')[0]!;
  (groups[g] ??= [0, 0])[0]++;
  groups[g]![1] += f.bytes;
}
const mb = (n: number) => (n / 1e6).toFixed(2);
const label: Record<string, string> = { loc: 'District and hub screens (ground and overhang)', props: 'Props', map: 'World map', battle: 'Battle backgrounds', mon: 'Monsters and pets (views and portraits)', boss: 'Bosses (views, portrait, idle and attack sheets)', npc: 'NPCs (views, portrait, talk sheet)', avatar: 'Avatar (clip sheets, hair, faces, hats)', vfx: 'VFX strips' };
const firstLoad = Object.entries(files).filter(([p]) => p.startsWith('loc/ledgerhold/') || p.startsWith('props/ledgerhold/') || p.startsWith('avatar/') || p.startsWith('map/') || p.startsWith('npc/')).reduce((a, [, f]) => a + f.bytes, 0);
writeFileSync(join(root, 'ASSET_REPORT.md'), [
  '# Asset report',
  '',
  'Generated by `tools/import-assets.ts` from `../assets_v2` (read-only). Do not edit: re-run `npm run import:assets`.',
  '',
  `The art set holds about 1.4 GB of masters. The game ships **${Object.keys(files).length} files, ${mb(total)} MB**, as WebP at the sizes it draws (canvas 1280×720, stage 640×360).`,
  '',
  '| Group | Files | MB |',
  '|---|---:|---:|',
  ...Object.entries(groups).sort((a, b) => b[1][1] - a[1][1]).map(([g, [n, b]]) => `| ${label[g] ?? g} | ${n} | ${mb(b)} |`),
  `| **Total** | **${Object.keys(files).length}** | **${mb(total)}** |`,
  '',
  `Art needed before the hub shows (Ledgerhold, the avatar, NPCs and the world map): about ${mb(firstLoad)} MB. Districts, monsters, bosses and battle art load when you go there.`,
  '',
  '## What is left out',
  '',
  '- Everything `manifest.json` marks `runtime: false`: sources, tools, green-screen masters, MP4 masters, review sheets and `_set-aside/`.',
  '- The WebM clips. The game plays the 16-frame sprite sheets instead: WebM with transparency does not play in iPad Safari.',
  '- Per-instance prop renders (`objects/NN-*.png`). Props are drawn from one image per prop type and placed from `objects.json`. The two arena arch halves have no prop image, so their placed renders are used.',
  '- The 1080p and 4K world maps and the 2560 px battle backgrounds.',
  '',
  '## Notes',
  '',
  ...(notes.length ? notes.map((n) => `- ${n}`) : ['- None.']),
  '',
].join('\n'));
console.log(`assets: ${Object.keys(files).length} files, ${mb(total)} MB (${encoded} encoded this run)`);
