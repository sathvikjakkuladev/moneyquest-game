// The NHSQA admin account (its email is the ADMIN_EMAIL secret): teacher password resets, and
// world-mode reports (blocking a student from world mode). MoneyQuest
// never sends email, so a teacher who forgets their password asks the admin, who gets a one-time
// temporary password to pass on. The teacher must change it at their next login.
import { requireTeacher } from './auth.ts';
import { worldName } from '../../src/net/world.ts';
import { setWorld } from './world.ts';
import { hashPassword, newSalt, PBKDF2_ITERATIONS, randomBytes } from './crypto.ts';
import { makeClassCode } from '../../src/net/codes.ts';
import type { Env } from './env.ts';
import { HttpError, readJson } from './http.ts';

async function requireAdmin(req: Request, env: Env, now: number) {
  const t = await requireTeacher(req, env, now);
  if (!t.admin) throw new HttpError(404, 'not-found', 'Not found.'); // don't reveal that this exists
  return t;
}

export async function teachers(req: Request, env: Env, now: number) {
  await requireAdmin(req, env, now);
  const { results } = await env.DB.prepare(
    `SELECT t.id, t.email, t.created_at, t.last_login, (SELECT COUNT(*) FROM classes c WHERE c.teacher_id = t.id) AS classes
     FROM teachers t ORDER BY t.email LIMIT 500`,
  ).all<{ id: string; email: string; created_at: number; last_login: number | null; classes: number }>();
  return { teachers: results.map((t) => ({ id: t.id, email: t.email, created: t.created_at, lastLogin: t.last_login, classes: t.classes })) };
}

/** A new temporary password (shown once). The teacher's sessions end and they must pick a new one. */
export async function resetPassword(req: Request, env: Env, now: number, teacherId: string) {
  await requireAdmin(req, env, now);
  const t = await env.DB.prepare('SELECT id FROM teachers WHERE id = ?').bind(teacherId).first<{ id: string }>();
  if (!t) throw new HttpError(404, 'no-teacher', 'Teacher not found.');
  const temp = makeClassCode(randomBytes, 16); // about 78 bits, from the easy-to-read alphabet
  const salt = newSalt();
  const hash = await hashPassword(temp, salt, PBKDF2_ITERATIONS, env.PEPPER);
  await env.DB.batch([
    env.DB.prepare('UPDATE teachers SET pass_hash = ?, salt = ?, iterations = ?, must_change = 1 WHERE id = ?').bind(hash, salt, PBKDF2_ITERATIONS, teacherId),
    env.DB.prepare('DELETE FROM sessions WHERE teacher_id = ?').bind(teacherId),
  ]);
  return { tempPassword: temp };
}

/** Open world-mode reports, newest first, with each student's world name and their teacher's email. */
export async function worldReports(req: Request, env: Env, now: number) {
  await requireAdmin(req, env, now);
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.created_at, r.history, r.target_id, t.public_name AS target_name, t.world_muted AS blocked, tt.email AS target_teacher, ct.name AS target_class,
            r.reporter_id, m.public_name AS reporter_name, tr.email AS reporter_teacher
     FROM reports r
     LEFT JOIN members t ON t.id = r.target_id LEFT JOIN classes ct ON ct.id = r.target_class LEFT JOIN teachers tt ON tt.id = ct.teacher_id
     LEFT JOIN members m ON m.id = r.reporter_id LEFT JOIN classes cr ON cr.id = r.reporter_class LEFT JOIN teachers tr ON tr.id = cr.teacher_id
     WHERE r.world = 1 AND r.resolved = 0 ORDER BY r.created_at DESC LIMIT 200`,
  ).all<{ id: string; created_at: number; history: string; target_id: string | null; target_name: string | null; blocked: number | null; target_teacher: string | null; target_class: string | null; reporter_id: string | null; reporter_name: string | null; reporter_teacher: string | null }>();
  const hist = (s: string) => {
    try {
      const v: unknown = JSON.parse(s);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };
  return {
    reports: results.map((r) => ({
      id: r.id, at: r.created_at, history: hist(r.history),
      target: r.target_id && r.target_name ? { id: r.target_id, name: worldName(r.target_id, r.target_name), blocked: !!r.blocked, teacher: r.target_teacher, className: r.target_class } : null,
      reporter: r.reporter_id && r.reporter_name ? { name: worldName(r.reporter_id, r.reporter_name), teacher: r.reporter_teacher } : null,
    })),
  };
}

export async function resolveWorldReport(req: Request, env: Env, now: number, reportId: string) {
  await requireAdmin(req, env, now);
  const r = await env.DB.prepare('UPDATE reports SET resolved = 1 WHERE id = ? AND world = 1').bind(reportId).run();
  if (!r.meta.changes) throw new HttpError(404, 'no-report', 'Report not found.');
  return { ok: true };
}

/** Block (or unblock) one student from world mode. They keep playing with their class. */
export async function worldBlock(req: Request, env: Env, now: number, memberId: string) {
  await requireAdmin(req, env, now);
  const body = await readJson(req);
  if (typeof body.blocked !== 'boolean') throw new HttpError(400, 'bad-request', 'Bad request.');
  const m = await env.DB.prepare('SELECT class_id FROM members WHERE id = ?').bind(memberId).first<{ class_id: string }>();
  if (!m) throw new HttpError(404, 'no-member', 'That student isn’t in a class any more.');
  await env.DB.prepare('UPDATE members SET world_muted = ? WHERE id = ?').bind(body.blocked ? 1 : 0, memberId).run();
  const on = await env.DB.prepare('SELECT world_mode FROM classes WHERE id = ?').bind(m.class_id).first<{ world_mode: number }>();
  await setWorld(env, m.class_id, memberId, !body.blocked && !!on?.world_mode);
  return { ok: true, blocked: body.blocked };
}
