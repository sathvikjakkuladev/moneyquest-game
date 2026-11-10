// One world screen's live room (one shard of it): players from classes with world mode on. Pure
// logic, tested directly; the WorldScreen Durable Object wraps it with sockets.
//
// Each player sees at most WORLD_VISIBLE players from OTHER classes, the nearest ones (classmates are
// shown by their class's own room). Who-sees-whom is worked out again whenever someone arrives,
// leaves or moves; changes go out as join and leave messages, positions in batches.
import type { ClientMsg, Face, PlayerView } from '../../src/net/protocol.ts';
import { plausibleMove, take } from '../../src/net/protocol.ts';
import { SAY_HISTORY } from '../../src/net/says.ts';
import { WORLD_VISIBLE } from '../../src/net/world.ts';
import type { Conn, Out, ReportOut, Said } from './hub.ts';
import { MAX_STRIKES, RATES } from './hub.ts';

export interface WConn extends Conn {
  classId: string;
  /** Who this player currently sees (pids), so changes can be sent as joins and leaves. */
  sees: number[];
}

export interface WorldMember { id: string; class_id: string; name: string; muted: number }

export class WorldHub {
  conns = new Map<number, WConn>();
  dirty = new Set<number>();
  private next = 1;
  readonly screen: string;

  constructor(screen: string) {
    this.screen = screen;
  }

  newPid(): number {
    return this.next++;
  }
  restore(c: WConn): void {
    this.conns.set(c.pid, c);
    this.reserve(c.pid);
  }
  reserve(pid: number): void {
    this.next = Math.max(this.next, pid + 1);
  }

  view(c: WConn): PlayerView {
    return { id: c.pid, n: c.name, s: c.s, x: c.x, y: c.y, f: c.f, h: c.h, p: c.p, b: c.b };
  }

  /** The nearest players from other classes, at most WORLD_VISIBLE, nearest first. */
  visibleTo(v: WConn): number[] {
    return [...this.conns.values()]
      .filter((c) => c.classId !== v.classId)
      .map((c) => [c.pid, (c.x - v.x) ** 2 + (c.y - v.y) ** 2] as const)
      .sort((a, b) => a[1] - b[1] || a[0] - b[0])
      .slice(0, WORLD_VISIBLE)
      .map(([pid]) => pid);
  }

  /** Recompute who sees whom; returns the joins and leaves. `skip` already got a full snapshot. */
  private refresh(skip?: number): Out[] {
    const out: Out[] = [];
    for (const v of this.conns.values()) {
      const now = this.visibleTo(v);
      if (v.pid !== skip) {
        for (const id of v.sees) if (!now.includes(id)) out.push({ to: v.pid, msg: { t: 'leave', id } });
        for (const id of now) if (!v.sees.includes(id)) out.push({ to: v.pid, msg: { t: 'join', p: this.view(this.conns.get(id)!) } });
      }
      v.sees = now;
    }
    return out;
  }

  /** A connection proved its membership (and that world mode is on for it). */
  hello(pid: number, m: WorldMember, msg: Extract<ClientMsg, { t: 'hello' }>, now: number): Out[] {
    const c: WConn = {
      pid, memberId: m.id, classId: m.class_id, name: m.name, muted: !!m.muted,
      s: this.screen, x: msg.x, y: msg.y, f: msg.f, h: msg.h, p: msg.p, b: msg.b,
      lastMove: now, moves: { tokens: RATES.move[1], at: now }, other: { tokens: RATES.other[1], at: now },
      says: { tokens: RATES.say[1], at: now }, reports: { tokens: RATES.report[1], at: now }, said: [], strikes: 0, sees: [],
    };
    this.conns.set(pid, c);
    c.sees = this.visibleTo(c);
    return [{ to: pid, msg: { t: 'welcome', you: pid, players: c.sees.map((id) => this.view(this.conns.get(id)!)) } }, ...this.refresh(pid)];
  }

