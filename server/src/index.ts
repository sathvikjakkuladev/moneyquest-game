// MoneyQuest multiplayer server (Cloudflare Worker). JSON API under /api/*, WebSockets under /ws/*
// (Phase 2). Every request is checked against the origin allowlist; see PLAN.md §10.
import { changePassword, login, logout, me, signup } from './auth.ts';
import { createClass, deleteClass, joinConfirm, joinOptions, leave, listClasses, memberMe, setNames } from './classes.ts';
import type { Env } from './env.ts';
import { corsHeaders, HttpError, json, originAllowed } from './http.ts';
import { purge } from './retention.ts';

type Handler = (req: Request, env: Env, now: number, ...params: string[]) => Promise<unknown>;

const ROUTES: [string, RegExp, Handler][] = [
  ['POST', /^\/api\/teacher\/signup$/, signup],
  ['POST', /^\/api\/teacher\/login$/, login],
  ['POST', /^\/api\/teacher\/logout$/, (r, e) => logout(r, e)],
  ['GET', /^\/api\/teacher\/me$/, me],
  ['POST', /^\/api\/teacher\/password$/, changePassword],
  ['GET', /^\/api\/teacher\/classes$/, listClasses],
  ['POST', /^\/api\/teacher\/classes$/, createClass],
  ['PUT', /^\/api\/teacher\/classes\/([0-9a-f-]{36})\/names$/, setNames],
  ['DELETE', /^\/api\/teacher\/classes\/([0-9a-f-]{36})$/, deleteClass],
  ['POST', /^\/api\/join$/, joinOptions],
  ['POST', /^\/api\/join\/confirm$/, joinConfirm],
  ['GET', /^\/api\/me$/, memberMe],
  ['POST', /^\/api\/leave$/, (r, e) => leave(r, e)],
];

export async function handle(req: Request, env: Env, now = Date.now()): Promise<Response> {
  const url = new URL(req.url);
  const origin = req.headers.get('Origin');
  const allowed = originAllowed(origin, env);
  const cors = allowed ? corsHeaders(origin!) : {};

  if (url.pathname === '/api/health' && req.method === 'GET') return json({ ok: true }, 200, cors);
  // Browsers always send Origin on these requests; anything else (other sites, forms) is refused.
  if (!allowed) return json({ error: 'origin', message: 'Not allowed.' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (url.pathname.startsWith('/ws/')) return json({ error: 'not-yet', message: 'Not available yet.' }, 404, cors);

  // CSRF defence in depth: state changes must be JSON (a plain HTML form can't send that).
  if ((req.method === 'POST' || req.method === 'PUT') && !(req.headers.get('Content-Type') ?? '').startsWith('application/json'))
    return json({ error: 'content-type', message: 'Bad request.' }, 415, cors);

  for (const [method, re, fn] of ROUTES) {
    const m = re.exec(url.pathname);
    if (!m || method !== req.method) continue;
    try {
      return json(await fn(req, env, now, ...m.slice(1)), 200, cors);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code, message: e.message }, e.status, cors);
      console.error('server error', e);
      return json({ error: 'server', message: 'Something went wrong. Try again.' }, 500, cors);
    }
  }
  return json({ error: 'not-found', message: 'Not found.' }, 404, cors);
}

export default {
  fetch: (req: Request, env: Env) => handle(req, env),
  scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(purge(env.DB, Date.now()).then((n) => console.log('retention', JSON.stringify(n))));
  },
} satisfies ExportedHandler<Env>;
