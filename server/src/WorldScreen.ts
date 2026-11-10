// One Durable Object per world screen shard (`<zone>/<screen>#<shard>`): players from classes with
// world mode on. Like ClassRoom it uses the hibernation API, keeps each socket's state in its
// attachment, and answers pings without waking up. Entry is checked against D1 on every connect:
// the class must have world mode on and the student mustn't be blocked by the admin.
import { DurableObject } from 'cloudflare:workers';
import { BATCH_MS, CLOSE, MAX_MESSAGE, parseClient } from '../../src/net/protocol.ts';
import { SHARD_CAP, worldName } from '../../src/net/world.ts';
import { sha256 } from './crypto.ts';
import type { Env } from './env.ts';
import type { Out } from './hub.ts';
import type { WConn } from './worldHub.ts';
import { WorldHub } from './worldHub.ts';

interface Attachment { pid: number; screen: string; conn: WConn | null }

/** Sent by the Worker when world mode is switched off for a class, or a student is blocked. */
export type WorldAdmin = { kind: 'kick'; memberId?: string; classId?: string };

const HELLO_TIMEOUT_MS = 5000;

export class WorldScreen extends DurableObject<Env> {
  hub: WorldHub | null = null;
  timer: ReturnType<typeof setTimeout> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
    for (const ws of ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (!a) continue;
      this.hub ??= new WorldHub(a.screen);
      if (a.conn) this.hub.restore(a.conn);
      else this.hub.reserve(a.pid);
    }
  }

  override async fetch(req: Request): Promise<Response> {
    // Only the Worker can send this: it forwards nothing but /ws/world/... upgrades to a world screen.
    if (new URL(req.url).pathname === '/admin' && req.method === 'POST' && req.headers.get('Upgrade') === null) return this.admin((await req.json()) as WorldAdmin);
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    const screen = req.headers.get('X-World-Screen') ?? '';
    this.hub ??= new WorldHub(screen);
    const { 0: client, 1: server } = new WebSocketPair();
    const pid = this.hub.newPid();
    this.ctx.acceptWebSocket(server, [String(pid)]);
    server.serializeAttachment({ pid, screen, conn: null } satisfies Attachment);
    // A full shard: the game tries the next one.
    if (this.ctx.getWebSockets().length > SHARD_CAP) this.close(server, CLOSE.full, 'This screen is busy');
    else
      setTimeout(() => {
        const a = server.deserializeAttachment() as Attachment | null;
        if (a && !a.conn) this.close(server, CLOSE.badHello, 'Say hello first');
      }, HELLO_TIMEOUT_MS);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    if (typeof data !== 'string' || data.length > MAX_MESSAGE) return this.close(ws, CLOSE.policy, 'Message too big');
    const a = ws.deserializeAttachment() as Attachment;
    const hub = (this.hub ??= new WorldHub(a.screen));
    const msg = parseClient(data);
    const now = Date.now();

    if (!a.conn) {
      if (!msg || msg.t !== 'hello' || msg.s !== a.screen) return this.close(ws, CLOSE.badHello, 'Say hello first');
      const m = await this.env.DB.prepare(
        `SELECT m.id, m.class_id, m.public_name, m.muted, m.world_muted, c.world_mode FROM members m JOIN classes c ON c.id = m.class_id WHERE m.token_hash = ?`,
      ).bind(await sha256(msg.token)).first<{ id: string; class_id: string; public_name: string; muted: number; world_muted: number; world_mode: number }>();
      if (!m) return this.close(ws, CLOSE.notMember, 'Not in a class');
      if (!m.world_mode || m.world_muted) return this.close(ws, CLOSE.noWorld, 'World mode is off');
      // One connection per student here too.
      for (const other of this.ctx.getWebSockets()) {
        const oa = other.deserializeAttachment() as Attachment | null;
        if (other !== ws && oa?.conn?.memberId === m.id) {
          this.send(hub.leave(oa.pid));
          this.close(other, CLOSE.replaced, 'Opened somewhere else');
        }
      }
      const out = hub.hello(a.pid, { id: m.id, class_id: m.class_id, name: worldName(m.id, m.public_name), muted: m.muted }, msg, now);
      this.saveAll();
      this.send(out);
      return;
    }

    const r = hub.handle(a.pid, msg, now);
    this.saveConn(ws, a);
    this.send(r.out);
    if (r.close) return this.close(ws, CLOSE.policy, 'Too many bad messages');
    if (r.report) {
      // World reports go to the NHSQA admin view and to both students' teachers.
      await this.env.DB.prepare('INSERT INTO reports (id, reporter_id, reporter_class, target_id, target_class, world, history, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)')
        .bind(crypto.randomUUID(), a.conn.memberId, a.conn.classId, r.report.targetMemberId, r.report.targetClassId, JSON.stringify(r.report.history), now)
        .run();
    }
    if (hub.dirty.size && !this.timer) this.timer = setTimeout(() => this.flush(), BATCH_MS);
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    this.drop(ws);
    this.close(ws, code === 1005 || code === 1006 ? 1000 : code, 'Bye');
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.drop(ws);
  }

  private admin(cmd: WorldAdmin): Response {
    const hub = this.hub;
    if (hub && cmd.kind === 'kick') {
      for (const pid of hub.pidsOf(cmd)) {
        const ws = this.ctx.getWebSockets(String(pid))[0];
        this.send(hub.leave(pid));
        if (ws) this.close(ws, CLOSE.noWorld, 'World mode is off');
      }
      this.saveAll();
    }
    return new Response(null, { status: 204 });
  }

  private drop(ws: WebSocket): void {
    const a = ws.deserializeAttachment() as Attachment | null;
    if (a && this.hub) {
      this.send(this.hub.leave(a.pid));
      this.saveAll();
    }
  }

  private flush(): void {
    this.timer = null;
    if (!this.hub) return;
    this.send(this.hub.flush());
    this.saveAll();
  }

  /** Who-sees-whom changes for everyone at once, so every attachment is saved again. */
  private saveAll(): void {
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a) this.saveConn(ws, a);
    }
  }

  private saveConn(ws: WebSocket, a: Attachment): void {
    ws.serializeAttachment({ ...a, conn: this.hub?.conns.get(a.pid) ?? null });
  }

  private send(out: Out[]): void {
    for (const o of out) {
      const ws = this.ctx.getWebSockets(String(o.to))[0];
      try {
        ws?.send(JSON.stringify(o.msg));
      } catch {
        /* closing */
      }
    }
  }

  private close(ws: WebSocket, code: number, reason: string): void {
    try {
      ws.close(code, reason);
    } catch {
      /* already closed */
    }
  }
}
