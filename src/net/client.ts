// A connection to the server: the class's room, or (world mode) one world screen. It sends the
// player's position only while moving (about 4 times a second, plus one when they stop), keeps the
// list of players on the same screen up to date, and reconnects quietly with backoff if the network
// drops. World players are kept under negative ids so they never clash with classmates.
// Only loaded when VITE_MP_URL is set.
import type { Membership } from '../core/save.ts';
import { bridge, ME, publishGoal, publishPeople, useNet } from './bridge.ts';
import type { Remote, Report } from './bridge.ts';
import { addSample } from './interp.ts';
import type { Face, Look, PlayerView, ServerMsg } from './protocol.ts';
import { CLOSE, MOVE_INTERVAL_MS, parseServer } from './protocol.ts';
import { MAX_SHARDS } from './world.ts';
import type { SayKind } from './says.ts';
import { SAY_COOLDOWN_MS, sayValid } from './says.ts';

const PING_MS = 25_000;
const JUMP = 64; // a bigger step than this between reports is a jump (back from a battle), not a walk

export interface ConnEvents {
  notMember: () => void;
  /** The class room says world mode is on or off for this student. */
  world?: (on: boolean) => void;
}

/** A world screen to join instead of the class room. */
export interface WorldTarget { screen: string }

export class ClassConnection {
  private url: string;
  private token: string;
  private events: ConnEvents;
  private ws: WebSocket | null = null;
  private ready = false;
  private stopped = false;
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private me: { s: string; x: number; y: number; f: Face } & Look = { s: '', x: 0, y: 0, f: 0, h: null, p: null, b: false };
  private sent = { s: '', x: -1, y: -1, f: 0 as Face, at: 0 };
  private lastSay = -Infinity;
  private base: string;
  private world: WorldTarget | null;
  private shard = 0;
  private sign: 1 | -1;

  constructor(m: Membership, events: ConnEvents, world: WorldTarget | null = null) {
    this.base = m.url.replace(/^http/, 'ws');
    this.url = `${this.base}/ws/class/${encodeURIComponent(m.classCode)}`;
    this.token = m.token;
    this.events = events;
    this.world = world;
    this.sign = world ? -1 : 1;
    if (world) Object.assign(this.me, { s: world.screen });
    this.open();
  }

  /** The id the game uses for a server id (world players are negative). */
  private key(id: number): number {
    return this.sign * id;
  }
  private mine(key: number): boolean {
    return Math.sign(key) === this.sign;
  }
  private setStatus(st: 'connecting' | 'online' | 'offline' | 'off' | 'full'): void {
    if (this.world) useNet.setState({ worldStatus: st === 'offline' ? 'connecting' : st });
    else if (st !== 'full') useNet.setState({ status: st });
  }

  private open(): void {
    this.setStatus('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.world ? `${this.base}/ws/world/${this.world.screen}/${this.shard}` : this.url);
    } catch {
      return this.retry();
    }
    this.ws = ws;
    ws.onopen = () => {
      this.send({ t: 'hello', token: this.token, ...this.me });
      this.sent = { s: this.me.s, x: this.me.x, y: this.me.y, f: this.me.f, at: performance.now() };
      this.ready = true;
      this.retries = 0;
      this.setStatus('online');
      this.pingTimer = setInterval(() => this.ws?.readyState === WebSocket.OPEN && this.ws.send('{"t":"ping"}'), PING_MS);
    };
    ws.onmessage = (e) => this.onMessage(parseServer(e.data));
    ws.onclose = (e) => {
      this.cleanup();
      if (this.stopped) return;
      if (this.world) {
        if (e.code === CLOSE.full && this.shard + 1 < MAX_SHARDS) return this.shard++, this.open(); // try the next shard
        if (e.code === CLOSE.full) return this.stop(), this.setStatus('full'); // every shard of this screen is busy
        if (e.code === CLOSE.noWorld || e.code === CLOSE.notMember || e.code === CLOSE.replaced) return this.stop();
        return this.retry();
      }
      if (e.code === CLOSE.notMember) return this.stop(), this.events.notMember(); // removed, token reset, or class deleted
      if (e.code === CLOSE.replaced) return this.stop(), this.setStatus('offline'); // opened in another tab or device
      this.retry();
    };
    ws.onerror = () => {}; // onclose follows
  }

  /** Reconnect after 1, 2, 4… up to 30 seconds (with jitter), without bothering the player. */
  private retry(): void {
    this.setStatus('offline');
    const ms = Math.min(30_000, 1000 * 2 ** this.retries++) * (0.75 + Math.random() * 0.5);
    this.retryTimer = setTimeout(() => !this.stopped && this.open(), ms);
  }

