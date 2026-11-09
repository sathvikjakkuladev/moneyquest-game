// The NHSQA admin account (its email is the ADMIN_EMAIL secret): teacher password resets. MoneyQuest
// never sends email, so a teacher who forgets their password asks the admin, who gets a one-time
// temporary password to pass on. The teacher must change it at their next login.
import { requireTeacher } from './auth.ts';
import { hashPassword, newSalt, PBKDF2_ITERATIONS, randomBytes } from './crypto.ts';
import { makeClassCode } from '../../src/net/codes.ts';
import type { Env } from './env.ts';
import { HttpError } from './http.ts';

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
