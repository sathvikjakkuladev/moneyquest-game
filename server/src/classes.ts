// Classes, class codes, and students joining with a public name (never free text).
import { isClassCode, makeClassCode, normalizeCode } from '../../src/net/codes.ts';
import { isGeneratedName, isListName, nameChoices } from '../../src/net/names.ts';
import { requireTeacher } from './auth.ts';
import { cryptoRandom, newToken, randomBytes, sha256 } from './crypto.ts';
import type { Env } from './env.ts';
import { bearer, clientIp, HttpError, readJson, str } from './http.ts';
import { hit, limitFor, LIMITS } from './limits.ts';
import type { RoomAdmin } from './ClassRoom.ts';

export const MAX_LIST_NAMES = 60;
export const MAX_MEMBERS = 60;

interface ClassRow { id: string; code: string; name: string; names_mode: 'generated' | 'list'; world_mode: number; teacher_id: string }

/** Class names are written by teachers: printable, 1–40 characters, no angle brackets. */
export const validClassName = (s: string) => s.length >= 1 && s.length <= 40 && /^[^\p{C}<>]+$/u.test(s);

function listNames(body: Record<string, unknown>): string[] | null {
  if (body.names === undefined) return null;
  if (!Array.isArray(body.names) || body.names.length > MAX_LIST_NAMES) throw new HttpError(400, 'bad-names', `Name lists can have up to ${MAX_LIST_NAMES} names.`);
  const out = [...new Set(body.names.map((n) => (typeof n === 'string' ? n.trim().replace(/\s+/g, ' ') : '')))];
  const bad = out.find((n) => !isListName(n));
  if (bad !== undefined) throw new HttpError(400, 'bad-names', `"${bad.slice(0, 20)}" can't be used: names are 2–16 letters, numbers and spaces.`);
  return out;
}

// ---------- Teacher side ----------

