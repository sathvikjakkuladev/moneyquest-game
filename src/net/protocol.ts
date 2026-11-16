// The multiplayer wire format, shared by the game and the server (no browser or Workers APIs here).
// Everything is validated strictly on both sides: unknown types, extra-large messages, bad numbers
// or unknown screens are dropped. No free text exists in it: names come from the server's records
// (generated or teacher-listed), hats/pets are item ids the game checks against its own list, the
// look is a short list of indexes into the game's option lists, and emotes and phrases are numbers
// into the lists in says.ts.
import type { SayKind } from './says.ts';
import { sayValid } from './says.ts';

/** Every screen a player can be on ('' = not on a screen: world map, title, loading). */
export const SCREENS = [
  'coinfall-docks/0-0', 'coinfall-docks/0-1', 'coinfall-docks/1-0', 'coinfall-docks/1-1',
  'compound-rift/0-0', 'compound-rift/0-1', 'compound-rift/1-0', 'compound-rift/1-1',
  'credit-citadel/0-0', 'credit-citadel/0-1', 'credit-citadel/1-0', 'credit-citadel/1-1',
  'frostvault/0-0', 'frostvault/0-1', 'frostvault/1-0', 'frostvault/1-1',
  'ledgerhold/0-0', 'ledgerhold/0-1', 'ledgerhold/0-2', 'ledgerhold/1-0', 'ledgerhold/1-1', 'ledgerhold/1-2', 'ledgerhold/2-0', 'ledgerhold/2-1', 'ledgerhold/2-2',
  'phish-fens/0-0', 'phish-fens/0-1', 'phish-fens/1-0', 'phish-fens/1-1',
  'the-exchange/0-0', 'the-exchange/0-1', 'the-exchange/1-0', 'the-exchange/1-1',
  'the-sprawl/0-0', 'the-sprawl/0-1', 'the-sprawl/1-0', 'the-sprawl/1-1',
] as const;
const SCREEN_SET = new Set<string>(SCREENS);

export const MAX_MESSAGE = 512; // bytes; anything bigger closes the connection
export const WIDTH = 640;
export const HEIGHT = 360;
export const WALK_SPEED = 120; // px/s, the same as RoomScene
export const MOVE_INTERVAL_MS = 250; // the client sends its position about 4 times a second while moving
export const BATCH_MS = 200; // the server sends batched updates about 5 times a second

/** Facing: 0 south, 1 north, 2 east, 3 west. */
export const FACES = ['south', 'north', 'east', 'west'] as const;
export type Face = 0 | 1 | 2 | 3;

/** What the game says about itself: where it is, which way it faces, its hat and pet, in battle. */
export interface Pose { s: string; x: number; y: number; f: Face }
/** `a`: the look as indexes [skin, eyes, hair, hair colour, face, costume] (core/look.ts). `pl`: the
 *  pet's look, an index into the district list, or -1 for its home look. Both are optional so games
 *  and servers of different versions still understand each other; a missing look draws the default. */
export interface Look { h: string | null; p: string | null; b: boolean; a?: number[]; pl?: number }
/** How many options each part of the look has. Append-only: saves and other players' games hold
 *  positions in these lists. A test keeps them equal to the art set's lists. */
export const LOOK_LIMITS = [10, 10, 7, 12, 6, 8] as const;
export const PET_LOOKS = 7;
/** Just the look fields of something bigger (a connection, a player). */
export const pickLook = (l: Look): Look => ({ h: l.h, p: l.p, b: l.b, ...(l.a ? { a: l.a } : {}), ...(l.pl !== undefined ? { pl: l.pl } : {}) });
export const sameLook = (x: Look, y: Look) => x.h === y.h && x.p === y.p && x.b === y.b && (x.pl ?? -1) === (y.pl ?? -1) && (x.a ?? []).join() === (y.a ?? []).join();

