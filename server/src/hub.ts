// A class's live room: who's connected, which screen they're on, where they stand. Pure logic (no
// Cloudflare APIs) so it can be tested directly; the ClassRoom Durable Object wraps it with sockets.
// Every change returns the messages to send; positions go out in batches (flush, ~5 times a second)
// and only to players on the same screen.
import type { Bucket, ClientMsg, Face, Look, PlayerView, Pose, ServerMsg } from '../../src/net/protocol.ts';
import { plausibleMove, take } from '../../src/net/protocol.ts';

export interface Conn extends Pose, Look {
  pid: number;
  memberId: string;
  name: string;
  muted: boolean;
  lastMove: number;
  moves: Bucket;
  other: Bucket;
  strikes: number;
}

export interface Out { to: number; msg: ServerMsg }
export interface Member { id: string; public_name: string; muted: number }

/** Moves: 6 a second (bursts of 10). Screen changes and look changes: 2 a second (bursts of 4). */
export const RATES = { move: [6, 10], other: [2, 4] } as const;
/** Bad or over-limit messages tolerated before the connection is closed. */
export const MAX_STRIKES = 40;

export class Hub {
  conns = new Map<number, Conn>();
  dirty = new Set<number>();
  private next = 1;

  newPid(): number {
    return this.next++;
  }

  /** After the Durable Object wakes from hibernation: put a connection back from its attachment. */
  restore(c: Conn): void {
    this.conns.set(c.pid, c);
    this.reserve(c.pid);
  }

  /** Make sure new ids come after one that's already in use. */
  reserve(pid: number): void {
    this.next = Math.max(this.next, pid + 1);
  }

  view(c: Conn): PlayerView {
    return { id: c.pid, n: c.name, s: c.s, x: c.x, y: c.y, f: c.f, h: c.h, p: c.p, b: c.b };
  }

  private onScreen(s: string, except?: number): Conn[] {
    return s ? [...this.conns.values()].filter((c) => c.s === s && c.pid !== except) : [];
  }

  /** A connection proved its membership. Returns its welcome and the join for everyone on its screen. */
  hello(pid: number, m: Member, msg: Extract<ClientMsg, { t: 'hello' }>, now: number): Out[] {
    const c: Conn = {
      pid, memberId: m.id, name: m.public_name, muted: !!m.muted,
      s: msg.s, x: msg.x, y: msg.y, f: msg.f, h: msg.h, p: msg.p, b: msg.b,
      lastMove: now, moves: { tokens: RATES.move[1], at: now }, other: { tokens: RATES.other[1], at: now }, strikes: 0,
    };
    this.conns.set(pid, c);
    const peers = this.onScreen(c.s, pid);
    return [{ to: pid, msg: { t: 'welcome', you: pid, players: peers.map((p) => this.view(p)) } }, ...peers.map((p) => ({ to: p.pid, msg: { t: 'join' as const, p: this.view(c) } }))];
  }

  /** Handle one validated message. `close` is set when the connection should be dropped. */
  handle(pid: number, msg: ClientMsg | null, now: number): { out: Out[]; close?: boolean } {
    const c = this.conns.get(pid);
    if (!c) return { out: [] };
    const strike = () => ({ out: [], close: ++c.strikes > MAX_STRIKES });
    if (!msg || msg.t === 'hello') return strike();

    if (msg.t === 'move') {
      if (!c.s || !take(c.moves, now, RATES.move[0], RATES.move[1])) return strike();
      if (!plausibleMove(c, msg, now - c.lastMove)) return strike(); // too fast: ignore it
      Object.assign(c, { x: msg.x, y: msg.y, f: msg.f, lastMove: now });
      this.dirty.add(pid);
      return { out: [] };
    }
    if (!take(c.other, now, RATES.other[0], RATES.other[1])) return strike();

    if (msg.t === 'screen') {
      const out: Out[] = [];
      if (msg.s !== c.s) {
        for (const p of this.onScreen(c.s, pid)) out.push({ to: p.pid, msg: { t: 'leave', id: pid } });
        Object.assign(c, { s: msg.s, x: msg.x, y: msg.y, f: msg.f, lastMove: now });
        this.dirty.delete(pid);
        const peers = this.onScreen(c.s, pid);
        out.push({ to: pid, msg: { t: 'here', players: peers.map((p) => this.view(p)) } });
        for (const p of peers) out.push({ to: p.pid, msg: { t: 'join', p: this.view(c) } });
      } else {
        // Same screen (e.g. back from a battle): treat as a jump to the new spot.
        Object.assign(c, { x: msg.x, y: msg.y, f: msg.f, lastMove: now });
        this.dirty.add(pid);
      }
      return { out };
    }
    // look: hat, pet, in battle
    Object.assign(c, { h: msg.h, p: msg.p, b: msg.b });
    return { out: this.onScreen(c.s, pid).map((p) => ({ to: p.pid, msg: { t: 'look' as const, id: pid, h: c.h, p: c.p, b: c.b } })) };
  }

  /** A connection closed (or was replaced): tell its screen. */
  leave(pid: number): Out[] {
    const c = this.conns.get(pid);
    if (!c) return [];
    this.conns.delete(pid);
    this.dirty.delete(pid);
    return this.onScreen(c.s).map((p) => ({ to: p.pid, msg: { t: 'leave', id: pid } }));
  }

  /** The batched position updates since the last flush, one message per player on each busy screen. */
  flush(): Out[] {
    const byScreen = new Map<string, [number, number, number, Face][]>();
    for (const pid of this.dirty) {
      const c = this.conns.get(pid);
      if (!c?.s) continue;
      const m = byScreen.get(c.s) ?? [];
      m.push([c.pid, c.x, c.y, c.f]);
      byScreen.set(c.s, m);
    }
    this.dirty.clear();
    const out: Out[] = [];
    for (const [s, m] of byScreen) for (const p of this.onScreen(s)) out.push({ to: p.pid, msg: { t: 'state', m: m.filter((r) => r[0] !== p.pid) } });
    return out.filter((o) => o.msg.t !== 'state' || o.msg.m.length > 0);
  }

  /** Who's online and where (for the teacher dashboard, Phase 4). */
  roster(): { memberId: string; name: string; screen: string; busy: boolean }[] {
    return [...this.conns.values()].map((c) => ({ memberId: c.memberId, name: c.name, screen: c.s, busy: c.b }));
  }
}
