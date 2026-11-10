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
import { makeCode, MAX_SERIAL } from '../../src/rewards/rewardCodes.ts';
import { worldName } from '../../src/net/world.ts';

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
  const env = { ALLOWED_ORIGINS: 'https://play.nhsqa.org,http://localhost:5173', PREVIEW_ORIGIN_PATTERN: '' };
  it('allows exact origins only, never anything else', () => {
    expect(originAllowed('https://play.nhsqa.org', env)).toBe(true);
    expect(originAllowed('http://localhost:5173', env)).toBe(true);
    for (const o of [null, '', 'https://evil.org', 'https://play.nhsqa.org.evil.org', 'http://play.nhsqa.org', 'https://PLAY.nhsqa.org', 'https://nhsqa.org', 'null']) expect(originAllowed(o, env), String(o)).toBe(false);
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
  it('a whole class can join at once from one school IP address', async () => {
    const env = testEnv();
    const { cls } = await teacherWithClass(env);
    for (let i = 0; i < 30; i++) {
      const o = await call(env, 'POST', '/api/join', { code: cls.code });
      expect(o.status, `student ${i}`).toBe(200);
      expect((await call(env, 'POST', '/api/join/confirm', { code: cls.code, name: (o.body.choices as string[])[0] })).status).toBe(200);
    }
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

/** A stand-in for the class rooms: records what the Worker tells them, and answers "who's online". */
function rooms(online: { memberId: string; screen: string; busy: boolean }[] = []) {
  const calls: { classId: string; body: unknown }[] = [];
  const ns = {
    idFromName: (n: string) => n,
    get: (id: string) => ({
      fetch: async (_u: string, init: { body: string }) => {
        const body = JSON.parse(init.body) as { kind: string };
        if (body.kind === 'roster') return Response.json({ online });
        calls.push({ classId: id, body });
        return new Response(null, { status: 204 });
      },
    }),
  };
  return { ns: ns as unknown as DurableObjectNamespace, calls, online };
}

describe('teacher controls', () => {
  /** A stand-in for the class rooms: records what the Worker tells them. */
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
    expect(Object.keys(member).sort()).toEqual(['deviceCodeWaiting', 'id', 'joined', 'lastSeen', 'muted', 'name', 'online', 'progress']);
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
    expect(d.body.reports).toEqual([{ id: '0b5c6a2e-0000-4000-8000-000000000001', at: T0, world: false, targetId: member.id, target: name, reporter: name, history }]);
    expect((await call(env, 'POST', `/api/teacher/classes/${cls.id}/reports/0b5c6a2e-0000-4000-8000-000000000001/resolve`, {}, token)).status).toBe(200);
    expect((await call(env, 'GET', `/api/teacher/classes/${cls.id}`, undefined, token)).body.reports).toEqual([]);
  });
  it('deleting a class disconnects everyone in it', async () => {
    const { env, token, cls, calls } = await classWithStudent();
    await call(env, 'DELETE', `/api/teacher/classes/${cls.id}`, undefined, token);
    expect(calls).toEqual([{ classId: cls.id, body: { kind: 'kick', memberId: null } }]);
  });
});

describe('progress, class goal and leaderboard', () => {
  const summary = (correct: number, over: Body = {}) => ({
    level: 3, xp: 200, coinsEarned: 40, zones: ['piggybank_village'], mcForm: 'A', mcPre: null, mcPost: null,
    accuracy: { 'Spending and Saving': { answered: correct + 2, correct } }, ...over,
  });
  async function setup(n = 1) {
    const r = rooms();
    const env = testEnv({ CLASSROOM: r.ns });
    const { token, cls } = await teacherWithClass(env);
    const students: { token: string; name: string }[] = [];
    for (let i = 0; i < n; i++) {
      const opts = await call(env, 'POST', '/api/join', { code: cls.code });
      const name = (opts.body.choices as string[])[0]!;
      const j = await call(env, 'POST', '/api/join/confirm', { code: cls.code, name });
      students.push({ token: j.body.token as string, name });
    }
    return { env, token, cls, students, calls: r.calls, online: r.online };
  }
  const upload = (env: Env, t: string, s: unknown, now = T0) => call(env, 'POST', '/api/progress', { summary: s } as Body, t, now);

  it('the first upload only sets a baseline; later ones count the increase; a retry counts nothing', async () => {
    const { env, students: [a], calls } = await setup();
    expect((await upload(env, a!.token, summary(50))).body).toEqual({ goal: { n: 0, of: 300 }, counted: 0 });
    expect(calls).toEqual([]);
    expect((await upload(env, a!.token, summary(53))).body).toEqual({ goal: { n: 3, of: 300 }, counted: 3 });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toEqual({ kind: 'goal', n: 3, of: 300 });
    expect((await upload(env, a!.token, summary(53))).body).toEqual({ goal: { n: 3, of: 300 }, counted: 0 }); // the same upload again
    expect((await upload(env, a!.token, summary(10))).body).toMatchObject({ counted: 0 }); // a lower total (another save) subtracts nothing
    expect((await upload(env, a!.token, summary(12))).body).toEqual({ goal: { n: 5, of: 300 }, counted: 2 });
  });
  it('one upload adds at most 100 to the goal, and each week starts again', async () => {
    const { env, students: [a] } = await setup();
    await upload(env, a!.token, summary(0));
    expect((await upload(env, a!.token, summary(5000))).body.counted).toBe(100);
    const nextWeek = T0 + 7 * 24 * 60 * 60_000;
    expect((await upload(env, a!.token, summary(5001), nextWeek)).body).toEqual({ goal: { n: 1, of: 300 }, counted: 1 });
  });
  it('bad summaries are refused, and only members can upload', async () => {
    const { env, students: [a], token } = await setup();
    for (const bad of [
      null, { ...summary(1), level: 0 }, { ...summary(1), zones: ['nowhere'] }, { ...summary(1), xp: -1 }, { ...summary(1), coinsEarned: 1.5 },
      { ...summary(1), accuracy: { 'Made Up': { answered: 1, correct: 1 } } }, { ...summary(1), accuracy: { Investing: { answered: 1, correct: 2 } } },
      { ...summary(1), mcPre: { date: '2026-11-07', band: 'K-5', form: 'A', perTopic: {}, total: 0 } },
    ]) expect((await upload(env, a!.token, bad)).status, JSON.stringify(bad)).toBe(400);
    expect((await upload(env, token, summary(1))).status).toBe(401);
    expect((await upload(env, 'm_nope', summary(1))).status).toBe(401);
  });
  it('leaderboard: coins earned, top 10 and your own rank; the teacher can hide it', async () => {
    const { env, token, cls, students } = await setup(12);
    await Promise.all(students.map((s, i) => upload(env, s.token, summary(1, { coinsEarned: i * 10 }))));
    const last = students[0]!, best = students[11]!;
    const b = (await call(env, 'GET', '/api/class', undefined, last.token)).body.board as { top: { name: string; coins: number }[]; me: { rank: number; coins: number } };
    expect(b.top).toHaveLength(10);
    expect(b.top[0]).toEqual({ name: best.name, coins: 110 });
    expect(b.me).toEqual({ rank: 12, coins: 0 });
    expect(await call(env, 'PATCH', `/api/teacher/classes/${cls.id}`, { leaderboardHidden: true }, token).then((r) => r.status)).toBe(200);
    expect((await call(env, 'GET', '/api/class', undefined, last.token)).body.board).toBeNull();
  });
  it('the dashboard shows progress, who is online and the goal; settings are checked', async () => {
    const { env, token, cls, students: [a], online, calls } = await setup();
    const mc = { date: '2026-11-07T10:00:00Z', band: 'K-5', form: 'A', total: 7, perTopic: { 'Spending and Saving': 2, 'Credit and Debt': 1, 'Employment and Income': 1, Investing: 1, 'Risk and Insurance': 1, 'Financial Decision Making': 1 } };
    await upload(env, a!.token, summary(4, { mcPre: mc }));
    let d = (await call(env, 'GET', `/api/teacher/classes/${cls.id}`, undefined, token)).body as { goal: unknown; onlineKnown: boolean; members: { id: string; online: unknown; progress: Record<string, unknown> }[] };
    expect(d.onlineKnown).toBe(true);
    expect(d.members[0]!.progress).toMatchObject({ level: 3, coinsEarned: 40, zones: ['piggybank_village'], mcPre: mc, mcPost: null });
    expect(d.members[0]!.online).toBeNull();
    online.push({ memberId: d.members[0]!.id, screen: 'piggybank_village/plaza', busy: true });
    d = (await call(env, 'GET', `/api/teacher/classes/${cls.id}`, undefined, token)).body as typeof d;
    expect(d.members[0]!.online).toEqual({ screen: 'piggybank_village/plaza', busy: true });
    expect((await call(env, 'PATCH', `/api/teacher/classes/${cls.id}`, { goalTarget: 5 }, token)).status).toBe(400);
    expect((await call(env, 'PATCH', `/api/teacher/classes/${cls.id}`, { goalTarget: 50 }, token)).status).toBe(200);
    expect(calls.at(-1)!.body).toEqual({ kind: 'goal', n: 0, of: 50 });
  });
});

describe('device codes', () => {
  async function setup() {
    const r = rooms();
    const env = testEnv({ CLASSROOM: r.ns });
    const { token, cls } = await teacherWithClass(env);
    const opts = await call(env, 'POST', '/api/join', { code: cls.code });
    const name = (opts.body.choices as string[])[0]!;
    const j = await call(env, 'POST', '/api/join/confirm', { code: cls.code, name });
    const d = await call(env, 'GET', `/api/teacher/classes/${cls.id}`, undefined, token);
    const id = (d.body.members as { id: string }[])[0]!.id;
    return { env, token, cls, name, id, old: j.body.token as string, calls: r.calls };
  }
  const make = (env: Env, token: string, c: string, m: string) => call(env, 'POST', `/api/teacher/classes/${c}/members/${m}/device-code`, {}, token);

  it('the old device stops working and is disconnected; the code gives the new device the same name, once', async () => {
    const { env, token, cls, id, name, old, calls } = await setup();
    const code = (await make(env, token, cls.id, id)).body.code as string;
    expect(code).toHaveLength(8);
    expect(calls).toEqual([{ classId: cls.id, body: { kind: 'kick', memberId: id } }]);
    expect((await call(env, 'GET', '/api/me', undefined, old)).status).toBe(401);
    const r = await call(env, 'POST', '/api/rejoin', { code: code.toLowerCase() });
    expect(r.body).toMatchObject({ publicName: name, classCode: cls.code });
    expect((await call(env, 'GET', '/api/me', undefined, r.body.token as string)).status).toBe(200);
    expect((await call(env, 'POST', '/api/rejoin', { code })).status).toBe(404); // one use
    expect(await env.DB.prepare('SELECT COUNT(*) AS n FROM members WHERE rejoin_hash IS NOT NULL').first()).toEqual({ n: 0 });
  });
  it('codes expire after a day, are stored only as hashes, and only the teacher of the class can make one', async () => {
    const { env, token, cls, id } = await setup();
    const code = (await make(env, token, cls.id, id)).body.code as string;
    const row = await env.DB.prepare('SELECT rejoin_hash FROM members WHERE id = ?').bind(id).first<{ rejoin_hash: string }>();
    expect(row!.rejoin_hash).not.toContain(code);
    expect((await call(env, 'POST', '/api/rejoin', { code }, undefined, T0 + 24 * 60 * 60_000 + 1)).status).toBe(404);
    const other = (await call(env, 'POST', '/api/teacher/signup', { email: 'other@school.org', password: 'correct horse battery' }, undefined, T0, { 'CF-Connecting-IP': '192.0.2.4' })).body.token as string;
    expect((await make(env, other, cls.id, id)).status).toBe(404);
  });
});

describe('admin', () => {
  const signup = (env: Env, email: string, ip: string) => call(env, 'POST', '/api/teacher/signup', { email, password: 'correct horse battery' }, undefined, T0, { 'CF-Connecting-IP': ip });

  it('only the admin account can list teachers or reset passwords, and others can’t tell it exists', async () => {
    const env = testEnv();
    const t = (await signup(env, 'teacher@school.org', '192.0.2.1')).body.token as string;
    expect((await call(env, 'GET', '/api/admin/teachers', undefined, t)).status).toBe(404);
    expect((await call(env, 'GET', '/api/admin/teachers')).status).toBe(401);
  });
  it('a reset ends the teacher’s sessions, and the temporary password forces a new one', async () => {
    const env = testEnv();
    const t = (await signup(env, 'teacher@school.org', '192.0.2.1')).body.token as string;
    const a = (await signup(env, 'ADMIN@nhsqa.org', '192.0.2.2')).body.token as string;
    const list = (await call(env, 'GET', '/api/admin/teachers', undefined, a)).body.teachers as { id: string; email: string }[];
    const id = list.find((x) => x.email === 'teacher@school.org')!.id;
    const temp = (await call(env, 'POST', `/api/admin/teachers/${id}/reset`, {}, a)).body.tempPassword as string;
    expect(temp).toHaveLength(16);
    expect((await call(env, 'GET', '/api/teacher/me', undefined, t)).status).toBe(401);
    const login = await call(env, 'POST', '/api/teacher/login', { email: 'teacher@school.org', password: temp });
    expect(login.body.teacher).toMatchObject({ mustChange: true });
    expect((await call(env, 'POST', '/api/teacher/login', { email: 'teacher@school.org', password: 'correct horse battery' })).status).toBe(401);
  });
  it('with no ADMIN_EMAIL set, nobody is the admin', async () => {
    const env = testEnv({ ADMIN_EMAIL: undefined });
    const a = (await signup(env, 'admin@nhsqa.org', '192.0.2.2')).body.token as string;
    expect((await call(env, 'GET', '/api/admin/teachers', undefined, a)).status).toBe(404);
  });
});

describe('world mode', () => {
  /** Two teachers, each with a class and one student; the rooms stand-in records world switches. */
  async function twoClasses(listNames = false) {
    const calls: { ns: string; name: string; body: unknown }[] = [];
    const fake = (ns: string, reply: (b: { kind: string }) => Response) => ({
      idFromName: (n: string) => n,
      get: (name: string) => ({ fetch: async (_u: string, init: { body: string }) => { const b = JSON.parse(init.body); if (b.kind !== 'roster') calls.push({ ns, name, body: b }); return reply(b); } }),
    }) as unknown as DurableObjectNamespace;
    const env = testEnv({
      CLASSROOM: fake('class', (b) => (b.kind === 'world' ? Response.json({ screens: ['piggybank_village/plaza'] }) : b.kind === 'roster' ? Response.json({ online: [] }) : new Response(null, { status: 204 }))),
      WORLD: fake('world', () => new Response(null, { status: 204 })),
    });
    const out = [];
    for (const [i, email] of ['a@school.org', 'b@school.org'].entries()) {
      const ip = { 'CF-Connecting-IP': `192.0.2.${10 + i}` };
      const t = (await call(env, 'POST', '/api/teacher/signup', { email, password: 'correct horse battery' }, undefined, T0, ip)).body.token as string;
      const cls = (await call(env, 'POST', '/api/teacher/classes', { name: `Room ${i}`, ...(listNames && i === 1 ? { names: ['Sam Lee'] } : {}) }, t)).body.class as { id: string; code: string };
      const o = await call(env, 'POST', '/api/join', { code: cls.code });
      const name = (o.body.choices as string[])[0]!;
      const j = await call(env, 'POST', '/api/join/confirm', { code: cls.code, name });
      const id = ((await call(env, 'GET', `/api/teacher/classes/${cls.id}`, undefined, t)).body.members as { id: string }[])[0]!.id;
      out.push({ teacher: t, cls, name, token: j.body.token as string, id });
    }
    return { env, calls, a: out[0]!, b: out[1]! };
  }

  it('is off by default; the teacher’s switch tells the class live, and switching off closes world sockets', async () => {
    const { env, calls, a } = await twoClasses();
    const d = await call(env, 'GET', `/api/teacher/classes/${a.cls.id}`, undefined, a.teacher);
    expect((d.body.class as { worldMode: boolean }).worldMode).toBe(false);
    expect((await call(env, 'PATCH', `/api/teacher/classes/${a.cls.id}`, { worldMode: 'on' }, a.teacher)).status).toBe(400);
    await call(env, 'PATCH', `/api/teacher/classes/${a.cls.id}`, { worldMode: true }, a.teacher);
    expect(calls).toEqual([{ ns: 'class', name: a.cls.id, body: { kind: 'world', memberId: null, on: true } }]);
    calls.length = 0;
    await call(env, 'PATCH', `/api/teacher/classes/${a.cls.id}`, { worldMode: false }, a.teacher);
    expect(calls[0]).toEqual({ ns: 'class', name: a.cls.id, body: { kind: 'world', memberId: null, on: false } });
    expect(calls.slice(1).map((c) => c.name)).toEqual([0, 1, 2, 3].map((i) => `piggybank_village/plaza#${i}`));
    expect(calls[1]!.body).toEqual({ kind: 'kick', classId: a.cls.id });
  });
  it('the world leaderboard only includes classes with world mode on, by world name', async () => {
    const { env, a, b } = await twoClasses(true);
    const summary = (coins: number) => ({ summary: { level: 1, xp: 0, coinsEarned: coins, zones: [], mcForm: 'A', mcPre: null, mcPost: null, accuracy: {} } });
    await call(env, 'POST', '/api/progress', summary(30), a.token);
    await call(env, 'POST', '/api/progress', summary(90), b.token);
    expect((await call(env, 'GET', '/api/class', undefined, a.token)).body.worldBoard).toBeNull(); // off
    await call(env, 'PATCH', `/api/teacher/classes/${a.cls.id}`, { worldMode: true }, a.teacher);
    let w = (await call(env, 'GET', '/api/class', undefined, a.token)).body.worldBoard as { top: { name: string }[]; me: { rank: number } };
    expect(w.top.map((t) => t.name)).toEqual([a.name]); // class B hasn't switched it on
    await call(env, 'PATCH', `/api/teacher/classes/${b.cls.id}`, { worldMode: true }, b.teacher);
    w = (await call(env, 'GET', '/api/class', undefined, a.token)).body.worldBoard as typeof w;
    expect(w.top.map((t) => t.name)).toEqual([worldName(b.id, 'Sam Lee'), a.name]);
    expect(w.top[0]!.name).not.toBe('Sam Lee'); // a teacher's list name never shows outside the class
    expect(w.me.rank).toBe(2);
  });
  it('world reports reach both teachers (other class by world name only) and the admin, who can block', async () => {
    const { env, a, b, calls } = await twoClasses(true);
    const history = [{ kind: 'phrase', i: 6, at: T0, screen: 'piggybank_village/plaza' }];
    await env.DB.prepare('INSERT INTO reports (id, reporter_id, reporter_class, target_id, target_class, world, history, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)')
      .bind('0b5c6a2e-0000-4000-8000-0000000000aa', a.id, a.cls.id, b.id, b.cls.id, JSON.stringify(history), T0).run();
    const forA = (await call(env, 'GET', `/api/teacher/classes/${a.cls.id}`, undefined, a.teacher)).body.reports as { target: string; targetId: string | null; world: boolean }[];
    expect(forA).toEqual([expect.objectContaining({ world: true, target: worldName(b.id, 'Sam Lee'), targetId: null, reporter: a.name })]);
    const forB = (await call(env, 'GET', `/api/teacher/classes/${b.cls.id}`, undefined, b.teacher)).body.reports as { target: string; targetId: string }[];
    expect(forB[0]).toMatchObject({ target: 'Sam Lee', targetId: b.id, reporter: a.name });
    const admin = (await call(env, 'POST', '/api/teacher/signup', { email: 'admin@nhsqa.org', password: 'correct horse battery' }, undefined, T0, { 'CF-Connecting-IP': '192.0.2.99' })).body.token as string;
    expect((await call(env, 'GET', '/api/admin/reports', undefined, a.teacher)).status).toBe(404);
    const list = (await call(env, 'GET', '/api/admin/reports', undefined, admin)).body.reports as { id: string; target: { id: string; name: string; teacher: string; blocked: boolean } }[];
    expect(list[0]!.target).toMatchObject({ id: b.id, name: worldName(b.id, 'Sam Lee'), teacher: 'b@school.org', blocked: false });
    calls.length = 0;
    expect((await call(env, 'POST', `/api/admin/members/${b.id}/world`, { blocked: true }, admin)).status).toBe(200);
    expect(calls[0]).toEqual({ ns: 'class', name: b.cls.id, body: { kind: 'world', memberId: b.id, on: false } });
    expect(calls[1]!.body).toEqual({ kind: 'kick', memberId: b.id });
    await call(env, 'PATCH', `/api/teacher/classes/${b.cls.id}`, { worldMode: true }, b.teacher);
    expect((await call(env, 'GET', '/api/class', undefined, b.token)).body.worldBoard).toBeNull(); // still blocked
    expect((await call(env, 'POST', `/api/admin/reports/${list[0]!.id}/resolve`, {}, admin)).status).toBe(200);
    expect((await call(env, 'GET', '/api/admin/reports', undefined, admin)).body.reports).toEqual([]);
  });
});

describe('world sockets', () => {
  it('only real screens and shards 0–3 are routed; other origins are refused', async () => {
    const seen: string[] = [];
    const env = testEnv({ WORLD: { idFromName: (n: string) => n, get: (n: string) => ({ fetch: async () => (seen.push(n), new Response(null, { status: 204 })) }) } as unknown as DurableObjectNamespace });
    const ws = (path: string, origin = ORIGIN) => handle(new Request(`https://mp.nhsqa.org${path}`, { headers: { Origin: origin, Upgrade: 'websocket' } }), env, T0);
    expect((await ws('/ws/world/piggybank_village/plaza/0')).status).toBe(204);
    expect(seen).toEqual(['piggybank_village/plaza#0']);
    for (const bad of ['/ws/world/piggybank_village/secret/0', '/ws/world/piggybank_village/plaza/4', '/ws/world/../plaza/0', '/ws/world/piggybank_village/plaza']) expect((await ws(bad)).status, bad).toBe(404);
    expect((await ws('/ws/world/piggybank_village/plaza/0', 'https://evil.org')).status).toBe(403);
  });
});

describe('reward cards, once across all devices', () => {
  it('a valid card works once; made-up codes are refused and rate-limited', async () => {
    const env = testEnv();
    const code = makeCode('W', MAX_SERIAL); // a serial that was never printed
    expect((await call(env, 'POST', '/api/redeem', { code })).body).toMatchObject({ ok: true, reward: 'W' });
    expect((await call(env, 'POST', '/api/redeem', { code: code.toLowerCase() })).status).toBe(409); // another device
    for (let i = 0; i < 20; i++) expect((await call(env, 'POST', '/api/redeem', { code: 'MB-W1234-ABCDE' })).status).toBe(400);
    expect((await call(env, 'POST', '/api/redeem', { code: makeCode('C', MAX_SERIAL) })).status).toBe(429);
    expect(await env.DB.prepare('SELECT code FROM redemptions').all()).toMatchObject({ results: [{ code }] });
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