export type ClientMsg =
  | ({ t: 'hello'; token: string } & Pose & Look)
  | { t: 'move'; x: number; y: number; f: Face }
  | ({ t: 'screen' } & Pose)
  | ({ t: 'look' } & Look)
  | { t: 'say'; k: SayKind; i: number }
  | { t: 'report'; id: number };

/** A player as other players see them. `id` is a small number the server hands out per connection. */
export interface PlayerView extends Pose, Look { id: number; n: string }

export type ServerMsg =
  | { t: 'welcome'; you: number; players: PlayerView[] }
  | { t: 'here'; players: PlayerView[] }
  | { t: 'join'; p: PlayerView }
  | { t: 'leave'; id: number }
  | { t: 'state'; m: [id: number, x: number, y: number, f: Face][] }
  | ({ t: 'look'; id: number } & Look)
  | { t: 'say'; id: number; k: SayKind; i: number }
  /** Your teacher turned your emotes and phrases off (or back on). */
  | { t: 'muted'; on: boolean }
  /** Your report about player `id` reached your teacher. */
  | { t: 'reported'; id: number }
  /** This week's class goal: `n` correct answers of `of`. */
  | { t: 'goal'; n: number; of: number }
  /** World mode is on (or off) for you: your class's setting, unless the admin blocked you. */
  | { t: 'world'; on: boolean };

/** WebSocket close codes the server uses. The client stops reconnecting on 4001 and 4003; on a world
 *  screen, 4009 means "this shard is full, try the next" and 4010 means "world mode isn't on for you". */
export const CLOSE = { badHello: 4000, replaced: 4001, notMember: 4003, policy: 4008, full: 4009, noWorld: 4010 } as const;

// ---------- validation ----------

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const coord = (v: unknown, max: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : null);
const face = (v: unknown): Face | null => (v === 0 || v === 1 || v === 2 || v === 3 ? v : null);
export const validScreen = (v: unknown): v is string => v === '' || (typeof v === 'string' && SCREEN_SET.has(v));
const itemId = (v: unknown): string | null | undefined => (v === null ? null : typeof v === 'string' && /^[a-z0-9:_-]{1,40}$/.test(v) ? v : undefined);

function pose(o: Record<string, unknown>): Pose | null {
  const x = coord(o.x, WIDTH), y = coord(o.y, HEIGHT), f = face(o.f);
  return validScreen(o.s) && x !== null && y !== null && f !== null ? { s: o.s, x, y, f } : null;
}
function look(o: Record<string, unknown>): Look | null {
  const h = itemId(o.h), p = itemId(o.p);
  if (h === undefined || p === undefined || typeof o.b !== 'boolean') return null;
  const out: Look = { h, p, b: o.b };
  if (o.a !== undefined) {
    const a = o.a;
    if (!Array.isArray(a) || a.length !== LOOK_LIMITS.length || !a.every((v, i) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < LOOK_LIMITS[i]!)) return null;
    out.a = a as number[];
  }
  if (o.pl !== undefined) {
    if (typeof o.pl !== 'number' || !Number.isInteger(o.pl) || o.pl < -1 || o.pl >= PET_LOOKS) return null;
    out.pl = o.pl;
  }
  return out;
}

function parse(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'string' || raw.length > MAX_MESSAGE) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return isObj(v) && typeof v.t === 'string' ? v : null;
  } catch {
    return null;
  }
}

/** Server side: a message from a game, or null if it's malformed in any way. */
export function parseClient(raw: unknown): ClientMsg | null {
  const o = parse(raw);
  if (!o) return null;
  switch (o.t) {
    case 'hello': {
      const p = pose(o), l = look(o);
      return p && l && typeof o.token === 'string' && /^m_[A-Za-z0-9_-]{20,100}$/.test(o.token) ? { t: 'hello', token: o.token, ...p, ...l } : null;
    }
    case 'move': {
      const x = coord(o.x, WIDTH), y = coord(o.y, HEIGHT), f = face(o.f);
      return x !== null && y !== null && f !== null ? { t: 'move', x, y, f } : null;
    }
    case 'screen': {
      const p = pose(o);
      return p ? { t: 'screen', ...p } : null;
    }
    case 'look': {
      const l = look(o);
      return l ? { t: 'look', ...l } : null;
    }
    case 'say':
      return sayValid(o.k, o.i) ? { t: 'say', k: o.k as SayKind, i: o.i as number } : null;
    case 'report':
      return pid(o.id) ? { t: 'report', id: o.id as number } : null;
    default:
      return null;
  }
}

