// Typed access to the data the asset importer writes (src/data/v2/*.json, generated from
// ../assets_v2). Free of Phaser and React. All positions are on the 640×360 stage.
import avatarJson from './v2/avatar.json';
import battleJson from './v2/battle.json';
import creaturesJson from './v2/creatures.json';
import hatsJson from './v2/hats.json';
import screensJson from './v2/screens.json';
import vfxJson from './v2/vfx.json';
import worldJson from './v2/world.json';

export type View = 'front' | 'back' | 'left' | 'right';

export interface Clip { image: string; cell: [number, number]; frames: number; cols: number; foot: [number, number]; fps: number; head?: number[][]; view?: 'front' | 'back' }
export interface Layer { i: number; layer: string; image: string; off: [number, number]; w: number; h: number }
export interface CostumeShift { h?: number; s_mul?: number; s_add?: number; v_mul?: number }
export interface CostumeSet { id: string; name: string; default?: boolean; map: Record<string, CostumeShift> }
export interface AvatarData {
  skin: string[];
  eyes: { name: string; hex: string }[];
  hairColours: { name: string; hex: string }[];
  hairStyles: string[];
  faces: string[];
  neat: number;
  hairTintBase: number;
  skinBase: [number, number, number];
  templates: Record<'front' | 'back', { top: number; cx: number; w: number }>;
  clips: Record<string, Clip>;
  layers: Record<'front' | 'back', Record<string, Layer[]>>;
  costume: { groups: Record<string, { h: [number, number]; s: [number, number]; v: [number, number] }>; order: string[]; neck: number; sets: CostumeSet[] };
}
export const AVATAR = avatarJson as unknown as AvatarData;

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export interface HatArt { id: string; art: string; rarity: Rarity; rewardOnly: boolean; kind: string; hairRule: 'swap' | 'show'; icon: string; views: Record<'front' | 'back', { image: string; off: [number, number]; w: number; h: number }> }
export const HATS = (hatsJson as unknown as { hats: HatArt[] }).hats;
export const hatArt = (id: string | null | undefined) => (id ? HATS.find((h) => h.id === id) : undefined);

export interface PropAt { p: string; x: number; y: number; w: number; h: number; flip?: boolean }
export interface Door { kind: 'door' | 'interact'; target: string; rect: [number, number, number, number] }
export interface ScreenArt { name: string; over: boolean; props: PropAt[]; doors: Door[]; arch?: { opening: [number, number]; lintel: number } }
export interface LocationArt { grid: [number, number]; boss: string | null; monsters: string[]; arrival: { screen: string; at: [number, number] }; screens: Record<string, ScreenArt> }
export const LOCATIONS = (screensJson as unknown as { locations: Record<string, LocationArt> }).locations;

export interface Pin { x: number; y: number; r: number; kind: 'hub' | 'district'; boss: string | null; order: number }
export const WORLD = worldJson as unknown as { image: string; pins: Record<string, Pin> };

export const BATTLE = battleJson as unknown as { floorTop: number; feetY: number; playerX: number; enemyX: number; hudTop: number; backgrounds: Record<string, string> };

export const CREATURES = creaturesJson as unknown as {
  monsters: Record<string, { looks: string[] }>;
  bosses: Record<string, { clips: Record<string, Clip> }>;
  npcs: Record<string, { talk: Clip | null }>;
};

export interface Vfx { image: string; frame: number; frames: number; fps: number; loop: boolean; about: string }
export const VFX = vfxJson as unknown as Record<string, Vfx>;

/** Art paths (relative to the assets base path). */
export const art = {
  ground: (loc: string, screen: string) => `loc/${loc}/${screen}.webp`,
  over: (loc: string, screen: string) => `loc/${loc}/${screen}-over.webp`,
  prop: (loc: string, p: string) => `props/${loc}/${p.replace('@', '-at-')}.webp`,
  monster: (species: string, look: string, view: View | 'portrait') => `mon/${species}/${look}-${view}.webp`,
  boss: (boss: string, view: View | 'portrait') => `boss/${boss}/${view}.webp`,
  npc: (npc: string, view: View | 'portrait') => `npc/${npc}/${view}.webp`,
};