  handle(pid: number, msg: ClientMsg | null, now: number): { out: Out[]; close?: boolean; report?: ReportOut & { targetClassId: string } } {
    const c = this.conns.get(pid);
    if (!c) return { out: [] };
    const strike = () => ({ out: [], close: ++c.strikes > MAX_STRIKES });
    if (!msg || msg.t === 'hello') return strike();
    if (msg.t === 'screen') {
      // A world room is one screen: changing screens means a new connection. The same screen is a
      // jump (back from a battle).
      if (msg.s !== this.screen || !take(c.other, now, RATES.other[0], RATES.other[1])) return strike();
      Object.assign(c, { x: msg.x, y: msg.y, f: msg.f, lastMove: now });
      this.dirty.add(pid);
      return { out: [] };
    }

    if (msg.t === 'move') {
      if (!take(c.moves, now, RATES.move[0], RATES.move[1])) return strike();
      if (!plausibleMove(c, msg, now - c.lastMove)) return strike();
      Object.assign(c, { x: msg.x, y: msg.y, f: msg.f, lastMove: now });
      this.dirty.add(pid);
      return { out: [] };
    }
    if (msg.t === 'say') {
      if (!take(c.says, now, RATES.say[0], RATES.say[1])) return strike();
      if (c.muted) return { out: [] };
      c.said = [...c.said, [msg.k, msg.i, now, c.s] as Said].slice(-SAY_HISTORY);
      return { out: this.viewersOf(pid).map((to) => ({ to, msg: { t: 'say' as const, id: pid, k: msg.k, i: msg.i } })) };
    }
    if (msg.t === 'report') {
      if (!take(c.reports, now, RATES.report[0], RATES.report[1])) return strike();
      const target = this.conns.get(msg.id);
      if (!target || target.pid === pid) return { out: [] };
      return {
        out: [{ to: pid, msg: { t: 'reported', id: msg.id } }],
        report: { targetMemberId: target.memberId, targetClassId: target.classId, history: target.said.map(([k, i, at, s]) => ({ kind: k === 'e' ? 'emote' : 'phrase', i, at, screen: s })) },
      };
    }
    if (!take(c.other, now, RATES.other[0], RATES.other[1])) return strike();
    Object.assign(c, { h: msg.h, p: msg.p, b: msg.b });
    return { out: this.viewersOf(pid).map((to) => ({ to, msg: { t: 'look' as const, id: pid, h: c.h, p: c.p, b: c.b } })) };
  }

  private viewersOf(pid: number): number[] {
    return [...this.conns.values()].filter((v) => v.sees.includes(pid)).map((v) => v.pid);
  }

  /** A connection closed: those who saw it hear it left, and may now see someone else instead. */
  leave(pid: number): Out[] {
    if (!this.conns.has(pid)) return [];
    const gone: Out[] = this.viewersOf(pid).map((to) => ({ to, msg: { t: 'leave', id: pid } }));
    this.conns.delete(pid);
    this.dirty.delete(pid);
    for (const v of this.conns.values()) v.sees = v.sees.filter((id) => id !== pid);
    return [...gone, ...this.refresh()];
  }

  /** Batched positions, plus joins and leaves as people move nearer or further away. */
  flush(): Out[] {
    const moved = new Set(this.dirty);
    this.dirty.clear();
    const before = new Map([...this.conns.values()].map((v) => [v.pid, new Set(v.sees)]));
    const out = this.refresh();
    for (const v of this.conns.values()) {
      const was = before.get(v.pid)!;
      const m: [number, number, number, Face][] = [];
      for (const id of v.sees) if (moved.has(id) && was.has(id)) { const c = this.conns.get(id)!; m.push([id, c.x, c.y, c.f]); }
      if (m.length) out.push({ to: v.pid, msg: { t: 'state', m } });
    }
    return out;
  }

  /** Connections to close: one student (blocked from world mode), or a whole class (world mode switched off). */
  pidsOf(sel: { memberId?: string; classId?: string }): number[] {
    return [...this.conns.values()].filter((c) => (sel.memberId && c.memberId === sel.memberId) || (sel.classId && c.classId === sel.classId)).map((c) => c.pid);
  }
}

