// Teacher accounts: email + password (no email is ever sent; the NHSQA admin resets passwords).
// Sessions are bearer tokens (see PLAN.md §10 "Teacher login across sites"); D1 stores only a hash.
import { hashPassword, newSalt, newToken, PBKDF2_ITERATIONS, sameString, sha256 } from './crypto.ts';
import type { Env } from './env.ts';
import { bearer, clientIp, HttpError, readJson, str } from './http.ts';
import { clear, hit, LIMITS, lockedFor } from './limits.ts';

export const SESSION_MS = 12 * 60 * 60_000;

export interface Teacher { id: string; email: string; must_change: number }

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[A-Za-z]{2,24}$/;
export const validEmail = (s: string) => s.length <= 254 && EMAIL.test(s);
export const validPassword = (s: string) => s.length >= 10 && s.length <= 200;

export const isAdmin = (env: Env, email: string) => !!env.ADMIN_EMAIL && env.ADMIN_EMAIL.trim().toLowerCase() === email.toLowerCase();

async function newSession(env: Env, teacherId: string, now: number): Promise<string> {
  const token = newToken('t');
  await env.DB.prepare('INSERT INTO sessions (token_hash, teacher_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(await sha256(token), teacherId, now, now + SESSION_MS).run();
  return token;
}

const view = (env: Env, t: Pick<Teacher, 'email' | 'must_change'>) => ({ email: t.email, admin: isAdmin(env, t.email), mustChange: !!t.must_change });

export async function signup(req: Request, env: Env, now: number) {
  const body = await readJson(req);
  const email = str(body, 'email', 254).trim();
  const password = str(body, 'password', 200);
  if (!validEmail(email)) throw new HttpError(400, 'bad-email', 'Please enter a valid email address.');
  if (!validPassword(password)) throw new HttpError(400, 'bad-password', 'Passwords need at least 10 characters.');
  if (!(await hit(env.DB, `signup:${clientIp(req)}`, now, LIMITS.signup))) throw new HttpError(429, 'slow-down', 'Too many sign-ups from here. Try again later.');
  const salt = newSalt();
  const id = crypto.randomUUID();
  const hash = await hashPassword(password, salt, PBKDF2_ITERATIONS, env.PEPPER);
  try {
    await env.DB.prepare('INSERT INTO teachers (id, email, pass_hash, salt, iterations, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, email, hash, salt, PBKDF2_ITERATIONS, now, now).run();
  } catch {
    throw new HttpError(409, 'email-taken', 'An account with that email already exists. Try logging in.');
  }
  return { token: await newSession(env, id, now), teacher: view(env, { email, must_change: 0 }) };
}

export async function login(req: Request, env: Env, now: number) {
  const body = await readJson(req);
  const email = str(body, 'email', 254).trim().toLowerCase();
  const password = str(body, 'password', 200);
  const keys = [`login:email:${email}`, `login:ip:${clientIp(req)}`];
  for (const k of keys) if (await lockedFor(env.DB, k, now)) throw new HttpError(429, 'locked', 'Too many wrong passwords. Wait 15 minutes and try again.');
  const t = await env.DB.prepare('SELECT id, email, pass_hash, salt, iterations, must_change FROM teachers WHERE email = ?').bind(email).first<Teacher & { pass_hash: string; salt: string; iterations: number }>();
  // Hash even when there's no such account, so timing doesn't reveal which emails exist.
  const hash = await hashPassword(password, t?.salt ?? 'AAAAAAAAAAAAAAAAAAAAAA', t?.iterations ?? PBKDF2_ITERATIONS, env.PEPPER);
  if (!t || !sameString(hash, t.pass_hash)) {
    for (const k of keys) await hit(env.DB, k, now, LIMITS.login);
    throw new HttpError(401, 'wrong-login', 'That email and password don’t match.');
  }
  await clear(env.DB, keys[0]!);
  await env.DB.prepare('UPDATE teachers SET last_login = ? WHERE id = ?').bind(now, t.id).run();
  return { token: await newSession(env, t.id, now), teacher: view(env, t) };
}

/** The signed-in teacher, or a 401. */
export async function requireTeacher(req: Request, env: Env, now: number): Promise<Teacher & { admin: boolean }> {
  const token = bearer(req);
  if (!token?.startsWith('t_')) throw new HttpError(401, 'signed-out', 'Please log in again.');
  const t = await env.DB.prepare('SELECT t.id, t.email, t.must_change FROM sessions s JOIN teachers t ON t.id = s.teacher_id WHERE s.token_hash = ? AND s.expires_at > ?')
    .bind(await sha256(token), now)
    .first<Teacher>();
  if (!t) throw new HttpError(401, 'signed-out', 'Please log in again.');
  return { ...t, admin: isAdmin(env, t.email) };
}

export async function me(req: Request, env: Env, now: number) {
  return { teacher: view(env, await requireTeacher(req, env, now)) };
}

export async function logout(req: Request, env: Env) {
  const token = bearer(req);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  return { ok: true };
}

/** Change your own password (required after an admin reset). Ends your other sessions. */
export async function changePassword(req: Request, env: Env, now: number) {
  const t = await requireTeacher(req, env, now);
  const body = await readJson(req);
  const password = str(body, 'password', 200);
  if (!validPassword(password)) throw new HttpError(400, 'bad-password', 'Passwords need at least 10 characters.');
  const salt = newSalt();
  const hash = await hashPassword(password, salt, PBKDF2_ITERATIONS, env.PEPPER);
  const keep = await sha256(bearer(req)!);
  await env.DB.batch([
    env.DB.prepare('UPDATE teachers SET pass_hash = ?, salt = ?, iterations = ?, must_change = 0 WHERE id = ?').bind(hash, salt, PBKDF2_ITERATIONS, t.id),
    env.DB.prepare('DELETE FROM sessions WHERE teacher_id = ? AND token_hash != ?').bind(t.id, keep),
  ]);
  return { ok: true };
}
