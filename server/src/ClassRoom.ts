// One Durable Object per class: the class's WebSockets, using the hibernation API so an idle class
// costs nothing. Each socket's state lives in its attachment, so it survives hibernation; pings are
// answered automatically without waking the object.
import { DurableObject } from 'cloudflare:workers';
import { CLOSE, MAX_MESSAGE, parseClient, BATCH_MS } from '../../src/net/protocol.ts';
import { sha256 } from './crypto.ts';
import type { Env } from './env.ts';
import type { Conn, Member, Out } from './hub.ts';
import { Hub } from './hub.ts';

interface Attachment { pid: number; classId: string; opened: number; conn: Conn | null }

const HELLO_TIMEOUT_MS = 5000;

export class ClassRoom extends DurableObject<Env> {
  hub = new Hub();
  timer: ReturnType<typeof setTimeout> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
    for (const ws of ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a?.conn) this.hub.restore(a.conn);
      else if (a) this.hub.reserve(a.pid); // still saying hello: keep its id unique
    }
  }

  override async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    const classId = req.headers.get('X-Class-Id') ?? '';
    const { 0: client, 1: server } = new WebSocketPair();
    const pid = this.hub.newPid();
    this.ctx.acceptWebSocket(server, [String(pid)]);
    server.serializeAttachment({ pid, classId, opened: Date.now(), conn: null } satisfies Attachment);
    setTimeout(() => {
      const a = server.deserializeAttachment() as Attachment | null;
      if (a && !a.conn) this.close(server, CLOSE.badHello, 'Say hello first');
    }, HELLO_TIMEOUT_MS);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    if (typeof data !== 'string' || data.length > MAX_MESSAGE) return this.close(ws, CLOSE.policy, 'Message too big');
    const a = ws.deserializeAttachment() as Attachment;
    const msg = parseClient(data);
    const now = Date.now();

    if (!a.conn) {
      if (!msg || msg.t !== 'hello') return this.close(ws, CLOSE.badHello, 'Say hello first');
      const m = await this.env.DB.prepare('SELECT id, public_name, muted FROM members WHERE token_hash = ? AND class_id = ?').bind(await sha256(msg.token), a.classId).first<Member>();
      if (!m) return this.close(ws, CLOSE.notMember, 'Not in this class');
      // One connection per student: a new one (another tab or device) replaces the old.
      for (const other of this.ctx.getWebSockets()) {
        const oa = other.deserializeAttachment() as Attachment | null;
        if (other !== ws && oa?.conn?.memberId === m.id) {
          this.send(this.hub.leave(oa.pid));
          this.close(other, CLOSE.replaced, 'Opened somewhere else');
        }
      }
      const out = this.hub.hello(a.pid, m, msg, now);
      a.conn = this.hub.conns.get(a.pid)!;
      ws.serializeAttachment(a);
      this.send(out);
      await this.env.DB.prepare('UPDATE members SET last_seen = ? WHERE id = ?').bind(now, m.id).run();
      return;
    }

    const r = this.hub.handle(a.pid, msg, now);
    a.conn = this.hub.conns.get(a.pid) ?? null;
    ws.serializeAttachment(a);
    this.send(r.out);
    if (r.close) return this.close(ws, CLOSE.policy, 'Too many bad messages');
    if (this.hub.dirty.size && !this.timer) this.timer = setTimeout(() => this.flush(), BATCH_MS);
  }

  override async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    this.drop(ws);
    this.close(ws, code === 1005 || code === 1006 ? 1000 : code, 'Bye');
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.drop(ws);
  }

  private drop(ws: WebSocket): void {
    const a = ws.deserializeAttachment() as Attachment | null;
    if (a) this.send(this.hub.leave(a.pid));
  }

  private flush(): void {
    this.timer = null;
    this.send(this.hub.flush());
  }

  private send(out: Out[]): void {
    for (const o of out) {
      const ws = this.ctx.getWebSockets(String(o.to))[0];
      try {
        ws?.send(JSON.stringify(o.msg));
      } catch {
        /* closing: the close handler tidies up */
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
