// Load test: one class of simulated players moving around a screen, to measure real traffic and
// project the cost. Run against local dev or staging, never production:
//   node scripts/load.ts --url http://localhost:8787 --origin http://localhost:5173 --players 30 --minutes 5
// It signs up a throwaway teacher, makes a class, joins the players, plays, then deletes the class.
import { parseArgs } from 'node:util';

const { values: a } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:8787' },
    origin: { type: 'string', default: 'http://localhost:5173' },
    players: { type: 'string', default: '30' },
    minutes: { type: 'string', default: '5' },
    moving: { type: 'string', default: '0.3' }, // share of players walking at any moment
  },
});
const URL_ = a.url!.replace(/\/+$/, ''), ORIGIN = a.origin!, N = Number(a.players), MINUTES = Number(a.minutes), MOVING = Number(a.moving);
if (/mp\.nhsqa\.org/.test(URL_)) throw new Error('Not against production.');

async function api(method: string, path: string, body?: object, token?: string) {
  const r = await fetch(URL_ + path, { method, headers: { Origin: ORIGIN, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`);
  return (await r.json()) as Record<string, unknown>;
}

const SCREEN = 'piggybank_village/plaza';
const stats = { sent: 0, moves: 0, says: 0, received: 0, receivedBytes: 0, connects: 0, closes: 0 };

interface Bot { ws: WebSocket; x: number; y: number; tx: number; ty: number; walking: boolean; lastSent: number }

function bot(token: string, code: string): Promise<Bot> {
  return new Promise((resolve, reject) => {
    // Node's WebSocket (undici) accepts headers, so the Origin check is exercised like a browser's.
    const ws = new WebSocket(`${URL_.replace(/^http/, 'ws')}/ws/class/${code}`, { headers: { Origin: ORIGIN } } as unknown as string[]);
    const b: Bot = { ws, x: 100 + Math.random() * 440, y: 120 + Math.random() * 200, tx: 0, ty: 0, walking: false, lastSent: 0 };
    ws.addEventListener('open', () => {
      stats.connects++;
      ws.send(JSON.stringify({ t: 'hello', token, s: SCREEN, x: Math.round(b.x), y: Math.round(b.y), f: 0, h: null, p: null, b: false }));
      stats.sent++;
      resolve(b);
    });
    ws.addEventListener('message', (e: MessageEvent) => void (stats.received++, (stats.receivedBytes += String(e.data).length)));
    ws.addEventListener('close', () => void stats.closes++);
    ws.addEventListener('error', () => reject(new Error('socket error')));
  });
}

const t = (await api('POST', '/api/teacher/signup', { email: `load-${Date.now()}@example.test`, password: 'load test password' })).token as string;
const cls = (await api('POST', '/api/teacher/classes', { name: 'Load test' }, t)).class as { id: string; code: string };
console.log(`class ${cls.code}: joining ${N} players…`);
const bots: Bot[] = [];
for (let i = 0; i < N; i++) {
  const o = await api('POST', '/api/join', { code: cls.code });
  const j = await api('POST', '/api/join/confirm', { code: cls.code, name: (o.choices as string[])[0] });
  bots.push(await bot(j.token as string, cls.code));
}

const TICK = 50, SPEED = 120, MOVE_MS = 250;
const start = Date.now(), end = start + MINUTES * 60_000;
let last = start;
const timer = setInterval(() => {
  const now = Date.now(), dt = (now - last) / 1000;
  last = now;
  for (const b of bots) {
    if (Math.random() < 0.01) b.walking = Math.random() < MOVING, (b.tx = 40 + Math.random() * 560), (b.ty = 80 + Math.random() * 260);
    if (!b.walking) continue;
    const dx = b.tx - b.x, dy = b.ty - b.y, d = Math.hypot(dx, dy);
    if (d < 3) { b.tx = 40 + Math.random() * 560; b.ty = 80 + Math.random() * 260; continue; } // keep walking somewhere new
    const step = Math.min(d, SPEED * dt);
    b.x += (dx / d) * step;
    b.y += (dy / d) * step;
    if (now - b.lastSent >= MOVE_MS && b.ws.readyState === WebSocket.OPEN) {
      b.ws.send(JSON.stringify({ t: 'move', x: Math.round(b.x), y: Math.round(b.y), f: Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 3 : 2) : dy < 0 ? 1 : 0 }));
      b.lastSent = now;
      stats.sent++;
      stats.moves++;
    }
  }
  if (Math.random() < N / (20_000 / TICK)) { // about one emote or phrase per player every 20 s
    const b = bots[Math.floor(Math.random() * N)]!;
    if (b.ws.readyState === WebSocket.OPEN) b.ws.send(JSON.stringify({ t: 'say', k: 'p', i: 0 })), stats.sent++, stats.says++;
  }
}, TICK);

await new Promise((r) => setTimeout(r, end - Date.now()));
clearInterval(timer);
for (const b of bots) b.ws.close(1000, 'done');
await new Promise((r) => setTimeout(r, 1000));
await api('DELETE', `/api/teacher/classes/${cls.id}`, undefined, t);

// Cloudflare bills incoming WebSocket messages to a Durable Object at 20:1 against requests (check
// current pricing before relying on this); connections count as one request each.
const minutes = (Date.now() - start) / 60_000;
const billed = stats.connects + stats.sent / 20;
const per30 = (billed / minutes) * 30;
console.log(JSON.stringify({ players: N, minutes: +minutes.toFixed(2), ...stats, closesBeforeEnd: stats.closes - N, billedRequests: Math.round(billed), billedPer30MinSession: Math.round(per30), target: 13_500 }, null, 2));
console.log(per30 <= 13_500 ? 'Within the 13,500-requests-per-session target.' : 'OVER the 13,500-requests-per-session target.');