export async function listClasses(req: Request, env: Env, now: number) {
  const t = await requireTeacher(req, env, now);
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.code, c.name, c.names_mode, c.world_mode, c.created_at, (SELECT COUNT(*) FROM members m WHERE m.class_id = c.id) AS members
     FROM classes c WHERE c.teacher_id = ? ORDER BY c.created_at`,
  ).bind(t.id).all<ClassRow & { created_at: number; members: number }>();
  return { classes: results.map((c) => ({ id: c.id, code: c.code, name: c.name, namesMode: c.names_mode, worldMode: !!c.world_mode, members: c.members })) };
}

export async function createClass(req: Request, env: Env, now: number) {
  const t = await requireTeacher(req, env, now);
  const body = await readJson(req);
  const name = str(body, 'name', 40).trim();
  if (!validClassName(name)) throw new HttpError(400, 'bad-name', 'Class names are 1–40 characters.');
  const names = listNames(body);
  const mode = names && names.length ? 'list' : 'generated';
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM classes WHERE teacher_id = ?').bind(t.id).first<{ n: number }>();
  if ((count?.n ?? 0) >= 20) throw new HttpError(400, 'too-many', 'You can have up to 20 classes.');
  const id = crypto.randomUUID();
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = makeClassCode(randomBytes);
    try {
      await env.DB.batch([
        env.DB.prepare('INSERT INTO classes (id, teacher_id, code, name, names_mode, created_at, last_active) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, t.id, code, name, mode, now, now),
        ...(names ?? []).map((n) => env.DB.prepare('INSERT INTO class_names (class_id, name) VALUES (?, ?)').bind(id, n)),
      ]);
      return { class: { id, code, name, namesMode: mode, worldMode: false, members: 0 } };
    } catch (e) {
      if (!String(e).includes('UNIQUE')) throw e; // code clash: try another
    }
  }
  throw new HttpError(500, 'no-code', 'Couldn’t make a class code. Try again.');
}

async function ownClass(env: Env, teacherId: string, classId: string): Promise<ClassRow> {
  const c = await env.DB.prepare('SELECT id, code, name, names_mode, world_mode, teacher_id FROM classes WHERE id = ? AND teacher_id = ?').bind(classId, teacherId).first<ClassRow>();
  if (!c) throw new HttpError(404, 'no-class', 'Class not found.');
  return c;
}

/** Replace the class's name list (an empty list switches back to generated names). */
export async function setNames(req: Request, env: Env, now: number, classId: string) {
  const t = await requireTeacher(req, env, now);
  await ownClass(env, t.id, classId);
  const names = listNames(await readJson(req)) ?? [];
  await env.DB.batch([
    env.DB.prepare('DELETE FROM class_names WHERE class_id = ?').bind(classId),
    ...names.map((n) => env.DB.prepare('INSERT INTO class_names (class_id, name) VALUES (?, ?)').bind(classId, n)),
    env.DB.prepare('UPDATE classes SET names_mode = ?, last_active = ? WHERE id = ?').bind(names.length ? 'list' : 'generated', now, classId),
  ]);
  return { ok: true, namesMode: names.length ? 'list' : 'generated' };
}

/** Delete a class and everything in it (members, progress, goals, reports). Anyone playing is disconnected. */
export async function deleteClass(req: Request, env: Env, now: number, classId: string) {
  const t = await requireTeacher(req, env, now);
  await ownClass(env, t.id, classId);
  await env.DB.prepare('DELETE FROM classes WHERE id = ?').bind(classId).run();
  await roomAdmin(env, classId, { kind: 'kick', memberId: null });
  return { ok: true };
}

/**
 * Tell the class's live room about a teacher action, so it applies at once. D1 is already updated,
 * so if the room can't be reached the action still holds: it's checked again on every connect.
 */
export async function roomAdmin(env: Env, classId: string, cmd: RoomAdmin): Promise<void> {
  if (!env.CLASSROOM) return;
  try {
    await env.CLASSROOM.get(env.CLASSROOM.idFromName(classId)).fetch('https://room/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  } catch (e) {
    console.error('room admin', e);
  }
}

interface ReportRow { id: string; created_at: number; history: string; target_id: string | null; target_name: string | null; reporter_name: string | null }

/** One class: its students (public names only) and the reports about them that are still open. */
export async function classDetail(req: Request, env: Env, now: number, classId: string) {
  const t = await requireTeacher(req, env, now);
  const c = await ownClass(env, t.id, classId);
  const [members, reports] = await Promise.all([
    env.DB.prepare('SELECT id, public_name, muted, created_at, last_seen FROM members WHERE class_id = ? ORDER BY public_name')
      .bind(classId).all<{ id: string; public_name: string; muted: number; created_at: number; last_seen: number }>(),
    env.DB.prepare(
      `SELECT r.id, r.created_at, r.history, r.target_id, t.public_name AS target_name, m.public_name AS reporter_name
       FROM reports r LEFT JOIN members t ON t.id = r.target_id LEFT JOIN members m ON m.id = r.reporter_id
       WHERE r.target_class = ? AND r.resolved = 0 ORDER BY r.created_at DESC LIMIT 100`,
    ).bind(classId).all<ReportRow>(),
  ]);
  return {
    class: { id: c.id, code: c.code, name: c.name, namesMode: c.names_mode, worldMode: !!c.world_mode },
    members: members.results.map((m) => ({ id: m.id, name: m.public_name, muted: !!m.muted, joined: m.created_at, lastSeen: m.last_seen })),
    reports: reports.results.map((r) => ({ id: r.id, at: r.created_at, targetId: r.target_id, target: r.target_name, reporter: r.reporter_name, history: safeHistory(r.history) })),
  };
}

function safeHistory(s: string): unknown[] {
  try {
    const v: unknown = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

async function ownMember(env: Env, classId: string, memberId: string): Promise<void> {
  const m = await env.DB.prepare('SELECT 1 AS ok FROM members WHERE id = ? AND class_id = ?').bind(memberId, classId).first();
  if (!m) throw new HttpError(404, 'no-member', 'That student isn’t in this class any more.');
}

/** Teacher mute: the student's emotes and phrases stop reaching anyone. They can still play and move. */
export async function muteMember(req: Request, env: Env, now: number, classId: string, memberId: string) {
  const t = await requireTeacher(req, env, now);
  await ownClass(env, t.id, classId);
  await ownMember(env, classId, memberId);
  const body = await readJson(req);
  if (typeof body.muted !== 'boolean') throw new HttpError(400, 'bad-request', 'Bad request.');
  await env.DB.prepare('UPDATE members SET muted = ? WHERE id = ?').bind(body.muted ? 1 : 0, memberId).run();
  await roomAdmin(env, classId, { kind: 'mute', memberId, on: body.muted });
  return { ok: true, muted: body.muted };
}

/** Remove a student from the class: their membership and progress are deleted, and they're disconnected now. */
export async function removeMember(req: Request, env: Env, now: number, classId: string, memberId: string) {
  const t = await requireTeacher(req, env, now);
  await ownClass(env, t.id, classId);
  await ownMember(env, classId, memberId);
  await env.DB.prepare('DELETE FROM members WHERE id = ?').bind(memberId).run();
  await roomAdmin(env, classId, { kind: 'kick', memberId });
  return { ok: true };
}

/** Close a report (it's deleted with the rest after 90 days). */
export async function resolveReport(req: Request, env: Env, now: number, classId: string, reportId: string) {
  const t = await requireTeacher(req, env, now);
  await ownClass(env, t.id, classId);
  const r = await env.DB.prepare('UPDATE reports SET resolved = 1 WHERE id = ? AND target_class = ?').bind(reportId, classId).run();
  if (!r.meta.changes) throw new HttpError(404, 'no-report', 'Report not found.');
  return { ok: true };
}

// ---------- Student side ----------

async function classByCode(req: Request, env: Env, now: number, raw: string): Promise<ClassRow> {
  const code = normalizeCode(raw);
  if (!(await hit(env.DB, `join:${clientIp(req)}`, now, limitFor(env, LIMITS.join)))) throw new HttpError(429, 'slow-down', 'Too many tries. Wait a few minutes and try again.');
  const c = isClassCode(code) ? await env.DB.prepare('SELECT id, code, name, names_mode, world_mode, teacher_id FROM classes WHERE code = ?').bind(code).first<ClassRow>() : null;
  if (!c) throw new HttpError(404, 'no-class', 'There’s no class with that code. Check it with your teacher.');
  return c;
}

async function takenNames(env: Env, classId: string): Promise<Set<string>> {
  const { results } = await env.DB.prepare('SELECT public_name FROM members WHERE class_id = ?').bind(classId).all<{ public_name: string }>();
  return new Set(results.map((r) => r.public_name));
}

/** Step 1: check the code and offer public names to pick from. */
export async function joinOptions(req: Request, env: Env, now: number) {
  const c = await classByCode(req, env, now, str(await readJson(req), 'code', 20));
  const taken = await takenNames(env, c.id);
  let choices: string[];
  if (c.names_mode === 'list') {
    const { results } = await env.DB.prepare('SELECT name FROM class_names WHERE class_id = ? ORDER BY name').bind(c.id).all<{ name: string }>();
    choices = results.map((r) => r.name).filter((n) => !taken.has(n));
  } else choices = nameChoices(cryptoRandom, taken, 4);
  return { className: c.name, classCode: c.code, namesMode: c.names_mode, choices };
}

/** Step 2: join with the chosen name. Returns the device's membership token (stored only as a hash). */
export async function joinConfirm(req: Request, env: Env, now: number) {
  const body = await readJson(req);
  const c = await classByCode(req, env, now, str(body, 'code', 20));
  const name = str(body, 'name', 24);
  const ok = c.names_mode === 'list'
    ? !!(await env.DB.prepare('SELECT 1 AS ok FROM class_names WHERE class_id = ? AND name = ?').bind(c.id, name).first())
    : isGeneratedName(name);
  if (!ok) throw new HttpError(400, 'bad-name', 'Please pick one of the names shown.');
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM members WHERE class_id = ?').bind(c.id).first<{ n: number }>();
  if ((n?.n ?? 0) >= MAX_MEMBERS) throw new HttpError(400, 'class-full', 'This class is full. Ask your teacher.');
  const token = newToken('m');
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO members (id, class_id, token_hash, public_name, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), c.id, await sha256(token), name, now, now),
      env.DB.prepare('UPDATE classes SET last_active = ? WHERE id = ?').bind(now, c.id),
    ]);
  } catch {
    throw new HttpError(409, 'name-taken', 'Someone just took that name. Pick another one.');
  }
  return { token, publicName: name, className: c.name, classCode: c.code };
}

export interface Member { id: string; class_id: string; public_name: string; muted: number; class_name: string; class_code: string; world_mode: number }

/** The student behind a membership token, or a 401 (removed, token reset, or class deleted). */
export async function requireMember(req: Request, env: Env): Promise<Member> {
  const token = bearer(req);
  if (!token?.startsWith('m_')) throw new HttpError(401, 'not-member', 'Not in a class.');
  const m = await env.DB.prepare(
    `SELECT m.id, m.class_id, m.public_name, m.muted, c.name AS class_name, c.code AS class_code, c.world_mode
     FROM members m JOIN classes c ON c.id = m.class_id WHERE m.token_hash = ?`,
  ).bind(await sha256(token)).first<Member>();
  if (!m) throw new HttpError(401, 'not-member', 'Not in a class.');
  return m;
}

export async function memberMe(req: Request, env: Env, now: number) {
  const m = await requireMember(req, env);
  await env.DB.batch([
    env.DB.prepare('UPDATE members SET last_seen = ? WHERE id = ?').bind(now, m.id),
    env.DB.prepare('UPDATE classes SET last_active = ? WHERE id = ?').bind(now, m.class_id),
  ]);
  return { publicName: m.public_name, className: m.class_name, classCode: m.class_code, worldMode: !!m.world_mode };
}

/** A student leaves the class: their membership and progress summaries are deleted. */
export async function leave(req: Request, env: Env) {
  const m = await requireMember(req, env);
  await env.DB.prepare('DELETE FROM members WHERE id = ?').bind(m.id).run();
  return { ok: true };
}
