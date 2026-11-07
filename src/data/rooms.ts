// Overworld rooms: each location is a few connected screens. Layouts are game-side
// (src/data/rooms/<zone>.json, 640×360), seeded from the pack's rooms.json plus collision.

import type { Poly, Pt } from '../core/geometry.ts';

export type Facing = 'south' | 'north' | 'east' | 'west';
export interface RoomExit { edge: 'left' | 'right' | 'top' | 'bottom'; range: [number, number]; to: string; enterAt: Pt | null }
export interface RoomNpc { id: string; sprite: string; x: number; y: number; face: Facing }
export interface RoomMonster { id: string; x: number; y: number }
export interface Portal { at: Pt; color: string; to: string }
export interface Screen { exits: RoomExit[]; entries: Record<string, Pt>; walk: Poly[]; block: Poly[]; npcs: RoomNpc[]; monsters: RoomMonster[]; portals?: Portal[] }
export interface Rooms { zone: string; start: string; screens: Record<string, Screen> }

const files = import.meta.glob<Rooms>('./rooms/*.json', { eager: true, import: 'default' });
export const ROOMS: Record<string, Rooms> = Object.fromEntries(Object.values(files).map((r) => [r.zone, r]));

/** The bonus-zone portals on the Crossroads portal ring: stand in front of one to step through. */
export const PORTAL_REACH = 34;
export const portalSpot = (p: Portal): Pt => [p.at[0], 150];

export const EXIT_STRIP = 14; // px along the screen edge that triggers an exit

export function exitAt(s: Screen, [x, y]: Pt): RoomExit | null {
  for (const e of s.exits) {
    const along = e.edge === 'left' || e.edge === 'right' ? y : x;
    if (along < e.range[0] || along > e.range[1]) continue;
    if ((e.edge === 'left' && x <= EXIT_STRIP) || (e.edge === 'right' && x >= 640 - EXIT_STRIP) || (e.edge === 'top' && y <= EXIT_STRIP) || (e.edge === 'bottom' && y >= 360 - EXIT_STRIP)) return e;
  }
  return null;
}

/** An exit's target: same-zone screen, another zone's screen ("zone/screen"), or the world map. */
export function exitTarget(zone: string, e: RoomExit): { kind: 'world' } | { kind: 'room'; zone: string; screen: string } {
  if (e.to === 'world_map') return { kind: 'world' };
  const [z, s] = e.to.includes('/') ? (e.to.split('/') as [string, string]) : [zone, e.to];
  return { kind: 'room', zone: z, screen: s };
}
