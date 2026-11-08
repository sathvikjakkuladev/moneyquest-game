// A class's live room: who's connected, which screen they're on, where they stand. Pure logic (no
// Cloudflare APIs) so it can be tested directly; the ClassRoom Durable Object wraps it with sockets.
// Every change returns the messages to send; positions go out in batches (flush, ~5 times a second)
// and only to players on the same screen.
import type { Bucket, ClientMsg, Face, Look, PlayerView, Pose, ServerMsg } from '../../src/net/protocol.ts';
import { plausibleMove, take } from '../../src/net/protocol.ts';
import type { SayKind } from '../../src/net/says.ts';
import { SAY_HISTORY } from '../../src/net/says.ts';

/** One thing a player said: kind, index, when, and on which screen. */
export type Said = [k: SayKind, i: number, at: number, s: string];
/** What a report stores: the reported player's recent says, as the server saw them. */
export interface ReportOut { targetMemberId: string; history: { kind: 'emote' | 'phrase'; i: number; at: number; screen: string }[] }

export interface Conn extends Pose, Look {
  pid: number;
  memberId: string;
  name: string;
  muted: boolean;
  lastMove: number;
  moves: Bucket;
  other: Bucket;
  says: Bucket;
  reports: Bucket;
  said: Said[];
  strikes: number;
}

export interface Out { to: number; msg: ServerMsg }
export interface Member { id: string; public_name: string; muted: number }

/** Moves: 6 a second (bursts of 10). Screen and look changes: 2 a second (bursts of 4). Emotes and
 *  phrases: one every 3 seconds (bursts of 2). Reports: 3 a minute. */
export const RATES = { move: [6, 10], other: [2, 4], say: [1 / 3, 2], report: [1 / 20, 3] } as const;
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
      lastMove: now, moves: { tokens: RATES.move[1], at: now }, other: { tokens: RATES.other[1], at: now },
      says: { tokens: RATES.say[1], at: now }, reports: { tokens: RATES.report[1], at: now }, said: [], strikes: 0,
    };
    this.conns.set(pid, c);
    const peers = this.onScreen(c.s, pid);
    return [
      { to: pid, msg: { t: 'welcome', you: pid, players: peers.map((p) => this.view(p)) } },
      ...(c.muted ? [{ to: pid, msg: { t: 'muted' as const, on: true } }] : []),
      ...peers.map((p) => ({ to: p.pid, msg: { t: 'join' as const, p: this.view(c) } })),
    ];
  }

  /** Handle one validated message. `close` is set when the connection should be dropped. */
  handle(pid: number, msg: ClientMsg | null, now: number): { out: Out[]; close?: boolean; report?: ReportOut } {
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
    if (msg.t === 'say') {
      if (!take(c.says, now, RATES.say[0], RATES.say[1])) return strike();
      if (!c.s || c.muted) return { out: [] }; // muted by the teacher: dropped for everyone
      c.said = [...c.said, [msg.k, msg.i, now, c.s] as Said].slice(-SAY_HISTORY);
      return { out: this.onScreen(c.s, pid).map((p) => ({ to: p.pid, msg: { t: 'say' as const, id: pid, k: msg.k, i: msg.i } })) };
    }
    if (msg.t === 'report') {
      if (!take(c.reports, now, RATES.report[0], RATES.report[1])) return strike();
      const target = this.conns.get(msg.id);
      if (!target || target.pid === pid) return { out: [] };
      return {
        out: [{ to: pid, msg: { t: 'reported', id: msg.id } }],
        report: { targetMemberId: target.memberId, history: target.said.map(([k, i, at, s]) => ({ kind: k === 'e' ? 'emote' : 'phrase', i, at, screen: s })) },
      };
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

  /** The teacher muted or unmuted a student: their emotes and phrases stop (or start) reaching others. */
  setMuted(memberId: string, on: boolean): { out: Out[]; pids: number[] } {
    const pids = [...this.conns.values()].filter((c) => c.memberId === memberId).map((c) => ((c.muted = on), c.pid));
    return { out: pids.map((to) => ({ to, msg: { t: 'muted', on } })), pids };
  }

  /** Connections to close: one student's (removed by the teacher), or everyone's (class deleted). */
  pidsOf(memberId: string | null): number[] {
    return [...this.conns.values()].filter((c) => memberId === null || c.memberId === memberId).map((c) => c.pid);
  }

  /** Who's online and where (for the teacher dashboard, Phase 4). */
  roster(): { memberId: string; name: string; screen: string; busy: boolean }[] {
    return [...this.conns.values()].map((c) => ({ memberId: c.memberId, name: c.name, screen: c.s, busy: c.b }));
  }
}
