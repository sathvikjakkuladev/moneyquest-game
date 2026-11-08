import { describe, expect, it } from 'vitest';
import { isClassCode } from '../../src/net/codes.ts';
import { isGeneratedName } from '../../src/net/names.ts';
import { hashPassword, newSalt, sameString } from '../src/crypto.ts';
import { originAllowed } from '../src/http.ts';
import { limitFor, LIMITS } from '../src/limits.ts';
import { handle } from '../src/index.ts';
import { CLASS_IDLE_MS, purge, REPORT_MS } from '../src/retention.ts';
import { ORIGIN, testEnv } from './d1.ts';
import type { Env } from '../src/env.ts';

const T0 = Date.UTC(2026, 10, 7);
type Body = Record<string, unknown>;

/** Call the worker like a browser on the game's origin would. */
async function call(env: Env, method: string, path: string, body?: Body, token?: string, now = T0, headers: Record<string, string> = {}) {
  const res = await handle(
    new Request(`https://mp.nhsqa.org${path}`, {
      method,
      headers: { Origin: ORIGIN, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), 'CF-Connecting-IP': '203.0.113.9', ...headers },
      body: body ? JSON.stringify(body) : undefined,
    }),
    env,
    now,
  );
  return { status: res.status, body: (await res.json()) as Body, headers: res.headers };
}

async function teacherWithClass(env: Env, opts: Body = {}) {
  const s = await call(env, 'POST', '/api/teacher/signup', { email: 'ms.rivera@school.org', password: 'correct horse battery' });
  const token = s.body.token as string;
  const c = await call(env, 'POST', '/api/teacher/classes', { name: 'Room 12', ...opts }, token);
  return { token, cls: c.body.class as { id: string; code: string; namesMode: string } };
}