const count = (v: unknown): boolean => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1e9;
const pid = (v: unknown): boolean => typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 2 ** 31;

function player(v: unknown): PlayerView | null {
  if (!isObj(v) || typeof v.id !== 'number' || !Number.isInteger(v.id) || typeof v.n !== 'string' || v.n.length > 24) return null;
  const p = pose(v), l = look(v);
  return p && l ? { id: v.id, n: v.n, ...p, ...l } : null;
}

/** Game side: a message from the server, or null (the game never trusts the server blindly either). */
export function parseServer(raw: unknown): ServerMsg | null {
  if (typeof raw !== 'string' || raw.length > 64 * 1024) return null;
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(o)) return null;
  const players = (v: unknown) => (Array.isArray(v) ? v.map(player).filter((p): p is PlayerView => p !== null) : null);
  switch (o.t) {
    case 'welcome': {
      const ps = players(o.players);
      return typeof o.you === 'number' && ps ? { t: 'welcome', you: o.you, players: ps } : null;
    }
    case 'here': {
      const ps = players(o.players);
      return ps ? { t: 'here', players: ps } : null;
    }
    case 'join': {
      const p = player(o.p);
      return p ? { t: 'join', p } : null;
    }
    case 'leave':
      return typeof o.id === 'number' ? { t: 'leave', id: o.id } : null;
    case 'state': {
      if (!Array.isArray(o.m)) return null;
      const m: [number, number, number, Face][] = [];
      for (const r of o.m) {
        if (!Array.isArray(r) || r.length !== 4 || typeof r[0] !== 'number') continue;
        const x = coord(r[1], WIDTH), y = coord(r[2], HEIGHT), f = face(r[3]);
        if (x !== null && y !== null && f !== null) m.push([r[0], x, y, f]);
      }
      return { t: 'state', m };
    }
    case 'look': {
      const l = look(o);
      return l && typeof o.id === 'number' ? { t: 'look', id: o.id, ...l } : null;
    }
    case 'say':
      return pid(o.id) && sayValid(o.k, o.i) ? { t: 'say', id: o.id as number, k: o.k as SayKind, i: o.i as number } : null;
    case 'muted':
      return typeof o.on === 'boolean' ? { t: 'muted', on: o.on } : null;
    case 'reported':
      return pid(o.id) ? { t: 'reported', id: o.id as number } : null;
    case 'world':
      return typeof o.on === 'boolean' ? { t: 'world', on: o.on } : null;
    case 'goal':
      return count(o.n) && count(o.of) && (o.of as number) > 0 ? { t: 'goal', n: o.n as number, of: o.of as number } : null;
    default:
      return null;
  }
}

/**
 * Movement check: could a player walking at WALK_SPEED (with 50% slack for timing jitter) have
 * got from `a` to `b` in `dtMs`? Messages that arrive bunched together get at least one send
 * interval's allowance each.
 */
export function plausibleMove(a: { x: number; y: number }, b: { x: number; y: number }, dtMs: number): boolean {
  const allowed = (WALK_SPEED * 1.5 * Math.max(dtMs, MOVE_INTERVAL_MS)) / 1000 + 16;
  return Math.hypot(b.x - a.x, b.y - a.y) <= allowed;
}

/** Token bucket for rate limits: `rate` per second, holding at most `burst`. Plain data, so the
 *  server can keep it in the socket attachment (it survives hibernation). */
export interface Bucket { tokens: number; at: number }
export function take(b: Bucket, now: number, rate: number, burst: number): boolean {
  b.tokens = Math.min(burst, b.tokens + ((now - b.at) / 1000) * rate);
  b.at = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}
