// The class connection: one WebSocket to the class's room on the server. It sends the player's
// position only while moving (about 4 times a second, plus one when they stop), keeps the list of
// classmates on the same screen up to date, and reconnects quietly with backoff if the network drops.
// Only loaded when VITE_MP_URL is set.
import type { Membership } from '../core/save.ts';
import { bridge, ME, publishGoal, publishPeople, useNet } from './bridge.ts';
import type { Remote, Report } from './bridge.ts';
import { addSample } from './interp.ts';
import type { Face, Look, PlayerView, ServerMsg } from './protocol.ts';
import { CLOSE, MOVE_INTERVAL_MS, parseServer } from './protocol.ts';
import type { SayKind } from './says.ts';
import { SAY_COOLDOWN_MS, sayValid } from './says.ts';

const PING_MS = 25_000;
const JUMP = 64; // a bigger step than this between reports is a jump (back from a battle), not a walk

export interface ConnEvents { notMember: () => void }

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

  constructor(m: Membership, events: ConnEvents) {
    this.url = `${m.url.replace(/^http/, 'ws')}/ws/class/${encodeURIComponent(m.classCode)}`;
    this.token = m.token;
    this.events = events;
    this.open();
  }

  private open(): void {
    useNet.setState({ status: 'connecting' });
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      return this.retry();
    }
    this.ws = ws;
    ws.onopen = () => {
      this.send({ t: 'hello', token: this.token, ...this.me });
      this.sent = { s: this.me.s, x: this.me.x, y: this.me.y, f: this.me.f, at: performance.now() };
      this.ready = true;
      this.retries = 0;
      useNet.setState({ status: 'online' });
      this.pingTimer = setInterval(() => this.ws?.readyState === WebSocket.OPEN && this.ws.send('{"t":"ping"}'), PING_MS);
    };
    ws.onmessage = (e) => this.onMessage(parseServer(e.data));
    ws.onclose = (e) => {
      this.cleanup();
      if (this.stopped) return;
      if (e.code === CLOSE.notMember) return this.stop(), this.events.notMember(); // removed, token reset, or class deleted
      if (e.code === CLOSE.replaced) return this.stop(), useNet.setState({ status: 'offline' }); // opened in another tab or device
      this.retry();
    };
    ws.onerror = () => {}; // onclose follows
  }

  /** Reconnect after 1, 2, 4… up to 30 seconds (with jitter), without bothering the player. */
  private retry(): void {
    useNet.setState({ status: 'offline' });
    const ms = Math.min(30_000, 1000 * 2 ** this.retries++) * (0.75 + Math.random() * 0.5);
    this.retryTimer = setTimeout(() => !this.stopped && this.open(), ms);
  }

  private cleanup(): void {
    this.ready = false;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.ws = null;
    bridge.remotes.clear();
    useNet.setState({ says: {}, open: null });
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
    useNet.setState({ status: 'off' });
  }

  private send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** The player's screen and position, every frame from RoomScene ('' when off any screen). */
  report(r: Report): void {
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
    useNet.setState((n) => ({ says: { ...n.says, [ME]: { k, i, at: Date.now() } } }));
    return true;
  }

  /** Report a player to the teacher. The server attaches what that player said recently. */
  flag(id: number): void {
    this.send({ t: 'report', id });
  }

  private remote(p: PlayerView, now: number): Remote {
    return { id: p.id, name: p.n, s: p.s, x: p.x, y: p.y, f: p.f, h: p.h, p: p.p, b: p.b, samples: [{ t: now, x: p.x, y: p.y }] };
  }

  private onMessage(msg: ServerMsg | null): void {
    if (!msg) return;
    const now = performance.now();
    const R = bridge.remotes;
    switch (msg.t) {
      case 'welcome':
      case 'here':
        if (msg.t === 'welcome') useNet.setState({ muted: false }); // a 'muted' message follows if the teacher muted you
        R.clear();
        useNet.setState({ says: {} });
        for (const p of msg.players) R.set(p.id, this.remote(p, now));
        break;
      case 'join':
        R.set(msg.p.id, this.remote(msg.p, now));
        break;
      case 'leave':
        R.delete(msg.id);
        useNet.setState((n) => {
          const { [msg.id]: _gone, ...says } = n.says;
          return { says, open: n.open === msg.id ? null : n.open };
        });
        break;
      case 'state':
        for (const [id, x, y, f] of msg.m) {
          const r = R.get(id);
          if (!r) continue;
          addSample(r.samples, { t: now, x, y });
          Object.assign(r, { x, y, f });
        }
        return; // positions only: the list of people didn't change
      case 'look': {
        const r = R.get(msg.id);
        if (r) Object.assign(r, { h: msg.h, p: msg.p, b: msg.b });
        break;
      }
      case 'say':
        if (R.has(msg.id)) useNet.setState((n) => ({ says: { ...n.says, [msg.id]: { k: msg.k, i: msg.i, at: Date.now() } } }));
        return;
      case 'muted':
        useNet.setState({ muted: msg.on });
        return;
      case 'reported':
        useNet.setState((n) => ({ reported: [...n.reported, msg.id] }));
        return;
      case 'goal':
        publishGoal({ n: msg.n, of: msg.of });
        return;
    }
    publishPeople();
  }
}