describe('origin allowlist', () => {
  const env = { ALLOWED_ORIGINS: 'https://nhsqa.org,http://localhost:5173', PREVIEW_ORIGIN_PATTERN: '' };
  it('allows exact origins only, never anything else', () => {
    expect(originAllowed('https://nhsqa.org', env)).toBe(true);
    expect(originAllowed('http://localhost:5173', env)).toBe(true);
    for (const o of [null, '', 'https://evil.org', 'https://nhsqa.org.evil.org', 'http://nhsqa.org', 'https://NHSQA.org', 'null']) expect(originAllowed(o, env), String(o)).toBe(false);
  });
  it('preview pattern (staging only) is anchored and https only', () => {
    const st = { ...env, PREVIEW_ORIGIN_PATTERN: 'https://moneyquest-game-[a-z0-9-]+-team\\.vercel\\.app' };
    expect(originAllowed('https://moneyquest-game-abc123-team.vercel.app', st)).toBe(true);
    expect(originAllowed('https://moneyquest-game-abc123-team.vercel.app.evil.org', st)).toBe(false);
    expect(originAllowed('https://x.moneyquest-game-abc-team.vercel.app', st)).toBe(false);
    expect(originAllowed('https://other-abc-team.vercel.app', st)).toBe(false);
    expect(originAllowed('https://a', { ...env, PREVIEW_ORIGIN_PATTERN: '(' })).toBe(false); // bad pattern: refuse
  });
  it('refuses API calls from other origins and plain form posts; CORS echoes only allowed origins', async () => {
    const env2 = testEnv();
    expect((await call(env2, 'POST', '/api/teacher/login', { email: 'a@b.co', password: 'x' }, undefined, T0, { Origin: 'https://evil.org' })).status).toBe(403);
    const form = await handle(new Request('https://mp.nhsqa.org/api/teacher/login', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'email=a' }), env2, T0);
    expect(form.status).toBe(415);
    const ok = await call(env2, 'GET', '/api/health');
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const pre = await handle(new Request('https://mp.nhsqa.org/api/join', { method: 'OPTIONS', headers: { Origin: 'https://evil.org' } }), env2, T0);
    expect(pre.status).toBe(403);
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('passwords', () => {
  it('PBKDF2 + pepper: same input same hash; different salt, pepper or password differ', async () => {
    const salt = newSalt();
    const a = await hashPassword('correct horse battery', salt, 1000, 'p');
    expect(sameString(a, await hashPassword('correct horse battery', salt, 1000, 'p'))).toBe(true);
    expect(a).not.toBe(await hashPassword('correct horse battery', newSalt(), 1000, 'p'));
    expect(a).not.toBe(await hashPassword('correct horse battery', salt, 1000, 'q'));
    expect(a).not.toBe(await hashPassword('correct horse batterz', salt, 1000, 'p'));
  });
});

describe('teacher accounts', () => {
  it('sign up, log in, see yourself, log out; wrong passwords lock after 5 tries', async () => {
    const env = testEnv();
    const s = await call(env, 'POST', '/api/teacher/signup', { email: 'Ms.Rivera@School.org', password: 'correct horse battery' });
    expect(s.status).toBe(200);
    expect(String(s.body.token)).toMatch(/^t_/);
    expect((await call(env, 'POST', '/api/teacher/signup', { email: 'ms.rivera@school.org', password: 'another long pass' })).status).toBe(409);
    expect((await call(env, 'POST', '/api/teacher/signup', { email: 'x@y.org', password: 'short' })).status).toBe(400);

    const l = await call(env, 'POST', '/api/teacher/login', { email: 'ms.rivera@school.org', password: 'correct horse battery' });
    expect(l.status).toBe(200);
    const tok = l.body.token as string;
    expect((await call(env, 'GET', '/api/teacher/me', undefined, tok)).body).toEqual({ teacher: { email: 'Ms.Rivera@School.org', admin: false, mustChange: false } });
    expect((await call(env, 'GET', '/api/teacher/me', undefined, tok, T0 + 13 * 3600_000)).status).toBe(401); // sessions last 12 hours
    await call(env, 'POST', '/api/teacher/logout', {}, tok);
    expect((await call(env, 'GET', '/api/teacher/me', undefined, tok)).status).toBe(401);

    for (let i = 0; i < 5; i++) expect((await call(env, 'POST', '/api/teacher/login', { email: 'ms.rivera@school.org', password: 'nope nope nope' })).status).toBe(401);
    expect((await call(env, 'POST', '/api/teacher/login', { email: 'ms.rivera@school.org', password: 'correct horse battery' })).status).toBe(429);
    expect((await call(env, 'POST', '/api/teacher/login', { email: 'ms.rivera@school.org', password: 'correct horse battery' }, undefined, T0 + 16 * 60_000, { 'CF-Connecting-IP': '198.51.100.1' })).status).toBe(200);
  });
  it('the admin is whoever signs up with ADMIN_EMAIL (a secret)', async () => {
    const env = testEnv();
    const s = await call(env, 'POST', '/api/teacher/signup', { email: 'admin@nhsqa.org', password: 'correct horse battery' });
    expect((s.body.teacher as Body).admin).toBe(true);
  });
  it('a student token is never accepted as a teacher session', async () => {
    const env = testEnv();
    const { cls } = await teacherWithClass(env);
    const opts = await call(env, 'POST', '/api/join', { code: cls.code });
    const j = await call(env, 'POST', '/api/join/confirm', { code: cls.code, name: (opts.body.choices as string[])[0] });
    expect((await call(env, 'GET', '/api/teacher/classes', undefined, j.body.token as string)).status).toBe(401);
  });
});

describe('classes and joining', () => {
  it('teacher makes a class with a readable code; a student joins with a generated name', async () => {
    const env = testEnv();
    const { token, cls } = await teacherWithClass(env);
    expect(isClassCode(cls.code)).toBe(true);
    expect(cls.namesMode).toBe('generated');

    const opts = await call(env, 'POST', '/api/join', { code: ` ${cls.code.slice(0, 3).toLowerCase()}-${cls.code.slice(3)} ` }); // typed loosely
    expect(opts.status).toBe(200);
    const choices = opts.body.choices as string[];
    expect(choices).toHaveLength(4);
    expect(choices.every(isGeneratedName)).toBe(true);
    expect(opts.body.className).toBe('Room 12');

    const j = await call(env, 'POST', '/api/join/confirm', { code: cls.code, name: choices[1] });
    expect(j.status).toBe(200);
    expect(String(j.body.token)).toMatch(/^m_/);
    expect(j.body.publicName).toBe(choices[1]);
    // Free text is refused; so is a taken name.
    expect((await call(env, 'POST', '/api/join/confirm', { code: cls.code, name: 'IAmFreeText' })).status).toBe(400);
    expect((await call(env, 'POST', '/api/join/confirm', { code: cls.code, name: choices[1] })).status).toBe(409);

    const me = await call(env, 'GET', '/api/me', undefined, j.body.token as string);
    expect(me.body).toEqual({ publicName: choices[1], className: 'Room 12', classCode: cls.code, worldMode: false });
    const list = await call(env, 'GET', '/api/teacher/classes', undefined, token);
    expect((list.body.classes as Body[])[0]).toMatchObject({ code: cls.code, members: 1, worldMode: false });

    // Leaving deletes the membership; the token stops working.
    await call(env, 'POST', '/api/leave', {}, j.body.token as string);
    expect((await call(env, 'GET', '/api/me', undefined, j.body.token as string)).status).toBe(401);
  });
  it('teacher name lists: students pick from the list only, each name once', async () => {
    const env = testEnv();
    const { token, cls } = await teacherWithClass(env, { names: ['Owl 01', 'Owl 02', 'Owl 02'] });
    expect(cls.namesMode).toBe('list');
    const opts = await call(env, 'POST', '/api/join', { code: cls.code });
    expect(opts.body.choices).toEqual(['Owl 01', 'Owl 02']);
    expect((await call(env, 'POST', '/api/join/confirm', { code: cls.code, name: 'BraveOtter42' })).status).toBe(400);
    expect((await call(env, 'POST', '/api/join/confirm', { code: cls.code, name: 'Owl 02' })).status).toBe(200);
    expect((await call(env, 'POST', '/api/join', { code: cls.code })).body.choices).toEqual(['Owl 01']);
    expect((await call(env, 'PUT', `/api/teacher/classes/${cls.id}/names`, { names: ['<script>'] }, token)).status).toBe(400);
    expect((await call(env, 'PUT', `/api/teacher/classes/${cls.id}/names`, { names: [] }, token)).body.namesMode).toBe('generated');
  });
  it('only local development (wrangler dev) loosens the limits', () => {
    expect(limitFor({ ENVIRONMENT: 'production' }, LIMITS.login).max).toBe(5);
    expect(limitFor({ ENVIRONMENT: 'staging' }, LIMITS.join).max).toBe(20);
    expect(limitFor({ ENVIRONMENT: 'development' }, LIMITS.login).max).toBe(250);
  });
  it('wrong codes are rate-limited per IP', async () => {
    const env = testEnv();
    for (let i = 0; i < 20; i++) expect((await call(env, 'POST', '/api/join', { code: 'ZZZZZZ' })).status).toBe(404);
    expect((await call(env, 'POST', '/api/join', { code: 'ZZZZZZ' })).status).toBe(429);
  });
  it('deleting a class deletes its members; other teachers can’t touch it', async () => {
    const env = testEnv();
    const { token, cls } = await teacherWithClass(env);
    const opts = await call(env, 'POST', '/api/join', { code: cls.code });
    const j = await call(env, 'POST', '/api/join/confirm', { code: cls.code, name: (opts.body.choices as string[])[0] });
    const other = await call(env, 'POST', '/api/teacher/signup', { email: 'other@school.org', password: 'correct horse battery' }, undefined, T0, { 'CF-Connecting-IP': '192.0.2.4' });
    expect((await call(env, 'DELETE', `/api/teacher/classes/${cls.id}`, undefined, other.body.token as string)).status).toBe(404);
    expect((await call(env, 'DELETE', `/api/teacher/classes/${cls.id}`, undefined, token)).status).toBe(200);
    expect((await call(env, 'GET', '/api/me', undefined, j.body.token as string)).status).toBe(401);
  });
});

describe('teacher controls', () => {
  /** A stand-in for the class rooms: records what the Worker tells them. */
  function rooms() {
    const calls: { classId: string; body: unknown }[] = [];
    const ns = {
      idFromName: (n: string) => n,
      get: (id: string) => ({ fetch: async (_u: string, init: { body: string }) => (calls.push({ classId: id, body: JSON.parse(init.body) }), new Response(null, { status: 204 })) }),
    };
    return { ns: ns as unknown as DurableObjectNamespace, calls };
  }
  async function classWithStudent() {
    const r = rooms();
    const env = testEnv({ CLASSROOM: r.ns });
    const { token, cls } = await teacherWithClass(env);
    const opts = await call(env, 'POST', '/api/join', { code: cls.code });
    const name = (opts.body.choices as string[])[0]!;
    const j = await call(env, 'POST', '/api/join/confirm', { code: cls.code, name });
    const d = await call(env, 'GET', `/api/teacher/classes/${cls.id}`, undefined, token);
    const member = (d.body.members as { id: string; name: string; muted: boolean }[])[0]!;
    return { env, token, cls, name, member, studentToken: j.body.token as string, calls: r.calls };
  }

  it('the class view lists students by public name only', async () => {
    const { name, member, env, token, cls } = await classWithStudent();
    expect(member).toMatchObject({ name, muted: false });
    expect(Object.keys(member).sort()).toEqual(['id', 'joined', 'lastSeen', 'muted', 'name']);
    expect((await call(env, 'GET', `/api/teacher/classes/${cls.id}`, undefined, token)).body.reports).toEqual([]);
  });
  it('mute is saved and sent to the live room at once', async () => {
    const { env, token, cls, member, calls } = await classWithStudent();
    const r = await call(env, 'POST', `/api/teacher/classes/${cls.id}/members/${member.id}/mute`, { muted: true }, token);
    expect(r.body).toEqual({ ok: true, muted: true });
    expect(calls).toEqual([{ classId: cls.id, body: { kind: 'mute', memberId: member.id, on: true } }]);
    expect(await env.DB.prepare('SELECT muted FROM members WHERE id = ?').bind(member.id).first()).toEqual({ muted: 1 });
    expect((await call(env, 'POST', `/api/teacher/classes/${cls.id}/members/${member.id}/mute`, { muted: 'yes' }, token)).status).toBe(400);
  });
  it('removing a student deletes the membership and disconnects them', async () => {
    const { env, token, cls, member, calls, studentToken } = await classWithStudent();
    expect((await call(env, 'DELETE', `/api/teacher/classes/${cls.id}/members/${member.id}`, undefined, token)).status).toBe(200);
    expect(calls).toEqual([{ classId: cls.id, body: { kind: 'kick', memberId: member.id } }]);
    expect((await call(env, 'GET', '/api/me', undefined, studentToken)).status).toBe(401);
    expect((await call(env, 'DELETE', `/api/teacher/classes/${cls.id}/members/${member.id}`, undefined, token)).status).toBe(404);
  });
  it('another teacher can’t see, mute or remove your students', async () => {
    const { env, cls, member } = await classWithStudent();
    const other = (await call(env, 'POST', '/api/teacher/signup', { email: 'other@school.org', password: 'correct horse battery' }, undefined, T0, { 'CF-Connecting-IP': '192.0.2.4' })).body.token as string;
    expect((await call(env, 'GET', `/api/teacher/classes/${cls.id}`, undefined, other)).status).toBe(404);
    expect((await call(env, 'POST', `/api/teacher/classes/${cls.id}/members/${member.id}/mute`, { muted: true }, other)).status).toBe(404);
    expect((await call(env, 'DELETE', `/api/teacher/classes/${cls.id}/members/${member.id}`, undefined, other)).status).toBe(404);
    // A student id from another class doesn't work through your own class either.
    const theirs = (await call(env, 'POST', '/api/teacher/classes', { name: 'Room 9' }, other)).body.class as { id: string };
    expect((await call(env, 'POST', `/api/teacher/classes/${theirs.id}/members/${member.id}/mute`, { muted: true }, other)).status).toBe(404);
    expect((await call(env, 'DELETE', `/api/teacher/classes/${theirs.id}/members/${member.id}`, undefined, other)).status).toBe(404);
    expect(await env.DB.prepare('SELECT muted FROM members WHERE id = ?').bind(member.id).first()).toEqual({ muted: 0 });
  });
  it('reports show up for the teacher with the phrase numbers, and can be closed', async () => {
    const { env, token, cls, member, name } = await classWithStudent();
    const history = [{ kind: 'phrase', i: 6, at: T0, screen: 'piggybank_village/plaza' }];
    await env.DB.prepare('INSERT INTO reports (id, reporter_id, reporter_class, target_id, target_class, history, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind('0b5c6a2e-0000-4000-8000-000000000001', member.id, cls.id, member.id, cls.id, JSON.stringify(history), T0).run();
    const d = await call(env, 'GET', `/api/teacher/classes/${cls.id}`, undefined, token);
    expect(d.body.reports).toEqual([{ id: '0b5c6a2e-0000-4000-8000-000000000001', at: T0, targetId: member.id, target: name, reporter: name, history }]);
    expect((await call(env, 'POST', `/api/teacher/classes/${cls.id}/reports/0b5c6a2e-0000-4000-8000-000000000001/resolve`, {}, token)).status).toBe(200);
    expect((await call(env, 'GET', `/api/teacher/classes/${cls.id}`, undefined, token)).body.reports).toEqual([]);
  });
  it('deleting a class disconnects everyone in it', async () => {
    const { env, token, cls, calls } = await classWithStudent();
    await call(env, 'DELETE', `/api/teacher/classes/${cls.id}`, undefined, token);
    expect(calls).toEqual([{ classId: cls.id, body: { kind: 'kick', memberId: null } }]);
  });
});

describe('retention', () => {
  it('deletes classes idle for 12 months (with their members), reports after 90 days, expired sessions', async () => {
    const env = testEnv();
    const { cls } = await teacherWithClass(env);
    const opts = await call(env, 'POST', '/api/join', { code: cls.code });
    await call(env, 'POST', '/api/join/confirm', { code: cls.code, name: (opts.body.choices as string[])[0] });
    await env.DB.prepare('INSERT INTO reports (id, reporter_class, created_at) VALUES (?, ?, ?)').bind('r1', cls.id, T0).run();

    let n = await purge(env.DB, T0 + REPORT_MS - 1000);
    expect(n).toMatchObject({ classes: 0, reports: 0, sessions: 1 });
    n = await purge(env.DB, T0 + REPORT_MS + 1000);
    expect(n.reports).toBe(1);
    n = await purge(env.DB, T0 + CLASS_IDLE_MS + 1000);
    expect(n.classes).toBe(1);
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM members').first()).toEqual({ n: 0 });
  });
});