  private cleanup(): void {
    this.ready = false;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.ws = null;
    for (const id of [...bridge.remotes.keys()]) if (this.mine(id)) bridge.remotes.delete(id);
    useNet.setState((n) => ({ says: Object.fromEntries(Object.entries(n.says).filter(([id]) => !this.mine(Number(id)))), open: typeof n.open === 'number' && this.mine(n.open) ? null : n.open }));
    publishPeople();
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    const ws = this.ws;
    this.cleanup();
    try {
      ws?.close(1000, 'Bye');
    } catch {
      /* already closed */
    }
    this.setStatus('off');
  }

  private send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** The player's screen and position, every frame from RoomScene ('' when off any screen). */
  report(r: Report): void {
    if (this.world && r.s !== this.world.screen) return; // a world connection is one screen; the session opens a new one
    const me = this.me, newScreen = r.s !== me.s;
    Object.assign(me, { s: r.s, x: r.x, y: r.y, f: r.f });
    if (!this.ready) return;
    const now = performance.now(), last = this.sent;
    const jump = Math.hypot(r.x - last.x, r.y - last.y) > JUMP;
    if (newScreen || (jump && !r.moving)) {
      this.send({ t: 'screen', s: r.s, x: r.x, y: r.y, f: r.f });
      this.sent = { s: r.s, x: r.x, y: r.y, f: r.f, at: now };
      return;
    }
    if (!r.s || (r.x === last.x && r.y === last.y && r.f === last.f)) return;
    if (r.moving && now - last.at < MOVE_INTERVAL_MS) return; // throttle while walking; send at once when stopping
    this.send({ t: 'move', x: r.x, y: r.y, f: r.f });
    this.sent = { s: r.s, x: r.x, y: r.y, f: r.f, at: now };
  }

  /** Hat, pet and "in battle" (shown as ⚔ over the player). */
  setLook(l: Look): void {
    const me = this.me;
    if (me.h === l.h && me.p === l.p && me.b === l.b) return;
    Object.assign(me, l);
    if (this.ready) this.send({ t: 'look', ...l });
  }

  /** An emote or phrase, at most one every SAY_COOLDOWN_MS (the server enforces it too). Shown over
   *  your own head at once; muted players' says are never sent. */
  say(k: SayKind, i: number): boolean {
    const now = performance.now();
    if (!this.ready || !this.me.s || useNet.getState().muted || !sayValid(k, i) || now - this.lastSay < SAY_COOLDOWN_MS) return false;
    this.lastSay = now;
    this.send({ t: 'say', k, i });
    if (!this.world) useNet.setState((n) => ({ says: { ...n.says, [ME]: { k, i, at: Date.now() } } })); // your own bubble, once
    return true;
  }

  /** Report a player to the teacher. The server attaches what that player said recently. */
  flag(id: number): void {
    this.send({ t: 'report', id });
  }

  private remote(p: PlayerView, now: number): Remote {
    return { id: this.key(p.id), name: p.n, world: !!this.world, s: p.s, x: p.x, y: p.y, f: p.f, h: p.h, p: p.p, b: p.b, samples: [{ t: now, x: p.x, y: p.y }] };
  }

  private onMessage(msg: ServerMsg | null): void {
    if (!msg) return;
    const now = performance.now();
    const R = bridge.remotes;
    switch (msg.t) {
      case 'welcome':
      case 'here':
        if (msg.t === 'welcome' && !this.world) useNet.setState({ muted: false }); // a 'muted' message follows if the teacher muted you
        for (const id of [...R.keys()]) if (this.mine(id)) R.delete(id);
        useNet.setState((n) => ({ says: Object.fromEntries(Object.entries(n.says).filter(([id]) => !this.mine(Number(id)) || Number(id) === ME)) }));
        for (const p of msg.players) R.set(this.key(p.id), this.remote(p, now));
        break;
      case 'join':
        R.set(this.key(msg.p.id), this.remote(msg.p, now));
        break;
      case 'leave': {
        const id = this.key(msg.id);
        R.delete(id);
        useNet.setState((n) => {
          const { [id]: _gone, ...says } = n.says;
          return { says, open: n.open === id ? null : n.open };
        });
        break;
      }
      case 'state':
        for (const [sid, x, y, f] of msg.m) {
          const r = R.get(this.key(sid));
          if (!r) continue;
          addSample(r.samples, { t: now, x, y });
          Object.assign(r, { x, y, f });
        }
        return; // positions only: the list of people didn't change
      case 'look': {
        const r = R.get(this.key(msg.id));
        if (r) Object.assign(r, { h: msg.h, p: msg.p, b: msg.b });
        break;
      }
      case 'say': {
        const id = this.key(msg.id);
        if (R.has(id)) useNet.setState((n) => ({ says: { ...n.says, [id]: { k: msg.k, i: msg.i, at: Date.now() } } }));
        return;
      }
      case 'muted':
        useNet.setState({ muted: msg.on });
        return;
      case 'reported':
        useNet.setState((n) => ({ reported: [...n.reported, this.key(msg.id)] }));
        return;
      case 'world':
        this.events.world?.(msg.on);
        return;
      case 'goal':
        publishGoal({ n: msg.n, of: msg.of });
        return;
    }
    publishPeople();
  }
}
